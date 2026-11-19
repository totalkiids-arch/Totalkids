"use client";

import Form from "next/form";
import Link from "next/link";
import type { FormEvent } from "react";

import { Checkbox, TextField } from "@/shared/ui/form";

import { countActiveFilters, type CatalogQuery } from "../domain/catalog-query";
import { LEVELS, MATERIALS } from "../domain/product";
import { catalogHref } from "./catalog-href";
import { QueryHiddenFields } from "./query-hidden-fields";

interface CatalogFiltersProps {
  query: CatalogQuery;
  /**
   * "aside": columna de escritorio; aplica al marcar cada opción.
   * "modal": dentro del modal de móvil; aplica con el botón "Ver resultados".
   */
  variant: "aside" | "modal";
  /** Se llama después de enviar (el modal lo usa para cerrarse). */
  onApply?: () => void;
}

/** No enviar campos vacíos (evita "precio_min=" en la URL). */
function skipEmptyFields(event: FormEvent<HTMLFormElement>) {
  const emptied: HTMLInputElement[] = [];
  for (const input of event.currentTarget.querySelectorAll<HTMLInputElement>(
    "input[name^=precio_]",
  )) {
    if (input.value.trim() === "") {
      input.disabled = true;
      emptied.push(input);
    }
  }
  setTimeout(() => emptied.forEach((input) => (input.disabled = false)));
}

export function CatalogFilters({ query, variant, onApply }: CatalogFiltersProps) {
  const auto = variant === "aside";
  const active = countActiveFilters(query);

  return (
    <Form
      action="/catalogo"
      onSubmit={(event) => {
        skipEmptyFields(event);
        onApply?.();
      }}
      onChange={(event) => {
        // En escritorio, las casillas aplican al instante; los precios, al salir del campo.
        const target = event.target;
        if (auto && target instanceof HTMLInputElement && target.type === "checkbox")
          event.currentTarget.requestSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <QueryHiddenFields query={query} keep={["q", "category", "sort"]} />

      <fieldset className="flex flex-col">
        <legend className="mb-1 font-extrabold">Nivel</legend>
        {LEVELS.map((level) => (
          <Checkbox
            key={level.id}
            name="nivel"
            value={level.id}
            label={level.label}
            description={level.detail}
            defaultChecked={query.levels.includes(level.id)}
          />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-extrabold">Precio</legend>
        <div className="flex gap-2">
          <TextField
            label="Desde"
            name="precio_min"
            inputMode="numeric"
            placeholder="$ mín."
            defaultValue={query.priceMin ?? ""}
            onBlur={(e) =>
              auto &&
              e.currentTarget.value !== String(query.priceMin ?? "") &&
              e.currentTarget.form?.requestSubmit()
            }
            className="flex-1"
          />
          <TextField
            label="Hasta"
            name="precio_max"
            inputMode="numeric"
            placeholder="$ máx."
            defaultValue={query.priceMax ?? ""}
            onBlur={(e) =>
              auto &&
              e.currentTarget.value !== String(query.priceMax ?? "") &&
              e.currentTarget.form?.requestSubmit()
            }
            className="flex-1"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col">
        <legend className="mb-1 font-extrabold">Material</legend>
        {MATERIALS.map((material) => (
          <Checkbox
            key={material.slug}
            name="material"
            value={material.slug}
            label={material.label}
            defaultChecked={query.materials.includes(material.slug)}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend className="sr-only">Ofertas</legend>
        <Checkbox name="ofertas" value="1" label="Solo ofertas" defaultChecked={query.onSale} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {/* En escritorio también sirve para aplicar el precio con Enter. */}
        <button
          type="submit"
          className={`min-h-11 rounded-full bg-brand-navy px-6 font-extrabold text-white ${auto ? "text-sm" : "flex-1"}`}
        >
          {auto ? "Aplicar" : "Ver resultados"}
        </button>
        {active > 0 ? (
          <Link
            href={catalogHref(query, {
              levels: [],
              materials: [],
              priceMin: null,
              priceMax: null,
              onSale: false,
            })}
            onClick={onApply}
            className="min-h-11 content-center rounded-full px-3 font-extrabold text-brand-blue underline-offset-4 hover:underline"
          >
            Limpiar filtros ({active})
          </Link>
        ) : null}
      </div>
    </Form>
  );
}

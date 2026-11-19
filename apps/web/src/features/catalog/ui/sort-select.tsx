"use client";

import Form from "next/form";

import { SelectField } from "@/shared/ui/form";

import { SORT_OPTIONS, type CatalogQuery } from "../domain/catalog-query";
import { QueryHiddenFields } from "./query-hidden-fields";

/** Orden del listado. Aplica al cambiar; conserva búsqueda, categoría y filtros. */
export function SortSelect({ query }: { query: CatalogQuery }) {
  return (
    <Form action="/catalogo" className="flex items-center gap-2">
      <QueryHiddenFields query={query} keep={["q", "category", "filters"]} />
      <SelectField
        inline
        hideLabel="mobile"
        label="Ordenar por"
        name="orden"
        defaultValue={query.sort}
        options={SORT_OPTIONS.map((s) => ({ value: s.id, label: s.label }))}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      />
      <noscript>
        <button
          type="submit"
          className="min-h-11 rounded-full bg-brand-navy px-4 font-extrabold text-white"
        >
          Ordenar
        </button>
      </noscript>
    </Form>
  );
}

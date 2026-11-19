"use client";

import { useState } from "react";

import { ButtonLink } from "@/shared/ui/button";
import { ArrowRightIcon } from "@/shared/ui/icons";
import { SectionHeading } from "@/shared/ui/section-heading";

import { LEVELS, type LevelId, type ProductSummary } from "../domain/product";
import { ProductCard } from "./product-card";

type Filter = LevelId | "todos";

/** Productos destacados de la portada con filtro por nivel. */
export function FeaturedProducts({ products }: { products: ProductSummary[] }) {
  const [filter, setFilter] = useState<Filter>("todos");
  const visible = filter === "todos" ? products : products.filter((p) => p.levels.includes(filter));
  // Solo los niveles que tienen algún destacado: un filtro nunca deja la grilla vacía.
  const filters: { value: Filter; label: string }[] = [
    { value: "todos", label: "Todos" },
    ...LEVELS.filter((l) => products.some((p) => p.levels.includes(l.id))).map((l) => ({
      value: l.id,
      label: l.label,
    })),
  ];

  return (
    <section aria-labelledby="destacados" className="mx-auto max-w-7xl px-4 pt-14 pb-6 sm:px-6">
      <SectionHeading
        id="destacados"
        eyebrow="Lo más elegido"
        eyebrowTone="green"
        title="Productos destacados"
        aside={
          <div role="group" aria-label="Filtrar por nivel" className="flex flex-wrap gap-2">
            {filters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className="min-h-11 rounded-full border-2 border-chip-border bg-surface px-5 text-[15px] font-extrabold text-text-primary aria-pressed:border-brand-navy aria-pressed:bg-brand-navy aria-pressed:text-white"
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* aria-live anuncia el resultado del filtro a lectores de pantalla. */}
      <p aria-live="polite" className="sr-only">
        {visible.length} productos
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-6">
        {visible.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>

      <div className="flex justify-center pt-8">
        <ButtonLink href="/catalogo" variant="outline">
          Ver todo el catálogo
          <ArrowRightIcon size={18} />
        </ButtonLink>
      </div>
    </section>
  );
}

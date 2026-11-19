import Link from "next/link";

import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";

import { countActiveFilters, EMPTY_QUERY, type CatalogQuery } from "../domain/catalog-query";
import { CATEGORIES } from "../domain/product";
import { catalogHref } from "./catalog-href";

/** Estado sin resultados: explica por qué y ofrece cómo seguir. */
export function EmptyResults({ query }: { query: CatalogQuery }) {
  const filters = countActiveFilters(query);
  const reason = query.q
    ? `No encontramos productos para «${query.q}»${filters > 0 ? " con los filtros elegidos" : ""}.`
    : "Ningún producto cumple con los filtros elegidos.";
  const hint = query.q
    ? "Revisa cómo está escrito, prueba con una palabra más general (por ejemplo «mesa» o «librero») o quita algunos filtros."
    : query.priceMin !== null || query.priceMax !== null
      ? "Algunos productos todavía no tienen precio publicado y no aparecen al filtrar por precio. Prueba quitando ese filtro."
      : "Prueba quitando algunos filtros o elige otra categoría.";

  return (
    <div className="flex flex-col items-center gap-4 rounded-[28px] bg-surface px-6 py-12 text-center shadow-[0_2px_0_var(--color-border)]">
      <Tito className="w-24" />
      <h2 className="text-[28px] leading-tight font-extrabold">{reason}</h2>
      <p className="max-w-130 text-text-secondary">{hint}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        {filters > 0 ? (
          <ButtonLink
            href={catalogHref(query, {
              ages: [],
              colors: [],
              materials: [],
              priceMin: null,
              priceMax: null,
              onSale: false,
            })}
          >
            Quitar filtros
          </ButtonLink>
        ) : null}
        <ButtonLink href={catalogHref(EMPTY_QUERY)} variant="outline">
          Ver todo el catálogo
        </ButtonLink>
      </div>
      <nav aria-label="Categorías sugeridas" className="pt-4">
        <p className="mb-2 text-sm font-extrabold text-text-secondary">O explora una categoría:</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {CATEGORIES.slice(0, 5).map((c) => (
            <li key={c.slug}>
              <Link
                href={catalogHref(EMPTY_QUERY, { category: c.slug })}
                className="inline-flex min-h-11 items-center rounded-full border-2 border-chip-border px-4 text-sm font-extrabold hover:border-brand-navy"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

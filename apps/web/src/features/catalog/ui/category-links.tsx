import Link from "next/link";

import type { CatalogQuery } from "../domain/catalog-query";
import { CATEGORIES, type CategorySlug } from "../domain/product";
import { catalogHref } from "./catalog-href";

const ACTIVE: Record<CategorySlug | "todas", string> = {
  todas: "bg-brand-navy text-white",
  "mesas-y-sillas": "bg-brand-blue text-white",
  "camas-y-cunas": "bg-brand-purple text-white",
  "libreros-y-estantes": "bg-brand-green text-white",
  "organizadores-y-baules": "bg-brand-yellow text-brand-navy",
  escritorios: "bg-brand-red text-white",
  "linea-montessori": "bg-offer-ink text-white",
  "jardines-y-colegios": "bg-brand-navy text-white",
};

/** Categorías como enlaces (conservan búsqueda, filtros y orden). */
export function CategoryLinks({ query }: { query: CatalogQuery }) {
  const items = [{ slug: null, label: "Todos" }, ...CATEGORIES];
  return (
    <nav aria-label="Categorías del catálogo" className="mx-auto max-w-7xl pt-6">
      <ul className="scrollbar-none flex gap-2.5 overflow-x-auto px-4 pb-1 sm:flex-wrap sm:px-6">
        {items.map((item) => {
          const active = query.category === item.slug;
          return (
            <li key={item.slug ?? "todas"} className="shrink-0">
              <Link
                href={catalogHref(query, { category: item.slug })}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11.5 items-center rounded-full px-5 text-[15px] font-extrabold whitespace-nowrap ${
                  active
                    ? `${ACTIVE[item.slug ?? "todas"]} shadow-[0_4px_0_rgb(31_42_68/0.25)]`
                    : "border-2 border-chip-border bg-surface text-text-primary hover:border-brand-navy"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

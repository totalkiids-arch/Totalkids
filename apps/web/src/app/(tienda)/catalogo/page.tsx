import type { Metadata } from "next";

import { CatalogScreen, countActiveFilters, parseCatalogQuery } from "@/features/catalog";
import { categoryNav } from "@/shared/config/routes";

/** Nombre visible de una categoría del encabezado, para un título único por categoría. */
function categoryLabel(slug: string): string | null {
  const href = `/catalogo?categoria=${slug}`;
  return categoryNav.find((item) => item.href === href)?.label ?? null;
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/catalogo">): Promise<Metadata> {
  const query = parseCatalogQuery(await searchParams);
  const filtered = query.q !== "" || query.page > 1 || countActiveFilters(query) > 0;
  const label = query.category ? categoryLabel(query.category) : null;
  return {
    title: query.q
      ? `Resultados para «${query.q}»`
      : (label && `${label} · Catálogo`) || "Catálogo",
    description: label
      ? `${label}: mobiliario infantil de Total Kids pensado para aprender jugando.`
      : "Mesas, camas, libreros y organizadores infantiles pensados para aprender jugando.",
    // Las combinaciones de búsqueda y filtros no se indexan: solo el catálogo y sus categorías.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: query.category
        ? `/catalogo?categoria=${encodeURIComponent(query.category)}`
        : "/catalogo",
    },
  };
}

export default async function Page({ searchParams }: PageProps<"/catalogo">) {
  const query = parseCatalogQuery(await searchParams);
  return <CatalogScreen query={query} />;
}

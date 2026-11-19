import type { Metadata } from "next";

import { CatalogScreen, countActiveFilters, parseCatalogQuery } from "@/features/catalog";

export async function generateMetadata({
  searchParams,
}: PageProps<"/catalogo">): Promise<Metadata> {
  const query = parseCatalogQuery(await searchParams);
  const filtered = query.q !== "" || query.page > 1 || countActiveFilters(query) > 0;
  return {
    title: query.q ? `Resultados para «${query.q}»` : "Catálogo",
    description:
      "Mesas, camas, libreros y organizadores infantiles pensados para aprender jugando.",
    // Las combinaciones de búsqueda y filtros no se indexan: solo el catálogo y sus categorías.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ searchParams }: PageProps<"/catalogo">) {
  const query = parseCatalogQuery(await searchParams);
  return <CatalogScreen query={query} />;
}

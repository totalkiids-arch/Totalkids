import type { Route } from "next";

import { toQueryString, type CatalogQuery } from "../domain/catalog-query";

/** Enlace al catálogo con la consulta dada (más cambios). Cambiar filtros vuelve a la página 1. */
export function catalogHref(query: CatalogQuery, changes: Partial<CatalogQuery> = {}): Route {
  const next = { ...query, page: 1, ...changes };
  return `/catalogo${toQueryString(next)}` as Route;
}

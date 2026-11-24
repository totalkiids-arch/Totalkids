import "server-only";

import { randomUUID } from "node:crypto";

import { apiFetch } from "@/shared/infrastructure/api-client";

import type { ProductCatalog } from "../application/product-catalog";
import type { ProductSummary } from "../domain/product";
import {
  ApiProductDetail,
  ApiProductPage,
  pickRelated,
  toApiSearch,
  toCatalogPage,
  toDetail,
  toSummary,
} from "./store-catalog-api";

/**
 * Catálogo de la tienda desde la API pública (LN-07, sin sesión): listado con
 * búsqueda, filtros y orden, ficha, destacados y relacionados.
 *
 * - Las respuestas se guardan 60 s con la etiqueta STORE_CATALOG_TAG; el panel
 *   la invalida al editar productos, categorías o stock.
 * - No lee cabeceras de la petición (eso volvería dinámicas las páginas).
 * - Si la API no responde: el listado y la ficha lanzan (la tienda muestra su
 *   página de error, nunca precios inventados); destacados, relacionados y
 *   slugs devuelven vacío para que la portada y el build sigan funcionando.
 */
export const STORE_CATALOG_TAG = "tienda-catalogo";

const REVALIDATE_SECONDS = 60;
const TIMEOUT_MS = 4000;
/** Tope de páginas de 100 al recorrer todo el catálogo (relacionados y slugs). */
const MAX_PAGES = 20;

/** La API del catálogo no respondió o respondió algo inesperado. */
export class CatalogUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("El catálogo no está disponible", { cause });
    this.name = "CatalogUnavailableError";
  }
}

async function getJson(path: `/${string}`): Promise<unknown> {
  let response: Response;
  try {
    response = await apiFetch(`/api/v1${path}`, {
      requestId: randomUUID(),
      timeoutMs: TIMEOUT_MS,
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS, tags: [STORE_CATALOG_TAG] },
    });
  } catch (error) {
    throw new CatalogUnavailableError(error);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new CatalogUnavailableError(`API ${response.status}`);
  return response.json();
}

function parse<T>(schema: { parse(value: unknown): T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    throw new CatalogUnavailableError(error);
  }
}

/** Todo el catálogo visible en orden de más vendidos (para relacionados y slugs). */
async function listAll(): Promise<ProductSummary[]> {
  const items: ProductSummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = parse(
      ApiProductPage,
      await getJson(`/products?sort=best_selling&pageSize=100&page=${page}`),
    );
    items.push(...body.items.map(toSummary));
    if (page >= body.meta.totalPages) break;
  }
  return items;
}

async function orEmpty<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CatalogUnavailableError) return [];
    throw error;
  }
}

export const apiProductCatalog: ProductCatalog = {
  listFeatured: () =>
    orEmpty(async () => {
      const body = parse(
        ApiProductPage,
        await getJson("/products?featured=true&sort=best_selling&pageSize=12"),
      );
      return body.items.map(toSummary);
    }),

  async search(query) {
    const first = toCatalogPage(
      parse(ApiProductPage, await getJson(`/products?${toApiSearch(query)}`)),
    );
    // Una página fuera de rango muestra la última, como antes.
    if (first.items.length > 0 || first.total === 0 || query.page <= first.pageCount) return first;
    return toCatalogPage(
      parse(ApiProductPage, await getJson(`/products?${toApiSearch(query, first.pageCount)}`)),
    );
  },

  async getBySlug(slug) {
    const body = await getJson(`/products/${encodeURIComponent(slug)}`);
    return body === null ? null : toDetail(parse(ApiProductDetail, body));
  },

  listRelated: (slug, limit) => orEmpty(async () => pickRelated(await listAll(), slug, limit)),

  listSlugs: () => orEmpty(async () => (await listAll()).map((p) => p.slug)),
};

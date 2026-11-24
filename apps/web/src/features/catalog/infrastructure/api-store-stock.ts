import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { apiFetch } from "@/shared/infrastructure/api-client";

import type { StoreStock } from "../application/inventory-stock";

/**
 * Stock de la tienda desde el catálogo público de la API (sin sesión): lo que
 * se ajusta en Inventario se ve en /catalogo y en las fichas.
 *
 * - Las páginas de la tienda son estáticas: la respuesta se guarda 60 s
 *   (etiqueta STORE_STOCK_TAG) y el panel la invalida al ajustar stock.
 * - No lee cabeceras de la petición (eso volvería dinámicas las páginas).
 * - Si la API no responde, todo queda "a pedido" y la tienda sigue funcionando.
 */
export const STORE_STOCK_TAG = "tienda-stock";

const REVALIDATE_SECONDS = 60;
const TIMEOUT_MS = 2500;
const MAX_PAGES = 20;

const ListPage = z.object({
  items: z.array(z.object({ slug: z.string() })),
  meta: z.object({ totalPages: z.number().int() }),
});

const Detail = z.object({
  variants: z.array(z.object({ sku: z.string(), available: z.number().int() })),
});

async function getJson(path: `/${string}`): Promise<unknown> {
  const response = await apiFetch(`/api/v1${path}`, {
    requestId: randomUUID(),
    timeoutMs: TIMEOUT_MS,
    cache: "force-cache",
    next: { revalidate: REVALIDATE_SECONDS, tags: [STORE_STOCK_TAG] },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export const apiStoreStock: StoreStock = {
  async inStockSlugs() {
    const slugs = new Set<string>();
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const data = ListPage.parse(
          await getJson(`/products?availability=en_stock&pageSize=100&page=${page}`),
        );
        for (const item of data.items) slugs.add(item.slug);
        if (page >= data.meta.totalPages) break;
      }
      return slugs;
    } catch {
      return new Set();
    }
  },

  async variantStock(slug) {
    try {
      const body = await getJson(`/products/${encodeURIComponent(slug)}`);
      if (body === null) return new Map();
      return new Map(Detail.parse(body).variants.map((v) => [v.sku, v.available]));
    } catch {
      return new Map();
    }
  },
};

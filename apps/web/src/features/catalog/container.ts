// Raíz de composición de "catalog": conecta los puertos con sus adaptadores.
import type { AdminCatalog } from "./application/admin-catalog";
import type { ProductCatalog } from "./application/product-catalog";
import type { CatalogQuery } from "./domain/catalog-query";
import { apiAdminCatalog } from "./infrastructure/api-admin-catalog";
import { apiProductCatalog } from "./infrastructure/api-product-catalog";

export { STORE_CATALOG_TAG } from "./infrastructure/api-product-catalog";

/** Caso de uso: productos destacados de la portada. */
export function listFeaturedProducts() {
  return productCatalog.listFeatured();
}

/** Caso de uso: búsqueda del catálogo (RF-01, RF-02). */
export function searchCatalog(query: CatalogQuery) {
  return productCatalog.search(query);
}

/** Caso de uso: ficha de producto (RF-03, RF-04). */
export function getProductDetail(slug: string) {
  return productCatalog.getBySlug(slug);
}

/** Caso de uso: "Completa su pieza" en la ficha. */
export function listRelatedProducts(slug: string, limit = 4) {
  return productCatalog.listRelated(slug, limit);
}

/** Caso de uso: slugs publicados (prerender de fichas y sitemap). */
export function listProductSlugs() {
  return productCatalog.listSlugs();
}

// ── Panel administrativo (LN-12 en la API) ───────────────────────────────────
export const adminCatalog: AdminCatalog = apiAdminCatalog;

/** Catálogo de la tienda: fichas, precios y stock desde la API pública (LN-07). */
export const productCatalog: ProductCatalog = apiProductCatalog;

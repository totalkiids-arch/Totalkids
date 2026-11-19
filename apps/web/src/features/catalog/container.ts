// Raíz de composición de "catalog": conecta el puerto con su adaptador actual.
import type { ProductCatalog } from "./application/product-catalog";
import type { CatalogQuery } from "./domain/catalog-query";
import { importedProductCatalog } from "./infrastructure/imported-product-catalog";

export const productCatalog: ProductCatalog = importedProductCatalog;

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

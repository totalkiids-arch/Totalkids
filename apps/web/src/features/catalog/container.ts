// Raíz de composición de "catalog": conecta el puerto con su adaptador actual.
import type { ProductCatalog } from "./application/product-catalog";
import type { CatalogQuery } from "./domain/catalog-query";
import { demoProductCatalog } from "./infrastructure/demo-product-catalog";

export const productCatalog: ProductCatalog = demoProductCatalog;

/** Caso de uso: productos destacados de la portada. */
export function listFeaturedProducts() {
  return productCatalog.listFeatured();
}

/** Caso de uso: búsqueda del catálogo (RF-01, RF-02). */
export function searchCatalog(query: CatalogQuery) {
  return productCatalog.search(query);
}

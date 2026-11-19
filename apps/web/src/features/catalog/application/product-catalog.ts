import type { CatalogPage, CatalogQuery } from "../domain/catalog-query";
import type { ProductSummary } from "../domain/product";
import type { ProductDetail } from "../domain/product-detail";

/** Puerto: origen de los productos del catálogo. La infraestructura lo implementa. */
export interface ProductCatalog {
  listFeatured(): Promise<ProductSummary[]>;
  /** Búsqueda, filtros, orden y paginación (RF-01, RF-02). */
  search(query: CatalogQuery): Promise<CatalogPage>;
  /** Ficha de un producto activo (RF-03, RF-04); null si no existe o está inactivo. */
  getBySlug(slug: string): Promise<ProductDetail | null>;
  /** Productos que complementan al indicado, sin incluirlo. */
  listRelated(slug: string, limit: number): Promise<ProductSummary[]>;
  /** Slugs de los productos activos, para prerenderizar fichas y el sitemap. */
  listSlugs(): Promise<string[]>;
}

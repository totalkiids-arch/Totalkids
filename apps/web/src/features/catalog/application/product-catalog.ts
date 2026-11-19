import type { CatalogPage, CatalogQuery } from "../domain/catalog-query";
import type { ProductSummary } from "../domain/product";

/** Puerto: origen de los productos del catálogo. La infraestructura lo implementa. */
export interface ProductCatalog {
  listFeatured(): Promise<ProductSummary[]>;
  /** Búsqueda, filtros, orden y paginación (RF-01, RF-02). */
  search(query: CatalogQuery): Promise<CatalogPage>;
}

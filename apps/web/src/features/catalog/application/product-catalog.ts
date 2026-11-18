import type { ProductSummary } from "../domain/product";

/** Puerto: origen de los productos del catálogo. La infraestructura lo implementa. */
export interface ProductCatalog {
  listFeatured(): Promise<ProductSummary[]>;
}

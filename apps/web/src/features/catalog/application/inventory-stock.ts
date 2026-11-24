import type { ProductSummary } from "../domain/product";
import type { ProductDetail } from "../domain/product-detail";
import type { ProductCatalog } from "./product-catalog";

/**
 * Puerto: unidades terminadas que informa el inventario (físico − reservado).
 * Lo implementa el catálogo público de la API (sin sesión). Si la API no
 * responde, el adaptador devuelve vacío: todo queda "a pedido" y la tienda
 * sigue funcionando.
 */
export interface StoreStock {
  /** Slugs con al menos una variante con unidades disponibles. */
  inStockSlugs(): Promise<ReadonlySet<string>>;
  /** Unidades disponibles por SKU de un producto. */
  variantStock(slug: string): Promise<ReadonlyMap<string, number>>;
}

function summaryWithStock<T extends ProductSummary>(product: T, slugs: ReadonlySet<string>): T {
  return { ...product, inStock: slugs.has(product.slug) };
}

function detailWithStock(
  product: ProductDetail,
  bySku: ReadonlyMap<string, number>,
): ProductDetail {
  const variants = product.variants.map((v) => ({ ...v, available: bySku.get(v.sku) ?? 0 }));
  return { ...product, variants, inStock: variants.some((v) => v.available > 0) };
}

/**
 * Todo se fabrica a pedido. El catálogo publicado aporta fichas y precios; las
 * unidades terminadas las informa el inventario (lo que se ajusta en el panel).
 * Sin unidades, el producto se ofrece igual, como reserva.
 */
export function withInventoryStock(catalog: ProductCatalog, stock: StoreStock): ProductCatalog {
  return {
    async listFeatured() {
      const [products, slugs] = await Promise.all([catalog.listFeatured(), stock.inStockSlugs()]);
      return products.map((p) => summaryWithStock(p, slugs));
    },
    async search(query) {
      const [page, slugs] = await Promise.all([catalog.search(query), stock.inStockSlugs()]);
      return { ...page, items: page.items.map((p) => summaryWithStock(p, slugs)) };
    },
    async getBySlug(slug) {
      const [product, bySku] = await Promise.all([
        catalog.getBySlug(slug),
        stock.variantStock(slug),
      ]);
      return product ? detailWithStock(product, bySku) : null;
    },
    async listRelated(slug, limit) {
      const [products, slugs] = await Promise.all([
        catalog.listRelated(slug, limit),
        stock.inStockSlugs(),
      ]);
      return products.map((p) => summaryWithStock(p, slugs));
    },
    listSlugs: () => catalog.listSlugs(),
  };
}

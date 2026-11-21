import type { ProductSummary } from "../domain/product";
import type { ProductDetail } from "../domain/product-detail";
import type { InventoryRow } from "./admin-catalog";
import type { ProductCatalog } from "./product-catalog";

/** Unidades terminadas disponibles (físico − reservado) por slug y SKU. */
type StockIndex = Map<string, Map<string, number>>;

function indexStock(rows: readonly InventoryRow[]): StockIndex {
  const index: StockIndex = new Map();
  for (const row of rows) {
    const bySku = index.get(row.productSlug) ?? new Map<string, number>();
    bySku.set(row.sku, Math.max(0, row.physical - row.reserved));
    index.set(row.productSlug, bySku);
  }
  return index;
}

function summaryWithStock<T extends ProductSummary>(product: T, index: StockIndex): T {
  const units = [...(index.get(product.slug)?.values() ?? [])];
  return { ...product, inStock: units.some((n) => n > 0) };
}

function detailWithStock(product: ProductDetail, index: StockIndex): ProductDetail {
  const bySku = index.get(product.slug);
  return summaryWithStock(
    {
      ...product,
      variants: product.variants.map((v) => ({ ...v, available: bySku?.get(v.sku) ?? 0 })),
    },
    index,
  );
}

/**
 * Todo se fabrica a pedido. El catálogo publicado aporta fichas y precios; las
 * unidades terminadas las informa el inventario del panel. Sin unidades, el
 * producto se ofrece igual, como reserva.
 */
export function withInventoryStock(
  catalog: ProductCatalog,
  listInventory: () => Promise<InventoryRow[]>,
): ProductCatalog {
  const stock = async () => indexStock(await listInventory());
  return {
    async listFeatured() {
      const [products, index] = await Promise.all([catalog.listFeatured(), stock()]);
      return products.map((p) => summaryWithStock(p, index));
    },
    async search(query) {
      const [page, index] = await Promise.all([catalog.search(query), stock()]);
      return { ...page, items: page.items.map((p) => summaryWithStock(p, index)) };
    },
    async getBySlug(slug) {
      const [product, index] = await Promise.all([catalog.getBySlug(slug), stock()]);
      return product ? detailWithStock(product, index) : null;
    },
    async listRelated(slug, limit) {
      const [products, index] = await Promise.all([catalog.listRelated(slug, limit), stock()]);
      return products.map((p) => summaryWithStock(p, index));
    },
    listSlugs: () => catalog.listSlugs(),
  };
}

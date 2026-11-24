import { describe, expect, it } from "vitest";

import type { ProductDetail } from "../domain/product-detail";
import { withInventoryStock, type StoreStock } from "./inventory-stock";
import type { ProductCatalog } from "./product-catalog";

const detail = {
  slug: "silla",
  inStock: false,
  variants: [
    { sku: "TK-1", option: "Chica", price: 1000, compareAtPrice: null, available: 0 },
    { sku: "TK-2", option: "Grande", price: 2000, compareAtPrice: null, available: 0 },
  ],
} as unknown as ProductDetail;

const catalog: ProductCatalog = {
  listFeatured: async () => [detail],
  search: async () => ({ items: [detail], total: 1, page: 1, pageCount: 1 }),
  getBySlug: async (slug) => (slug === "silla" ? detail : null),
  listRelated: async () => [detail],
  listSlugs: async () => ["silla"],
};

const stock = (inStock: string[], bySku: Record<string, number> = {}): StoreStock => ({
  inStockSlugs: async () => new Set(inStock),
  variantStock: async () => new Map(Object.entries(bySku)),
});

describe("stock del inventario en la tienda", () => {
  it("sin unidades en el inventario todo queda a pedido", async () => {
    const store = withInventoryStock(catalog, stock([]));
    const product = await store.getBySlug("silla");
    expect(product?.variants.map((v) => v.available)).toEqual([0, 0]);
    expect(product?.inStock).toBe(false);
    expect((await store.listFeatured())[0]?.inStock).toBe(false);
  });

  it("los listados marcan en stock los slugs que informa el inventario", async () => {
    const store = withInventoryStock(catalog, stock(["silla"]));
    expect((await store.search({} as never)).items[0]?.inStock).toBe(true);
    expect((await store.listRelated("otra", 4))[0]?.inStock).toBe(true);
  });

  it("la ficha usa las unidades por SKU; un SKU desconocido queda en 0", async () => {
    const store = withInventoryStock(catalog, stock(["silla"], { "TK-2": 3, "TK-9": 5 }));
    const product = await store.getBySlug("silla");
    expect(product?.variants.map((v) => v.available)).toEqual([0, 3]);
    expect(product?.inStock).toBe(true);
  });

  it("los slugs publicados no dependen del inventario", async () => {
    const store = withInventoryStock(catalog, stock([]));
    expect(await store.listSlugs()).toEqual(["silla"]);
    expect(await store.getBySlug("nada")).toBeNull();
  });
});

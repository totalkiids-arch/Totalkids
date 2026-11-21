import { describe, expect, it } from "vitest";

import type { ProductDetail } from "../domain/product-detail";
import type { InventoryRow } from "./admin-catalog";
import { withInventoryStock } from "./inventory-stock";
import type { ProductCatalog } from "./product-catalog";

const detail = {
  slug: "silla",
  inStock: false,
  variants: [{ sku: "TK-1", option: null, price: 1000, compareAtPrice: null, available: 0 }],
} as unknown as ProductDetail;

const catalog: ProductCatalog = {
  listFeatured: async () => [detail],
  search: async () => ({ items: [detail], total: 1, page: 1, pageCount: 1 }),
  getBySlug: async (slug) => (slug === "silla" ? detail : null),
  listRelated: async () => [],
  listSlugs: async () => ["silla"],
};

const row = (physical: number, reserved = 0): InventoryRow => ({
  productId: "1",
  productName: "Silla",
  productSlug: "silla",
  variantId: "v1",
  sku: "TK-1",
  option: null,
  physical,
  reserved,
});

describe("stock del inventario en la tienda", () => {
  it("sin unidades cargadas en el panel todo queda a pedido", async () => {
    const store = withInventoryStock(catalog, async () => [row(0)]);
    expect((await store.getBySlug("silla"))?.variants[0]?.available).toBe(0);
    expect((await store.listFeatured())[0]?.inStock).toBe(false);
  });

  it("con al menos 1 unidad disponible el producto está en stock", async () => {
    const store = withInventoryStock(catalog, async () => [row(3, 1)]);
    expect((await store.getBySlug("silla"))?.variants[0]?.available).toBe(2);
    expect((await store.search({} as never)).items[0]?.inStock).toBe(true);
  });

  it("las unidades reservadas no cuentan como stock", async () => {
    const store = withInventoryStock(catalog, async () => [row(2, 2)]);
    expect((await store.listFeatured())[0]?.inStock).toBe(false);
  });
});

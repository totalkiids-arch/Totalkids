import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_STOCK_WHEN_UNKNOWN,
  formatDimensions,
  initialStock,
  parseCatalog,
  SEED_CATEGORIES,
  toSeedProduct,
  type ImportedProduct,
} from "../src/db/seed/catalog-seed.js";

const product = (overrides: Partial<ImportedProduct> = {}): ImportedProduct => ({
  sourceId: 6534,
  slug: "arrimo-bajo-junji-4-espacios",
  name: "Arrimo bajo JUNJI 4 espacios",
  category: "almacenamiento",
  levels: ["sala-cuna"],
  materials: ["madera"],
  summary: "Materias primas con calidad certificada.",
  description: ["Primer párrafo.", "Segundo párrafo."],
  specs: [{ label: "Medidas", value: "52 x 42 cm" }],
  dimensions: [
    { label: "Alto", value: "50 cm" },
    { label: "Ancho", value: "1,0 m" },
  ],
  price: 85990,
  compareAtPrice: 92990,
  available: null,
  inStock: true,
  publishedAt: "2024-01-29",
  featured: false,
  images: [{ src: "/productos/arrimo/1.webp", width: 680, height: 440, alt: "" }],
  ...overrides,
});

describe("toSeedProduct", () => {
  it("convierte el producto importado en filas de la base", () => {
    const seed = toSeedProduct(product());
    expect(seed).toMatchObject({
      slug: "arrimo-bajo-junji-4-espacios",
      categorySlug: "almacenamiento",
      description: "Primer párrafo.\n\nSegundo párrafo.",
      ageGroups: ["sala-cuna"],
      dimensions: "Alto: 50 cm · Ancho: 1,0 m",
      variant: { sku: "TK-6534", price: 85990, compareAtPrice: 92990 },
    });
    expect(seed.publishedAt.toISOString()).toBe("2024-01-29T12:00:00.000Z");
    // Sin alt en el origen, usa el nombre del producto.
    expect(seed.images).toEqual([
      {
        url: "/productos/arrimo/1.webp",
        alt: "Arrimo bajo JUNJI 4 espacios",
        width: 680,
        height: 440,
        sortOrder: 0,
      },
    ]);
  });

  it("descarta un precio anterior que no es mayor al actual (lo exige la base)", () => {
    expect(toSeedProduct(product({ compareAtPrice: 85990 })).variant.compareAtPrice).toBeNull();
    expect(toSeedProduct(product({ price: null })).variant.compareAtPrice).toBeNull();
  });

  it("rechaza una categoría que la tienda no tiene", () => {
    expect(() => toSeedProduct(product({ category: "juguetes" }))).toThrow(/juguetes/);
  });
});

describe("initialStock", () => {
  it("usa la cantidad informada, una provisional o cero sin stock", () => {
    expect(initialStock({ available: 3, inStock: true })).toBe(3);
    expect(initialStock({ available: null, inStock: true })).toBe(DEFAULT_STOCK_WHEN_UNKNOWN);
    expect(initialStock({ available: 5, inStock: false })).toBe(0);
  });
});

describe("formatDimensions", () => {
  it("devuelve null sin medidas", () => {
    expect(formatDimensions([])).toBeNull();
  });
});

describe("catálogo real de la web", () => {
  const raw: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../web/src/features/catalog/infrastructure/totalmuebles/catalogo.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  it("se valida completo y respeta las restricciones de la base", () => {
    const seeds = parseCatalog(raw);
    expect(seeds.length).toBeGreaterThan(0);
    const categories = new Set<string>(SEED_CATEGORIES.map((c) => c.slug));
    expect(new Set(seeds.map((s) => s.slug)).size).toBe(seeds.length);
    expect(new Set(seeds.map((s) => s.variant.sku)).size).toBe(seeds.length);
    for (const s of seeds) {
      expect(categories.has(s.categorySlug), s.slug).toBe(true);
      expect(s.variant.stockPhysical, s.slug).toBeGreaterThanOrEqual(0);
      if (s.variant.compareAtPrice !== null) {
        expect(s.variant.compareAtPrice, s.slug).toBeGreaterThan(s.variant.price ?? Infinity);
      }
      expect(s.name.length, s.slug).toBeLessThanOrEqual(160);
      expect((s.dimensions ?? "").length, s.slug).toBeLessThanOrEqual(200);
    }
  });

  it("rechaza productos repetidos", () => {
    const list = raw as unknown[];
    expect(() => parseCatalog([list[0], list[0]])).toThrow(/repetido/);
  });
});

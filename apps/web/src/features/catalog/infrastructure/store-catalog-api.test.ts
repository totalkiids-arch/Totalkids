import { describe, expect, it } from "vitest";

import { EMPTY_QUERY } from "../domain/catalog-query";
import {
  ApiProductDetail,
  ApiProductPage,
  parseDimensions,
  pickRelated,
  splitParagraphs,
  toApiSearch,
  toCatalogPage,
  toDetail,
  toSummary,
} from "./store-catalog-api";

const apiItem = (overrides: Record<string, unknown> = {}) => ({
  slug: "cuna-alta-junji",
  name: "Cuna alta JUNJI",
  summary: "Cuna de madera",
  category: { slug: "cunas", name: "Cunas y camas" },
  categories: ["cunas", "junji", "categoria-nueva"],
  ageGroups: ["sala-cuna", "otro"],
  materials: ["madera", "carton"],
  colors: [],
  price: 120_000,
  compareAtPrice: 150_000,
  onSale: true,
  featured: false,
  availability: "en_stock",
  publishedAt: "2026-03-01T12:00:00.000Z",
  image: { url: "/productos/cuna/1.webp", alt: "Cuna", width: null, height: 600 },
  ...overrides,
});

describe("consulta a la API", () => {
  it("traduce búsqueda, filtros, orden y página", () => {
    const qs = toApiSearch({
      ...EMPTY_QUERY,
      q: "baúl madera",
      category: "almacenamiento",
      levels: ["sala-cuna", "nivel-medio"],
      materials: ["madera"],
      priceMin: 10_000,
      priceMax: 90_000,
      onSale: true,
      sort: "menor-precio",
      page: 2,
    });
    expect(Object.fromEntries(new URLSearchParams(qs))).toMatchObject({
      q: "baúl madera",
      category: "almacenamiento",
      material: "madera",
      priceMin: "10000",
      priceMax: "90000",
      onSale: "true",
      sort: "price_asc",
      page: "2",
      pageSize: "9",
    });
    expect(new URLSearchParams(qs).getAll("ageGroup")).toEqual(["sala-cuna", "nivel-medio"]);
  });

  it("por defecto ordena por más vendidos y no manda filtros vacíos", () => {
    expect(toApiSearch(EMPTY_QUERY)).toBe("sort=best_selling&page=1&pageSize=9");
  });
});

describe("respuesta de la API", () => {
  it("el resumen usa la disponibilidad, la oferta y solo los valores que la tienda conoce", () => {
    const summary = toSummary(
      ApiProductPage.parse({ items: [apiItem()], meta: META }).items[0] ?? fail(),
    );
    expect(summary).toMatchObject({
      category: "Cunas y camas",
      categories: ["cunas", "junji"],
      levels: ["sala-cuna"],
      materials: ["madera"],
      badge: { label: "-20%", tone: "sale" },
      inStock: true,
      image: { src: "/productos/cuna/1.webp", width: 1000, height: 600 },
    });
  });

  it("Montessori sin oferta lleva su sello; sin oferta no hay precio anterior", () => {
    const summary = toSummary(
      ApiProductPage.parse({
        items: [
          apiItem({ categories: ["montessori-pikler"], compareAtPrice: null, onSale: false }),
        ],
        meta: META,
      }).items[0] ?? fail(),
    );
    expect(summary.badge).toEqual({ label: "Montessori", tone: "line" });
    expect(summary.compareAtPrice).toBeNull();
  });

  it("la página nunca tiene 0 páginas", () => {
    expect(toCatalogPage({ items: [], meta: { page: 1, total: 0, totalPages: 0 } })).toMatchObject({
      total: 0,
      pageCount: 1,
    });
  });

  it("un cuerpo inesperado no se acepta", () => {
    expect(() => ApiProductPage.parse({ items: [{ slug: "x" }], meta: META })).toThrow();
  });

  it("la ficha arma párrafos, medidas, variantes, extras y el contenido de la categoría", () => {
    const detail = toDetail(
      ApiProductDetail.parse({
        ...apiItem(),
        description: "Primer párrafo.\n\nSegundo, con bordes redondeados.",
        dimensions: "Alto: 50 cm · Ancho: 1,0 m",
        optionName: "Tamaño",
        leadTime: null,
        specs: [{ label: "Material", value: "Pino" }],
        images: [{ url: "/a.webp", alt: "A", width: 800, height: 800 }],
        variants: [
          {
            sku: "TK-1",
            optionLabel: "1 plaza",
            color: null,
            size: null,
            price: 120_000,
            compareAtPrice: null,
            available: 2,
            availability: "en_stock",
          },
          {
            sku: "TK-2",
            optionLabel: null,
            color: null,
            size: null,
            price: 150_000,
            compareAtPrice: 170_000,
            available: 0,
            availability: "a_pedido",
          },
        ],
        extras: [
          { code: "armado", name: "Armado", price: null, personalization: null },
          {
            code: "nombre",
            name: "Nombre grabado",
            price: 5000,
            personalization: { label: "Nombre", maxLength: 12 },
          },
        ],
      }),
    );
    expect(detail.description).toEqual(["Primer párrafo.", "Segundo, con bordes redondeados."]);
    expect(detail.dimensions).toEqual([
      { label: "Alto", value: "50 cm" },
      { label: "Ancho", value: "1,0 m" },
    ]);
    expect(detail.specs).toEqual([{ label: "Material", value: "Pino" }]);
    expect(detail.optionName).toBe("Tamaño");
    expect(detail.variants.map((v) => [v.option, v.available, v.compareAtPrice])).toEqual([
      ["1 plaza", 2, null],
      ["TK-2", 0, 170_000],
    ]);
    expect(detail.extras[1]).toEqual({
      id: "nombre",
      label: "Nombre grabado",
      price: 5000,
      personalization: { label: "Nombre", hint: "Máximo 12 caracteres", maxLength: 12 },
    });
    expect(detail.leadTime).toBe("3 a 5 días hábiles");
    expect(detail.mascotQuote).toContain("cuna");
    expect(detail.highlight).toBe("Bordes redondeados");
    expect(detail.image?.src).toBe("/a.webp");
  });

  it("con una sola variante no hay opción que elegir", () => {
    const detail = toDetail(
      ApiProductDetail.parse({
        ...apiItem({ category: { slug: "nueva", name: "Nueva" }, categories: ["nueva"] }),
        description: "",
        dimensions: null,
        optionName: "Tamaño",
        leadTime: "10 días hábiles",
        specs: null,
        images: [],
        variants: [
          { sku: "TK-1", optionLabel: "Única", price: 1000, compareAtPrice: null, available: 0 },
        ],
        extras: [],
      }),
    );
    expect(detail.optionName).toBeNull();
    expect(detail.variants[0]?.option).toBeNull();
    expect(detail.leadTime).toBe("10 días hábiles");
    // Categoría que la tienda no conoce: sin frase de Tito ni "Cómo aprende jugando".
    expect(detail.mascotQuote).toBeNull();
    expect(detail.learning).toEqual([]);
  });

  it("medidas y párrafos toleran textos sin formato", () => {
    expect(parseDimensions("90 x 60 cm")).toEqual([{ label: "Medidas", value: "90 x 60 cm" }]);
    expect(parseDimensions(null)).toEqual([]);
    expect(splitParagraphs("  \n\n Uno \n\n\n Dos ")).toEqual(["Uno", "Dos"]);
  });
});

describe("relacionados", () => {
  const item = (slug: string, category: string, levels: string[]) =>
    toSummary(
      ApiProductPage.parse({
        items: [
          apiItem({
            slug,
            category: { slug: category, name: category },
            categories: [category],
            ageGroups: levels,
          }),
        ],
        meta: META,
      }).items[0] ?? fail(),
    );

  it("de otras categorías, uno por categoría, primero los que comparten nivel", () => {
    const all = [
      item("cuna", "cunas", ["sala-cuna"]),
      item("mesa-grande", "mesas", ["transicion"]),
      item("mesa-chica", "mesas", ["sala-cuna"]),
      item("silla", "sillas", ["sala-cuna"]),
      item("otra-cuna", "cunas", ["sala-cuna"]),
    ];
    expect(pickRelated(all, "cuna", 4).map((p) => p.slug)).toEqual(["mesa-chica", "silla"]);
    expect(pickRelated(all, "no-existe", 4)).toEqual([]);
  });
});

const META = { page: 1, total: 1, totalPages: 1 };

function fail(): never {
  throw new Error("La página de prueba no trae productos");
}

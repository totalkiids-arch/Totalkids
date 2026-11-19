import { describe, expect, it } from "vitest";

import { categoryNav } from "@/shared/config/routes";

import {
  applyCatalogQuery,
  countActiveFilters,
  EMPTY_QUERY,
  PAGE_SIZE,
  parseCatalogQuery,
  parsePrice,
  toQueryString,
  type CatalogQuery,
} from "./catalog-query";
import { CATEGORIES, type ProductSummary } from "./product";

function product(overrides: Partial<ProductSummary> & { slug: string }): ProductSummary {
  return {
    name: overrides.slug,
    category: "Mesas y Sillas",
    categories: ["mesas-y-sillas"],
    ageRange: "3 a 6 años",
    ages: { min: 3, max: 6 },
    summary: "",
    price: null,
    compareAtPrice: null,
    badge: null,
    room: "estudio",
    colors: ["natural"],
    materials: ["madera"],
    popularity: 0,
    publishedAt: "2026-01-01",
    featured: false,
    illustration: { key: "mesa-sillas", tint: "cream", alt: "" },
    ...overrides,
  };
}

const query = (overrides: Partial<CatalogQuery>): CatalogQuery => ({
  ...EMPTY_QUERY,
  ...overrides,
});
const slugs = (items: ProductSummary[]) => items.map((p) => p.slug);

describe("parseCatalogQuery", () => {
  it("lee todos los parámetros válidos", () => {
    const q = parseCatalogQuery({
      q: "  cama  ",
      categoria: "camas-y-cunas",
      edad: ["0-2", "3-5"],
      color: "azul",
      material: ["madera", "mdf"],
      precio_min: "$ 10.000",
      precio_max: "50000",
      ofertas: "1",
      orden: "novedades",
      pagina: "2",
    });
    expect(q).toEqual({
      q: "cama",
      category: "camas-y-cunas",
      ages: ["0-2", "3-5"],
      colors: ["azul"],
      materials: ["madera", "mdf"],
      priceMin: 10000,
      priceMax: 50000,
      onSale: true,
      sort: "novedades",
      page: 2,
    });
  });

  it("descarta valores desconocidos o inválidos", () => {
    const q = parseCatalogQuery({
      categoria: "naves-espaciales",
      edad: ["99", "3-5", "3-5"],
      orden: "aleatorio",
      pagina: "-4",
    });
    expect(q.category).toBeNull();
    expect(q.ages).toEqual(["3-5"]);
    expect(q.sort).toBe("mas-vendidos");
    expect(q.page).toBe(1);
  });

  it("intercambia el rango de precio si viene al revés", () => {
    const q = parseCatalogQuery({ precio_min: "90000", precio_max: "10000" });
    expect([q.priceMin, q.priceMax]).toEqual([10000, 90000]);
  });
});

describe("toQueryString", () => {
  it("es el inverso de parseCatalogQuery y omite valores por defecto", () => {
    const original = query({ q: "baúl", ages: ["3-5"], colors: ["rojo", "azul"], page: 3 });
    const qs = toQueryString(original);
    expect(qs).toBe("?q=ba%C3%BAl&edad=3-5&color=rojo&color=azul&pagina=3");
    expect(parseCatalogQuery(Object.fromEntries(groupParams(qs)))).toEqual(original);
    expect(toQueryString(EMPTY_QUERY)).toBe("");
  });
});

function groupParams(qs: string): [string, string[]][] {
  const map = new Map<string, string[]>();
  new URLSearchParams(qs).forEach((value, key) => map.set(key, [...(map.get(key) ?? []), value]));
  return [...map];
}

describe("parsePrice", () => {
  it("acepta formatos con símbolos y puntos", () => {
    expect(parsePrice("$ 129.990")).toBe(129990);
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe("applyCatalogQuery", () => {
  const catalog = [
    product({ slug: "baul", name: "Baúl de juguetes", popularity: 5, ages: { min: 0, max: null } }),
    product({
      slug: "cama",
      categories: ["camas-y-cunas"],
      ages: { min: 1, max: 5 },
      popularity: 9,
    }),
    product({ slug: "escritorio", ages: { min: 6, max: 12 }, colors: ["azul"], price: 90000 }),
    product({
      slug: "oferta",
      badge: { label: "-10%", tone: "sale" },
      price: 20000,
      publishedAt: "2026-06-01",
    }),
  ];

  it("busca sin distinguir tildes ni mayúsculas", () => {
    expect(slugs(applyCatalogQuery(catalog, query({ q: "BAUL" })).items)).toEqual(["baul"]);
  });

  it("filtra por tramo de edad usando superposición de rangos", () => {
    const result = applyCatalogQuery(catalog, query({ ages: ["10"] }));
    expect(slugs(result.items).sort()).toEqual(["baul", "escritorio"]);
  });

  it("filtra por categoría, color y ofertas", () => {
    expect(slugs(applyCatalogQuery(catalog, query({ category: "camas-y-cunas" })).items)).toEqual([
      "cama",
    ]);
    expect(slugs(applyCatalogQuery(catalog, query({ colors: ["azul"] })).items)).toEqual([
      "escritorio",
    ]);
    expect(slugs(applyCatalogQuery(catalog, query({ onSale: true })).items)).toEqual(["oferta"]);
  });

  it("excluye productos sin precio cuando hay filtro de precio", () => {
    const result = applyCatalogQuery(catalog, query({ priceMax: 50000 }));
    expect(slugs(result.items)).toEqual(["oferta"]);
  });

  it("ordena por precio dejando al final los productos sin precio", () => {
    const result = applyCatalogQuery(catalog, query({ sort: "menor-precio" }));
    expect(slugs(result.items).slice(0, 2)).toEqual(["oferta", "escritorio"]);
  });

  it("ordena por más vendidos y por novedades", () => {
    expect(applyCatalogQuery(catalog, query({})).items[0]?.slug).toBe("cama");
    expect(applyCatalogQuery(catalog, query({ sort: "novedades" })).items[0]?.slug).toBe("oferta");
  });

  it("pagina y ajusta una página fuera de rango a la última", () => {
    const many = Array.from({ length: PAGE_SIZE + 2 }, (_, i) => product({ slug: `p${i}` }));
    const page2 = applyCatalogQuery(many, query({ page: 2 }));
    expect([page2.items.length, page2.total, page2.pageCount]).toEqual([2, PAGE_SIZE + 2, 2]);
    expect(applyCatalogQuery(many, query({ page: 40 })).page).toBe(2);
  });

  it("devuelve una página vacía cuando nada coincide", () => {
    expect(applyCatalogQuery(catalog, query({ q: "submarino" }))).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
  });
});

describe("countActiveFilters", () => {
  it("cuenta filtros, no búsqueda ni orden", () => {
    expect(
      countActiveFilters(query({ q: "x", sort: "novedades", ages: ["0-2"], priceMin: 1 })),
    ).toBe(2);
  });
});

describe("categorías de la navegación", () => {
  it("cada categoría del encabezado existe en el catálogo", () => {
    const known = new Set<string>(CATEGORIES.map((c) => c.slug));
    for (const item of categoryNav) {
      const slug = new URL(item.href, "https://x.cl").searchParams.get("categoria");
      if (slug) expect(known, `categoría "${slug}"`).toContain(slug);
    }
  });
});

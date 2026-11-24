import { describe, expect, it } from "vitest";

import { categoryNav } from "@/shared/config/routes";

import {
  countActiveFilters,
  EMPTY_QUERY,
  parseCatalogQuery,
  parsePrice,
  toQueryString,
  type CatalogQuery,
} from "./catalog-query";
import { CATEGORIES } from "./product";

const query = (overrides: Partial<CatalogQuery>): CatalogQuery => ({
  ...EMPTY_QUERY,
  ...overrides,
});

describe("parseCatalogQuery", () => {
  it("lee todos los parámetros válidos", () => {
    const q = parseCatalogQuery({
      q: "  cama  ",
      categoria: "cunas",
      nivel: ["sala-cuna", "adultos"],
      material: ["madera", "melamina"],
      precio_min: "$ 10.000",
      precio_max: "50000",
      ofertas: "1",
      orden: "novedades",
      pagina: "2",
    });
    expect(q).toEqual({
      q: "cama",
      category: "cunas",
      levels: ["sala-cuna", "adultos"],
      materials: ["madera", "melamina"],
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
      nivel: ["universidad", "transicion", "transicion"],
      orden: "aleatorio",
      pagina: "-4",
    });
    expect(q.category).toBeNull();
    expect(q.levels).toEqual(["transicion"]);
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
    const original = query({ q: "baúl", levels: ["sala-cuna", "nivel-medio"], page: 3 });
    const qs = toQueryString(original);
    expect(qs).toBe("?q=ba%C3%BAl&nivel=sala-cuna&nivel=nivel-medio&pagina=3");
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

describe("countActiveFilters", () => {
  it("cuenta filtros, no búsqueda ni orden", () => {
    expect(
      countActiveFilters(query({ q: "x", sort: "novedades", levels: ["sala-cuna"], priceMin: 1 })),
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

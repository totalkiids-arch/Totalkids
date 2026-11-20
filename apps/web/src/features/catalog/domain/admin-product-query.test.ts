import { describe, expect, it } from "vitest";

import type { AdminProduct } from "./admin-product";
import {
  applyAdminProductQuery,
  parseAdminProductQuery,
  toAdminProductSearch,
} from "./admin-product-query";

function product(id: string, name: string, sku: string, active = true): AdminProduct {
  return {
    id,
    slug: id,
    name,
    category: "mesas",
    categories: ["mesas"],
    levels: [],
    materials: [],
    description: "",
    dimensions: "",
    optionName: null,
    variants: [
      {
        id: `v${id}`,
        sku,
        option: null,
        price: 100,
        compareAtPrice: null,
        physical: 1,
        reserved: 0,
      },
    ],
    assemblyPrice: 0,
    personalizationPrice: 0,
    personalizationMaxLength: 20,
    active,
    images: [],
  };
}

describe("parseAdminProductQuery", () => {
  it("lee búsqueda, estado y página", () => {
    expect(parseAdminProductQuery({ q: " cuna ", estado: "inactivo", pagina: "3" })).toEqual({
      q: "cuna",
      status: "inactivo",
      page: 3,
    });
  });

  it("vuelve a los valores por defecto con datos inválidos", () => {
    expect(parseAdminProductQuery({ estado: "borrado", pagina: "-2" })).toEqual({
      q: "",
      status: "todos",
      page: 1,
    });
    expect(parseAdminProductQuery({ pagina: "1.5" }).page).toBe(1);
  });

  it("arma la URL sin valores por defecto", () => {
    expect(toAdminProductSearch({ q: "", status: "todos", page: 1 })).toBe("");
    expect(toAdminProductSearch({ q: "mesa azul", status: "activo", page: 2 })).toBe(
      "?q=mesa+azul&estado=activo&pagina=2",
    );
  });
});

describe("applyAdminProductQuery", () => {
  const products = [
    product("1", "Cuna alta JUNJI", "TK-1"),
    product("2", "Mesa Montessori", "TK-22", false),
    product("3", "Silla apilable", "TK-3"),
  ];

  it("busca por nombre sin tildes ni mayúsculas, o por SKU", () => {
    const byName = applyAdminProductQuery(products, { q: "CUNA", status: "todos", page: 1 });
    expect(byName.items.map((p) => p.id)).toEqual(["1"]);
    const bySku = applyAdminProductQuery(products, { q: "tk-22", status: "todos", page: 1 });
    expect(bySku.items.map((p) => p.id)).toEqual(["2"]);
  });

  it("filtra por publicación", () => {
    const inactive = applyAdminProductQuery(products, { q: "", status: "inactivo", page: 1 });
    expect(inactive.items.map((p) => p.id)).toEqual(["2"]);
    const active = applyAdminProductQuery(products, { q: "", status: "activo", page: 1 });
    expect(active.total).toBe(2);
  });

  it("pagina y ajusta una página fuera de rango", () => {
    const result = applyAdminProductQuery(products, { q: "", status: "todos", page: 9 }, 2);
    expect(result).toMatchObject({ page: 2, pageCount: 2, total: 3 });
    expect(result.items.map((p) => p.id)).toEqual(["3"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  parseAdminProductQuery,
  toAdminProductSearch,
  toApiProductSearch,
} from "./admin-product-query";

describe("parseAdminProductQuery", () => {
  it("lee búsqueda, estado y página", () => {
    expect(parseAdminProductQuery({ q: " cuna ", estado: "inactivo", pagina: "3" })).toEqual({
      q: "cuna",
      status: "inactivo",
      page: 3,
    });
    expect(parseAdminProductQuery({ estado: "borrador" }).status).toBe("borrador");
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

describe("toApiProductSearch", () => {
  it("traduce el filtro del panel al estado de la API y pagina de a 20", () => {
    expect(toApiProductSearch({ q: "", status: "todos", page: 1 })).toBe("page=1&pageSize=20");
    expect(toApiProductSearch({ q: "tk-22", status: "activo", page: 3 })).toBe(
      "page=3&pageSize=20&q=tk-22&status=active",
    );
    expect(toApiProductSearch({ q: "", status: "borrador", page: 1 })).toContain("status=draft");
    expect(toApiProductSearch({ q: "", status: "inactivo", page: 1 })).toContain("status=inactive");
  });
});

import { describe, expect, it } from "vitest";

import { parseAdminOrderQuery, toAdminOrderSearch, toApiOrderSearch } from "./admin-order-query";

describe("consulta del listado de pedidos", () => {
  it("lee la URL y descarta valores inválidos", () => {
    expect(parseAdminOrderQuery({})).toEqual({ q: "", status: "todos", page: 1 });
    expect(parseAdminOrderQuery({ q: "  camila ", estado: "shipped", pagina: "2" })).toEqual({
      q: "camila",
      status: "shipped",
      page: 2,
    });
    expect(parseAdminOrderQuery({ estado: "inventado", pagina: "-3" })).toEqual({
      q: "",
      status: "todos",
      page: 1,
    });
    expect(parseAdminOrderQuery({ q: ["a", "b"], pagina: "1.5" })).toMatchObject({
      q: "a",
      page: 1,
    });
    expect(parseAdminOrderQuery({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("arma la URL omitiendo los valores por defecto", () => {
    expect(toAdminOrderSearch({ q: "", status: "todos", page: 1 })).toBe("");
    expect(toAdminOrderSearch({ q: "tk 10", status: "shipped", page: 3 })).toBe(
      "?q=tk+10&estado=shipped&pagina=3",
    );
  });

  it("arma la consulta a la API con los filtros y la página", () => {
    expect(toApiOrderSearch({ q: "camila", status: "shipped", page: 2 })).toBe(
      "page=2&pageSize=20&q=camila&status=shipped",
    );
    expect(toApiOrderSearch({ q: "", status: "todos", page: 1 })).toBe("page=1&pageSize=20");
  });
});

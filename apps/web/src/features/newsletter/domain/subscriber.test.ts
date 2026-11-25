import { describe, expect, it } from "vitest";

import { parseSubscriberQuery, toApiSubscriberSearch, toSubscriberSearch } from "./subscriber";

describe("filtros de suscriptores", () => {
  it("lee estado, búsqueda, página y confirmación", () => {
    expect(
      parseSubscriberQuery({ estado: "bajas", q: " ana@ ", pagina: "2", baja: "abc-123" }),
    ).toEqual({ filter: "bajas", q: "ana@", page: 2, confirm: "abc-123" });
  });

  it("ignora valores desconocidos", () => {
    expect(parseSubscriberQuery({ estado: "todos", pagina: "0", baja: "<script>" })).toEqual({
      filter: null,
      q: "",
      page: 1,
      confirm: null,
    });
  });

  it("arma la URL del panel y la consulta a la API", () => {
    const query = parseSubscriberQuery({ estado: "activos", q: "ana", pagina: "3" });
    expect(toSubscriberSearch(query)).toBe("?estado=activos&q=ana&pagina=3");
    expect(toSubscriberSearch({ filter: null }, { baja: "x" })).toBe("?baja=x");
    expect(toApiSubscriberSearch(query)).toBe("status=active&q=ana&page=3&pageSize=20");
  });
});

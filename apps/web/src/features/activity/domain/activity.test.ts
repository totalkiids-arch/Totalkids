import { describe, expect, it } from "vitest";

import {
  buildActivityPage,
  PAGE_SIZE,
  parseActivityQuery,
  toActivitySearch,
  type ActivityEntry,
} from "./activity";

const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: "x",
  at: "2026-11-20T12:00:00.000Z",
  actor: "Administrador",
  area: "pedidos",
  action: "Estado: Confirmado → En preparación",
  reason: null,
  reference: null,
  ...overrides,
});

describe("parseActivityQuery", () => {
  it("lee área, responsable y página", () => {
    expect(
      parseActivityQuery({ area: "inventario", responsable: "Operador", pagina: "2" }),
    ).toEqual({ area: "inventario", actor: "Operador", page: 2 });
  });

  it("ignora valores desconocidos o inválidos", () => {
    expect(parseActivityQuery({ area: "magia", pagina: "-3" })).toEqual({
      area: null,
      actor: null,
      page: 1,
    });
    expect(parseActivityQuery({ pagina: "abc" }).page).toBe(1);
  });

  it("arma la URL sin los valores por defecto", () => {
    expect(toActivitySearch({ area: null, actor: null, page: 1 })).toBe("");
    expect(toActivitySearch({ area: "pagos", actor: "Operador", page: 3 })).toBe(
      "?area=pagos&responsable=Operador&pagina=3",
    );
  });
});

describe("buildActivityPage", () => {
  const sources = [
    [
      entry({ id: "p1", at: "2026-11-20T10:00:00.000Z", area: "pedidos" }),
      entry({ id: "p2", at: "2026-11-20T14:00:00.000Z", area: "reembolsos", actor: "Operador" }),
    ],
    [entry({ id: "i1", at: "2026-11-20T12:00:00.000Z", area: "inventario" })],
  ];

  it("junta todas las fuentes, del más reciente al más antiguo", () => {
    const page = buildActivityPage(sources, { area: null, actor: null, page: 1 });
    expect(page.entries.map((e) => e.id)).toEqual(["p2", "i1", "p1"]);
    expect(page.total).toBe(3);
    expect(page.actors).toEqual(["Administrador", "Operador"]);
    expect(page.byArea.pedidos).toBe(1);
    expect(page.byArea.usuarios).toBe(0);
  });

  it("filtra por área y por responsable", () => {
    expect(
      buildActivityPage(sources, { area: "inventario", actor: null, page: 1 }).entries.map(
        (e) => e.id,
      ),
    ).toEqual(["i1"]);
    expect(
      buildActivityPage(sources, { area: null, actor: "Operador", page: 1 }).entries.map(
        (e) => e.id,
      ),
    ).toEqual(["p2"]);
  });

  it("pagina y acota la página pedida", () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      entry({ id: `e${i}`, at: `2026-11-20T12:${String(i).padStart(2, "0")}:00.000Z` }),
    );
    const second = buildActivityPage([many], { area: null, actor: null, page: 2 });
    expect(second.pageCount).toBe(2);
    expect(second.entries).toHaveLength(5);
    expect(buildActivityPage([many], { area: null, actor: null, page: 99 }).page).toBe(2);
  });

  it("sin actividad, una página vacía", () => {
    const empty = buildActivityPage([], { area: null, actor: null, page: 1 });
    expect(empty).toMatchObject({ entries: [], total: 0, page: 1, pageCount: 1, actors: [] });
  });
});

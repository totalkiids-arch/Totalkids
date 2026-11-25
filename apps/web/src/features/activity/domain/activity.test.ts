import { describe, expect, it } from "vitest";

import {
  activityHref,
  parseActivityQuery,
  toActivitySearch,
  toApiActivitySearch,
} from "./activity";

const ACTOR = "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70";

describe("parseActivityQuery", () => {
  it("lee área, responsable, fechas y página", () => {
    expect(
      parseActivityQuery({
        area: "configuracion",
        responsable: ACTOR,
        desde: "2026-11-01",
        hasta: "2026-11-30",
        pagina: "2",
      }),
    ).toEqual({
      area: "configuracion",
      actor: ACTOR,
      from: "2026-11-01",
      to: "2026-11-30",
      page: 2,
    });
  });

  it("ignora valores desconocidos o inválidos", () => {
    expect(
      parseActivityQuery({ area: "magia", responsable: "Operador", desde: "ayer", pagina: "-3" }),
    ).toEqual({ area: null, actor: null, from: null, to: null, page: 1 });
  });
});

describe("búsquedas", () => {
  it("arma la URL del panel y la consulta a la API", () => {
    const query = parseActivityQuery({ area: "pedidos", responsable: ACTOR, pagina: "3" });
    expect(toActivitySearch(query)).toBe(`?area=pedidos&responsable=${ACTOR}&pagina=3`);
    expect(toActivitySearch({ page: 1 })).toBe("");
    expect(toApiActivitySearch(query)).toBe(`page=3&pageSize=20&area=pedidos&actor=${ACTOR}`);
  });
});

describe("activityHref", () => {
  it("abre la ficha de pedidos, solicitudes, productos y cupones", () => {
    expect(activityHref({ type: "order", id: ACTOR, label: "TK-1048" })).toBe(
      "/admin/pedidos/TK-1048",
    );
    expect(activityHref({ type: "service_request", id: ACTOR, label: "SOL-1002" })).toBe(
      "/admin/solicitudes?id=SOL-1002#detalle",
    );
    expect(activityHref({ type: "product", id: ACTOR, label: "TK-6536" })).toBe(
      `/admin/productos/${ACTOR}`,
    );
    expect(activityHref({ type: "coupon", id: ACTOR, label: "APRENDER10" })).toBe(
      `/admin/cupones?editar=${ACTOR}#editor`,
    );
  });

  it("sin número visible lleva a la lista; sin pantalla, no enlaza", () => {
    expect(activityHref({ type: "order", id: ACTOR, label: ACTOR })).toBe("/admin/pedidos");
    expect(activityHref({ type: "export", id: "orders", label: "Pedidos" })).toBeNull();
  });
});

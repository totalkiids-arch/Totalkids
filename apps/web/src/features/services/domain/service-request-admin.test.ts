import { describe, expect, it } from "vitest";

import {
  NO_CHANGES,
  NOTE_MAX,
  parseRequestQuery,
  requestQueryString,
  toApiRequestSearch,
  validateFollowUp,
} from "./service-request-admin";

const current = {
  status: "new" as const,
  note: "",
  statusOptions: ["new" as const, "in_progress" as const, "resolved" as const],
};

describe("validateFollowUp", () => {
  it("devuelve solo lo que cambia", () => {
    expect(validateFollowUp(current, { status: "in_progress", note: "" })).toEqual({
      ok: true,
      changes: { status: "in_progress" },
    });
    expect(validateFollowUp(current, { status: "new", note: "  Llamar el lunes " })).toEqual({
      ok: true,
      changes: { note: "Llamar el lunes" },
    });
  });

  it("borrar la nota es un cambio", () => {
    expect(validateFollowUp({ ...current, note: "Antes" }, { status: "new", note: " " })).toEqual({
      ok: true,
      changes: { note: "" },
    });
  });

  it("sin cambios no se guarda", () => {
    expect(validateFollowUp(current, { status: "new", note: "" })).toEqual({
      ok: false,
      errors: { form: NO_CHANGES },
    });
  });

  it("solo acepta los estados que permite la API y limita la nota", () => {
    const resolved = {
      status: "resolved" as const,
      note: "",
      statusOptions: ["resolved" as const, "in_progress" as const],
    };
    const result = validateFollowUp(resolved, { status: "new", note: "x".repeat(NOTE_MAX + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["note", "status"]);
  });
});

describe("filtros de la URL", () => {
  it("lee servicio, estado, búsqueda, página y detalle", () => {
    expect(
      parseRequestQuery({
        servicio: "armado",
        estado: "in_progress",
        q: "  ana   pérez ",
        pagina: "2",
        id: "sol-1002",
      }),
    ).toEqual({
      service: "armado",
      status: "in_progress",
      q: "ana pérez",
      page: 2,
      id: "SOL-1002",
    });
  });

  it("ignora valores desconocidos", () => {
    expect(parseRequestQuery({ servicio: "otro", estado: "x", pagina: "-1", id: "1" })).toEqual({
      service: null,
      status: null,
      q: "",
      page: 1,
      id: null,
    });
  });

  it("arma la URL del panel y la consulta a la API", () => {
    const query = parseRequestQuery({ servicio: "garantia", q: "SOL-1002", pagina: "3" });
    expect(requestQueryString(query)).toBe("?servicio=garantia&q=SOL-1002&pagina=3");
    expect(requestQueryString({ service: null, status: null, q: "" })).toBe("");
    expect(toApiRequestSearch(query)).toBe("service=garantia&q=SOL-1002&page=3&pageSize=20");
  });
});

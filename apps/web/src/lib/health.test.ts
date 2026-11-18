import { describe, expect, it } from "vitest";

import { toHealthState } from "./health";

describe("toHealthState", () => {
  it("devuelve ok con una respuesta válida", () => {
    expect(toHealthState(true, { status: "ok" })).toEqual({ state: "ok" });
  });

  it("usa el mensaje del formato estándar de error", () => {
    const body = { code: "DATABASE_UNAVAILABLE", message: "Sin BD", details: null, requestId: "x" };
    expect(toHealthState(false, body)).toEqual({ state: "error", message: "Sin BD" });
  });

  it("devuelve un mensaje genérico si el cuerpo no es reconocible", () => {
    expect(toHealthState(true, "html")).toEqual({
      state: "error",
      message: "La API no respondió correctamente",
    });
  });
});

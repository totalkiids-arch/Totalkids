import { describe, expect, it } from "vitest";

import { firstName, nameFromEmail, parseSession, serializeSession } from "./session";

describe("sesión de demostración", () => {
  it("guarda y lee nombre y correo", () => {
    const buyer = { name: "Camila González", email: "camila@example.com" };
    expect(parseSession(serializeSession(buyer))).toEqual(buyer);
  });

  it("un formato irreconocible es sin sesión", () => {
    expect(parseSession(undefined)).toBeNull();
    expect(parseSession("{no es json")).toBeNull();
    expect(parseSession(JSON.stringify({ v: 1, n: "Camila", e: "no-es-correo" }))).toBeNull();
    expect(parseSession(JSON.stringify({ v: 2, n: "Camila", e: "c@e.cl" }))).toBeNull();
  });
});

describe("nombres", () => {
  it("saluda por el primer nombre", () => {
    expect(firstName({ name: "  Camila   González ", email: "c@e.cl" })).toBe("Camila");
  });

  it("deriva un nombre de cortesía desde el correo", () => {
    expect(nameFromEmail("camila.gonzalez@correo.cl")).toBe("Camila");
    expect(nameFromEmail("@correo.cl")).toBe("Comprador");
  });
});

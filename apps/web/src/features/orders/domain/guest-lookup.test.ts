import { describe, expect, it } from "vitest";

import {
  grantGuestAccess,
  MAX_GUEST_ORDERS,
  normalizeOrderId,
  parseGuestAccess,
  parseGuestLookup,
  serializeGuestAccess,
} from "./guest-lookup";

describe("normalizeOrderId", () => {
  it("acepta el número con o sin prefijo, numeral o minúsculas", () => {
    for (const value of ["TK-1048", "tk-1048", "#TK-1048", "1048", " tk1048 ", "TK 1048"]) {
      expect(normalizeOrderId(value), value).toBe("TK-1048");
    }
  });

  it("rechaza lo que no es un número de pedido", () => {
    for (const value of ["", "TK-", "pedido", "TK-10a", "../../etc"]) {
      expect(normalizeOrderId(value), value).toBeNull();
    }
  });
});

describe("parseGuestLookup", () => {
  it("normaliza número y correo", () => {
    expect(parseGuestLookup({ pedido: "#tk-1055", correo: " Invitado@Example.com " })).toEqual({
      ok: true,
      orderId: "TK-1055",
      email: "invitado@example.com",
    });
  });

  it("informa errores por campo", () => {
    const result = parseGuestLookup({ pedido: "abc", correo: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.pedido).toMatch(/TK-1048/);
    expect(result.errors.correo).toBe("Ingresa el correo de la compra.");
  });
});

describe("cookie de credenciales de pedidos consultados", () => {
  const token = (c: string) => c.repeat(43);

  it("guarda, lee y renueva sin repetir", () => {
    const entries = grantGuestAccess(grantGuestAccess([], { orderId: "TK-1", token: token("a") }), {
      orderId: "TK-1",
      token: token("b"),
    });
    expect(parseGuestAccess(serializeGuestAccess(entries))).toEqual([
      { orderId: "TK-1", token: token("b") },
    ]);
  });

  it("tiene tope y descarta valores extraños", () => {
    let entries: ReturnType<typeof parseGuestAccess> = [];
    for (let i = 0; i < 10; i++)
      entries = grantGuestAccess(entries, { orderId: `TK-${i}`, token: token("x") });
    expect(entries).toHaveLength(MAX_GUEST_ORDERS);
    expect(parseGuestAccess(`TK-1~${token("a")}.hola.TK-2~corto.TK-3~${token("c")}`)).toEqual([
      { orderId: "TK-1", token: token("a") },
      { orderId: "TK-3", token: token("c") },
    ]);
    expect(parseGuestAccess(undefined)).toEqual([]);
  });
});

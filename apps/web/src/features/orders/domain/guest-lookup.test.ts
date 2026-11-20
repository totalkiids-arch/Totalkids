import { describe, expect, it } from "vitest";

import {
  canViewOrder,
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

describe("canViewOrder", () => {
  const order = { id: "TK-1048", email: "camila@example.com" };

  it("lo ve el dueño con sesión", () => {
    expect(canViewOrder(order, { sessionEmail: "camila@example.com", guestOrderIds: [] })).toBe(
      true,
    );
  });

  it("lo ve el invitado que lo consultó", () => {
    expect(canViewOrder(order, { sessionEmail: null, guestOrderIds: ["TK-1048"] })).toBe(true);
  });

  it("nadie más lo ve (historial propio aislado)", () => {
    expect(canViewOrder(order, { sessionEmail: "otra@example.com", guestOrderIds: [] })).toBe(
      false,
    );
    expect(canViewOrder(order, { sessionEmail: null, guestOrderIds: ["TK-1055"] })).toBe(false);
  });
});

describe("cookie de pedidos consultados", () => {
  it("guarda, lee y no repite", () => {
    const ids = grantGuestAccess(grantGuestAccess([], "TK-1"), "TK-1");
    expect(parseGuestAccess(serializeGuestAccess(ids))).toEqual(["TK-1"]);
  });

  it("tiene tope y descarta valores extraños", () => {
    let ids: string[] = [];
    for (let i = 0; i < 10; i++) ids = grantGuestAccess(ids, `TK-${i}`);
    expect(ids).toHaveLength(MAX_GUEST_ORDERS);
    expect(parseGuestAccess("TK-1.hola.TK-2")).toEqual(["TK-1", "TK-2"]);
    expect(parseGuestAccess(undefined)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { checkoutBlocker, summarizeOrder } from "./order-summary";
import type { CheckoutCart } from "./ports";

const cart = (overrides: Partial<CheckoutCart> = {}): CheckoutCart => ({
  lines: [{ id: "TK-1", name: "Cuna alta", detail: null, quantity: 1, total: 120_000 }],
  subtotal: 120_000,
  unpriced: [],
  blocked: false,
  ...overrides,
});

describe("summarizeOrder", () => {
  it("con retiro, el total es el subtotal", () => {
    const summary = summarizeOrder(cart(), "retiro", null);
    expect(summary.total).toBe(120_000);
    expect(summary.shipping.kind).toBe("free");
  });

  it("con despacho por confirmar, no hay total", () => {
    const summary = summarizeOrder(cart(), "domicilio", null);
    expect(summary.shipping.kind).toBe("pending");
    expect(summary.total).toBeNull();
  });

  it("con despacho gratis por umbral, el total es el subtotal", () => {
    expect(summarizeOrder(cart(), "domicilio", 100_000).total).toBe(120_000);
  });

  it("informa lo que no tiene precio", () => {
    expect(summarizeOrder(cart({ unpriced: ["Armado"] }), "retiro", null).unpriced).toEqual([
      "Armado",
    ]);
  });
});

describe("checkoutBlocker", () => {
  it("no deja avanzar con el carrito vacío o con productos agotados", () => {
    expect(checkoutBlocker(cart({ lines: [], subtotal: 0 }))).toBe("empty");
    expect(checkoutBlocker(cart({ blocked: true }))).toBe("blocked");
    expect(checkoutBlocker(cart())).toBeNull();
  });
});

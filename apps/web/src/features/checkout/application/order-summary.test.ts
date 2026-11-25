import { describe, expect, it } from "vitest";

import { checkoutBlocker, summarizeOrder, summarizeQuotedOrder } from "./order-summary";
import type { CheckoutCart } from "./ports";

const cart = (overrides: Partial<CheckoutCart> = {}): CheckoutCart => ({
  lines: [{ id: "TK-1", name: "Cuna alta", detail: null, quantity: 1, total: 120_000 }],
  subtotal: 120_000,
  discount: 0,
  unpriced: [],
  blocked: false,
  ...overrides,
});

describe("summarizeOrder (antes de cotizar)", () => {
  it("con retiro, el total es el subtotal menos el descuento", () => {
    const summary = summarizeOrder(cart({ discount: 10_000 }), "retiro");
    expect(summary.total).toBe(110_000);
    expect(summary.shipping.kind).toBe("free");
  });

  it("con despacho, queda por confirmar y no suma", () => {
    const summary = summarizeOrder(cart(), "domicilio");
    expect(summary.shipping.kind).toBe("pending");
    expect(summary.total).toBe(120_000);
  });

  it("informa lo que no tiene precio", () => {
    expect(summarizeOrder(cart({ unpriced: ["Armado"] }), "retiro").unpriced).toEqual(["Armado"]);
  });
});

describe("summarizeQuotedOrder", () => {
  it("usa los totales de la API: son los que se cobran", () => {
    const summary = summarizeQuotedOrder(cart(), {
      shipping: { kind: "rate", cost: 9_990, leadTime: null },
      totals: { subtotal: 120_000, discount: 5_000, shipping: 9_990, total: 124_990 },
    });
    expect(summary).toMatchObject({ subtotal: 120_000, discount: 5_000, total: 124_990 });
  });
});

describe("checkoutBlocker", () => {
  it("no deja avanzar con el carrito vacío o con productos agotados", () => {
    expect(checkoutBlocker(cart({ lines: [], subtotal: 0 }))).toBe("empty");
    expect(checkoutBlocker(cart({ blocked: true }))).toBe("blocked");
    expect(checkoutBlocker(cart())).toBeNull();
  });
});

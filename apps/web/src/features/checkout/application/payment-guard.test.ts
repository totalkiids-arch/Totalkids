import { describe, expect, it } from "vitest";

import { parseCheckoutDetails } from "../domain/checkout-details";
import { paymentStepRedirect } from "./payment-guard";
import type { CheckoutCart } from "./ports";

const cart = (overrides: Partial<CheckoutCart> = {}): CheckoutCart => ({
  lines: [{ id: "TK-1", name: "Cuna alta", detail: null, quantity: 1, total: 120_000 }],
  subtotal: 120_000,
  discount: 0,
  unpriced: [],
  blocked: false,
  ...overrides,
});

const valid = parseCheckoutDetails({
  nombre: "María González",
  rut: "12.345.678-5",
  correo: "maria@correo.cl",
  telefono: "+56 9 1234 5678",
  entrega: "retiro",
  documento: "boleta",
});
const missing = parseCheckoutDetails({});

describe("paymentStepRedirect", () => {
  it("con carrito pagable y datos válidos, deja pagar", () => {
    expect(valid.ok).toBe(true);
    expect(paymentStepRedirect(cart(), valid)).toBeNull();
  });

  it("sin datos válidos, vuelve a Datos y facturación", () => {
    expect(paymentStepRedirect(cart(), missing)).toBe("/checkout");
  });

  it("con el carrito vacío o con productos agotados, vuelve al carrito", () => {
    expect(paymentStepRedirect(cart({ lines: [], subtotal: 0 }), valid)).toBe("/carrito");
    expect(paymentStepRedirect(cart({ blocked: true }), valid)).toBe("/carrito");
  });

  it("revisa el carrito antes que los datos", () => {
    expect(paymentStepRedirect(cart({ lines: [], subtotal: 0 }), missing)).toBe("/carrito");
  });
});

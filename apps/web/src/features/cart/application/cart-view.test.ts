import { describe, expect, it } from "vitest";

import { ApiCart, apiMessage, toCartView } from "./cart-view";

// Respuesta de GET /cart de la API (LN-06), recortada a lo que usa la tienda y más.
const apiCart = {
  lines: [
    {
      id: "0195f3a0-0000-7000-8000-000000000001",
      sku: "TK-7261",
      optionLabel: null,
      quantity: 2,
      status: "ok",
      product: {
        slug: "baul-kurruf",
        name: "Baúl Kurruf",
        leadTime: null,
        image: { url: "/productos/baul/1.webp", alt: "Baúl", width: null, height: 700 },
      },
      variantPrice: 50_000,
      compareAtPrice: null,
      unitPrice: 50_000,
      lineTotal: 100_000,
      extras: [{ code: "armado", name: "Armado a domicilio", price: null, text: null }],
      availability: {
        status: "a_pedido",
        inStock: 0,
        leadTime: "3 a 5 días hábiles",
        message: "Reserva a pedido: se fabrica al confirmar",
      },
      notices: [],
    },
    {
      id: "0195f3a0-0000-7000-8000-000000000002",
      sku: "TK-1",
      optionLabel: "1 plaza",
      quantity: 1,
      status: "unavailable",
      product: { slug: "cuna", name: "Cuna", leadTime: null, image: null },
      variantPrice: null,
      compareAtPrice: null,
      unitPrice: null,
      lineTotal: null,
      extras: [],
      availability: { status: "a_pedido", inStock: 0, leadTime: null, message: "…" },
      notices: [
        { code: "product_removed", message: "Ya no está a la venta. Lo quitaremos de tu carrito." },
      ],
    },
  ],
  notices: [
    { code: "coupon_removed", message: "El cupón «KIDS10» ya no está vigente y no se aplica." },
  ],
  coupon: { code: "KIDS5", kind: "amount", value: 5000, discount: 5000, valid: true, reason: null },
  totals: {
    units: 2,
    subtotal: 100_000,
    discount: 5000,
    totalWithoutShipping: 95_000,
    unpriced: ["Armado a domicilio"],
  },
  freeShipping: { threshold: 150_000, remaining: 55_000, percent: 63, reached: false },
  canCheckout: false,
};

describe("carrito de la API", () => {
  it("se muestra tal como lo calcula la API (sin recalcular importes)", () => {
    const view = toCartView(ApiCart.parse(apiCart));
    expect(view).toMatchObject({
      units: 2,
      subtotal: 100_000,
      discount: 5000,
      total: 95_000,
      unpriced: ["Armado a domicilio"],
      coupon: { code: "KIDS5", discount: 5000, valid: true },
      freeShipping: { remaining: 55_000, percent: 63, reached: false },
      canCheckout: false,
      notices: ["El cupón «KIDS10» ya no está vigente y no se aplica."],
    });
    expect(view.lines[0]).toMatchObject({
      slug: "baul-kurruf",
      name: "Baúl Kurruf",
      option: null,
      total: 100_000,
      variantPrice: 50_000,
      image: { src: "/productos/baul/1.webp", width: 1000, height: 700 },
      extras: [{ id: "armado", label: "Armado a domicilio", price: null, text: null }],
      availability: { status: "a_pedido", message: "Reserva a pedido: se fabrica al confirmar" },
    });
    expect(view.lines[1]).toMatchObject({
      status: "unavailable",
      option: "1 plaza",
      notes: ["Ya no está a la venta. Lo quitaremos de tu carrito."],
    });
  });

  it("un cuerpo inesperado no se acepta", () => {
    expect(ApiCart.safeParse({ ...apiCart, totals: { units: 1 } }).success).toBe(false);
  });

  it("el mensaje de error de la API se muestra tal cual; sin mensaje, null", () => {
    expect(
      apiMessage({ code: "VALIDATION_ERROR", message: "Solo puedes agregar 1 unidad más." }),
    ).toBe("Solo puedes agregar 1 unidad más.");
    expect(apiMessage({ code: "X" })).toBeNull();
    expect(apiMessage(null)).toBeNull();
  });
});

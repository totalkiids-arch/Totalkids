import { describe, expect, it } from "vitest";

import { addLine, type CartLine } from "../domain/cart";
import { freeShippingProgress, priceCart } from "./price-cart";
import type { CartProduct } from "./ports";

const product = (overrides: Partial<CartProduct> = {}): CartProduct => ({
  slug: "cuna-alta-junji",
  name: "Cuna alta JUNJI",
  image: null,
  sku: "TK-1",
  option: null,
  price: 100000,
  compareAtPrice: null,
  available: 20,
  extras: [
    { id: "armado", label: "Armado a domicilio", price: 15000, personalization: null },
    {
      id: "nombre",
      label: "Nombre",
      price: null,
      personalization: { label: "Nombre", maxLength: 12 },
    },
  ],
  ...overrides,
});

const line = (overrides: Partial<CartLine> = {}): CartLine => {
  const [created] = addLine([], {
    slug: "cuna-alta-junji",
    sku: "TK-1",
    quantity: 1,
    extras: [],
    texts: {},
    ...overrides,
  });
  if (!created) throw new Error("addLine no creó la línea");
  return created;
};

const price = (lines: CartLine[], products: (CartProduct | null)[]) =>
  priceCart(lines, new Map(lines.map((l, i) => [l.id, products[i] ?? null])));

describe("priceCart", () => {
  it("suma precio y extras por cantidad", () => {
    const cart = price([line({ quantity: 2, extras: ["armado"] })], [product()]);
    expect(cart.lines[0]?.total).toBe(230000);
    expect([cart.subtotal, cart.units, cart.changed, cart.blocked]).toEqual([
      230000,
      2,
      false,
      false,
    ]);
  });

  it("quita productos que ya no se venden", () => {
    const cart = price([line(), line({ sku: "TK-2", slug: "otro" })], [product(), null]);
    expect(cart.removed).toEqual(["otro"]);
    expect(cart.lines).toHaveLength(1);
    expect(cart.changed).toBe(true);
    expect(cart.normalized).toHaveLength(1);
  });

  it("ajusta la cantidad al stock e informa", () => {
    const cart = price([line({ quantity: 5 })], [product({ available: 2 })]);
    expect(cart.lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2, status: "adjusted" });
    expect(cart.lines[0]?.note).toContain("Ajustamos la cantidad a 2");
    expect(cart.normalized[0]?.quantity).toBe(2);
  });

  it("una línea agotada bloquea el pago y no suma", () => {
    const cart = price(
      [line(), line({ sku: "TK-2" })],
      [product(), product({ sku: "TK-2", available: 0 })],
    );
    expect(cart.lines[1]?.status).toBe("unavailable");
    expect([cart.subtotal, cart.units, cart.blocked]).toEqual([100000, 1, true]);
  });

  it("descarta extras que dejaron de ofrecerse", () => {
    const cart = price([line({ extras: ["armado"] })], [product({ extras: [] })]);
    expect(cart.lines[0]?.extras).toEqual([]);
    expect(cart.lines[0]?.status).toBe("adjusted");
    expect(cart.normalized[0]?.extras).toEqual([]);
  });

  it("lista lo que aún no tiene precio y no lo suma", () => {
    const cart = price(
      [line({ extras: ["nombre"], texts: { nombre: "Sofía" } }), line({ sku: "TK-2" })],
      [product(), product({ sku: "TK-2", name: "Silla", price: null })],
    );
    expect(cart.unpriced).toEqual(["Nombre", "Silla"]);
    expect(cart.subtotal).toBe(100000);
    expect(cart.lines[0]?.extras[0]?.text).toBe("Sofía");
  });
});

describe("freeShippingProgress", () => {
  it("calcula lo que falta y el porcentaje", () => {
    expect(freeShippingProgress(30000, 100000)).toEqual({ remaining: 70000, percent: 30 });
    expect(freeShippingProgress(150000, 100000)).toEqual({ remaining: 0, percent: 100 });
    expect(freeShippingProgress(1, null)).toBeNull();
  });
});

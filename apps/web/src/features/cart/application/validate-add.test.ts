import { describe, expect, it } from "vitest";

import { addLine } from "../domain/cart";
import type { CartProduct } from "./ports";
import { validateAdd } from "./validate-add";

const product: CartProduct = {
  slug: "baul",
  name: "Baúl",
  image: null,
  sku: "TK-9",
  option: null,
  price: 50000,
  compareAtPrice: null,
  available: 3,
  extras: [
    { id: "armado", label: "Armado", price: null, personalization: null },
    {
      id: "nombre",
      label: "Nombre",
      price: 5000,
      personalization: { label: "Nombre del niño", maxLength: 12 },
    },
  ],
};
const request = (overrides = {}) => ({ quantity: 1, extras: [], texts: {}, ...overrides });

describe("validateAdd", () => {
  it("acepta una combinación válida y limpia los textos", () => {
    expect(
      validateAdd(product, request({ extras: ["nombre"], texts: { nombre: " Sofía " } }), []),
    ).toEqual({
      ok: true,
      input: {
        slug: "baul",
        sku: "TK-9",
        quantity: 1,
        extras: ["nombre"],
        texts: { nombre: "Sofía" },
      },
    });
  });

  it("rechaza productos inexistentes y acepta los que no tienen stock (a pedido)", () => {
    expect(validateAdd(null, request(), []).ok).toBe(false);
    expect(validateAdd({ ...product, available: 0 }, request(), []).ok).toBe(true);
  });

  it("cuenta lo que ya está en el carrito contra el máximo por línea", () => {
    const inCart = addLine([], { slug: "baul", sku: "TK-9", quantity: 8, extras: [], texts: {} });
    expect(validateAdd(product, request({ quantity: 2 }), inCart)).toEqual({
      ok: false,
      error: "Solo puedes agregar 1 unidad más.",
    });
  });

  it("rechaza cantidades fuera de rango, extras desconocidos y textos inválidos", () => {
    expect(validateAdd(product, request({ quantity: 0 }), []).ok).toBe(false);
    expect(validateAdd(product, request({ extras: ["pintura-oro"] }), []).ok).toBe(false);
    expect(validateAdd(product, request({ extras: ["nombre"] }), []).ok).toBe(false);
    expect(
      validateAdd(
        product,
        request({ extras: ["nombre"], texts: { nombre: "Maximiliano Andrés" } }),
        [],
      ).ok,
    ).toBe(false);
  });
});

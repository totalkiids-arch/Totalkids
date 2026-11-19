import { describe, expect, it } from "vitest";

import {
  addLine,
  CartFullError,
  countUnits,
  lineId,
  MAX_LINES,
  removeLine,
  setQuantity,
  type CartLineInput,
} from "./cart";
import { parseCart, serializeCart } from "./cart-cookie";

const input = (overrides: Partial<CartLineInput> = {}): CartLineInput => ({
  slug: "cuna-alta-junji",
  sku: "TK-6536",
  quantity: 1,
  extras: [],
  texts: {},
  ...overrides,
});

describe("addLine", () => {
  it("suma unidades a la misma combinación", () => {
    const once = addLine([], input({ quantity: 2 }));
    const twice = addLine(once, input({ quantity: 3 }));
    expect(twice).toHaveLength(1);
    expect(twice[0]?.quantity).toBe(5);
  });

  it("separa líneas con extras o textos distintos", () => {
    let lines = addLine([], input());
    lines = addLine(lines, input({ extras: ["armado"] }));
    lines = addLine(lines, input({ extras: ["nombre"], texts: { nombre: "Sofía" } }));
    lines = addLine(lines, input({ extras: ["nombre"], texts: { nombre: "Tomás" } }));
    expect(lines).toHaveLength(4);
  });

  it("el orden de los extras y los espacios no crean líneas nuevas", () => {
    const a = addLine([], input({ extras: ["armado", "nombre"], texts: { nombre: "Sofía " } }));
    const b = addLine(a, input({ extras: ["nombre", "armado"], texts: { nombre: "Sofía" } }));
    expect(b).toHaveLength(1);
    expect(b[0]?.quantity).toBe(2);
  });

  it("descarta textos de extras no elegidos", () => {
    const [line] = addLine([], input({ texts: { nombre: "Sofía" } }));
    expect(line?.texts).toEqual({});
  });

  it("no pasa del tope por línea", () => {
    const lines = addLine(addLine([], input({ quantity: 8 })), input({ quantity: 5 }));
    expect(lines[0]?.quantity).toBe(9);
  });

  it("limita la cantidad de productos distintos", () => {
    let lines = Array.from({ length: MAX_LINES }, (_, i) => input({ sku: `TK-${i}` })).reduce(
      addLine,
      [] as ReturnType<typeof addLine>,
    );
    expect(() => addLine(lines, input({ sku: "TK-nuevo" }))).toThrow(CartFullError);
    lines = addLine(lines, input({ sku: "TK-0" }));
    expect(lines).toHaveLength(MAX_LINES);
  });
});

describe("setQuantity, removeLine y countUnits", () => {
  const lines = addLine(addLine([], input({ quantity: 2 })), input({ sku: "TK-2", quantity: 3 }));
  const first = lines[0]?.id ?? "";

  it("cambia la cantidad y elimina con 0", () => {
    expect(setQuantity(lines, first, 4)[0]?.quantity).toBe(4);
    expect(setQuantity(lines, first, 0)).toHaveLength(1);
    expect(setQuantity(lines, first, 99)[0]?.quantity).toBe(9);
  });

  it("elimina y cuenta unidades", () => {
    expect(removeLine(lines, first).map((l) => l.sku)).toEqual(["TK-2"]);
    expect(countUnits(lines)).toBe(5);
  });

  it("lineId es estable", () => {
    expect(lineId({ sku: "A", extras: ["b", "a"], texts: { a: "x" } })).toBe("A|a|b|a=x|b=");
  });
});

describe("cookie del carrito", () => {
  it("serializa y vuelve a leer las mismas líneas", () => {
    const lines = addLine(
      [],
      input({ quantity: 2, extras: ["nombre"], texts: { nombre: "Sofía" } }),
    );
    expect(parseCart(serializeCart(lines))).toEqual(lines);
  });

  it("un valor corrupto o manipulado es un carrito vacío", () => {
    expect(parseCart(undefined)).toEqual([]);
    expect(parseCart("{no es json")).toEqual([]);
    expect(parseCart(JSON.stringify({ v: 2, l: [] }))).toEqual([]);
  });

  it("descarta solo las líneas inválidas y topa la cantidad", () => {
    const lines = parseCart(
      JSON.stringify({
        v: 1,
        l: [
          { s: "../etc", k: "TK-1", q: 1 },
          { s: "baul", k: "TK-2", q: 500 },
          { s: "cuna", k: "TK-3", q: -1 },
        ],
      }),
    );
    expect(lines.map((l) => [l.slug, l.quantity])).toEqual([["baul", 9]]);
  });
});

import { describe, expect, it } from "vitest";

import {
  clampQuantity,
  discountPercent,
  findVariant,
  initialOption,
  lineTotal,
  maxQuantity,
  stockStatus,
  validatePersonalization,
  type ProductVariant,
} from "./product-detail";

const variant = (v: Partial<ProductVariant>): ProductVariant => ({
  sku: `SKU-${v.option ?? "unica"}`,
  option: null,
  price: 100000,
  compareAtPrice: null,
  available: 5,
  ...v,
});

describe("selección de variante", () => {
  const bed = {
    variants: [
      variant({ option: "1 plaza", available: 0 }),
      variant({ option: "1,5 plazas", available: 4 }),
    ],
  };

  it("parte por la primera variante con stock", () => {
    expect(initialOption(bed)).toBe("1,5 plazas");
  });

  it("encuentra la variante elegida", () => {
    expect(findVariant(bed, "1 plaza")?.available).toBe(0);
    expect(findVariant(bed, "2 plazas")).toBeNull();
  });

  it("un producto sin variantes tiene una sola opción null", () => {
    const simple = { variants: [variant({ option: null })] };
    expect(initialOption(simple)).toBeNull();
    expect(findVariant(simple, null)?.sku).toBe("SKU-unica");
  });
});

describe("stock y cantidad", () => {
  it("clasifica la disponibilidad", () => {
    expect(stockStatus({ available: 0 })).toEqual({ kind: "out-of-stock" });
    expect(stockStatus({ available: 3 })).toEqual({ kind: "low", units: 3 });
    expect(stockStatus({ available: 4 })).toEqual({ kind: "in-stock" });
  });

  it("limita la cantidad al stock y al máximo por línea", () => {
    expect(maxQuantity({ available: 2 })).toBe(2);
    expect(maxQuantity({ available: 40 })).toBe(9);
    expect(clampQuantity(5, { available: 2 })).toBe(2);
    expect(clampQuantity(0, { available: 2 })).toBe(1);
  });

  it("una variante agotada no permite cantidad", () => {
    expect(maxQuantity({ available: 0 })).toBe(0);
    expect(clampQuantity(1, { available: 0 })).toBe(0);
  });
});

describe("precios", () => {
  it("calcula el descuento solo con ambos precios", () => {
    expect(discountPercent(80000, 100000)).toBe(20);
    expect(discountPercent(null, 100000)).toBeNull();
    expect(discountPercent(100000, 100000)).toBeNull();
  });

  it("suma los extras al precio unitario y multiplica por la cantidad", () => {
    expect(lineTotal({ price: 100000 }, [{ price: 15000 }, { price: 5000 }], 2)).toBe(240000);
  });

  it("no inventa un total si falta algún precio", () => {
    expect(lineTotal({ price: null }, [], 1)).toBeNull();
    expect(lineTotal({ price: 100000 }, [{ price: null }], 1)).toBeNull();
  });
});

describe("validatePersonalization", () => {
  const name = { personalization: { label: "Nombre del niño", hint: "", maxLength: 12 } };

  it("exige el texto y respeta el largo máximo", () => {
    expect(validatePersonalization(name, "  ")).toBe("Escribe el nombre del niño.");
    expect(validatePersonalization(name, "Maximiliano Andrés")).toBe(
      "Usa como máximo 12 caracteres.",
    );
    expect(validatePersonalization(name, " Sofía ")).toBeNull();
  });

  it("un extra sin personalización no se valida", () => {
    expect(validatePersonalization({ personalization: null }, "")).toBeNull();
  });
});

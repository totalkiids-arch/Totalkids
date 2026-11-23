import { describe, expect, it } from "vitest";

import { lineKey, normalizeText } from "../src/services/cart/line-key.js";
import { type LineSnapshot, priceCart } from "../src/services/cart/pricing.js";
import {
  couponDiscount,
  couponRejection,
  normalizeCouponCode,
  type CouponRules,
} from "../src/services/coupons.js";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const rules = (over: Partial<CouponRules> = {}): CouponRules => ({
  kind: "percent",
  value: 10,
  startsOn: day("2026-11-01"),
  endsOn: day("2026-11-30"),
  maxUses: 5,
  usesCount: 0,
  active: true,
  ...over,
});

function line(over: Partial<LineSnapshot> = {}): LineSnapshot {
  return {
    id: "l1",
    quantity: 1,
    sku: "TK-1",
    optionLabel: null,
    variantPrice: 10_000,
    compareAtPrice: null,
    inStock: 3,
    sellable: true,
    product: { slug: "silla", name: "Silla", leadTime: null, image: null },
    extras: [],
    ...over,
  };
}

describe("lineKey (RF-05)", () => {
  it("misma combinación, misma clave; orden de extras y espacios no importan", () => {
    const a = lineKey("TK-1", [
      { code: "nombre", text: "  Sofía   Pérez " },
      { code: "armado", text: null },
    ]);
    const b = lineKey("TK-1", [
      { code: "armado", text: null },
      { code: "nombre", text: "Sofía Pérez" },
    ]);
    expect(a).toBe(b);
    expect(a.length).toBeLessThanOrEqual(400);
    expect(lineKey("TK-1", [{ code: "nombre", text: "Tomás" }])).not.toBe(a);
    expect(lineKey("TK-1", [])).toBe("TK-1");
    // Mayúsculas y tildes se conservan: es el nombre de un niño.
    expect(normalizeText("sofía")).not.toBe(normalizeText("Sofia"));
  });
});

describe("cupones (RF-07, RN-01)", () => {
  it("normaliza el código", () => {
    expect(normalizeCouponCode(" kids 10 ")).toBe("KIDS10");
  });

  it("vigencia en días de Chile, ambos inclusive, cupo e inactivo", () => {
    expect(couponRejection(rules(), "2026-11-01")).toBeNull();
    expect(couponRejection(rules(), "2026-11-30")).toBeNull();
    expect(couponRejection(rules(), "2026-10-31")).toBe("not_started");
    expect(couponRejection(rules(), "2026-12-01")).toBe("expired");
    expect(couponRejection(rules({ usesCount: 5 }), "2026-11-10")).toBe("exhausted");
    expect(couponRejection(rules({ active: false }), "2026-11-10")).toBe("inactive");
    expect(couponRejection(null, "2026-11-10")).toBe("not_found");
  });

  it("porcentaje redondeado al peso y tope en el subtotal elegible", () => {
    expect(couponDiscount({ kind: "percent", value: 15 }, 9_990)).toBe(1_499); // 1498,5
    expect(couponDiscount({ kind: "percent", value: 15 }, 9_970)).toBe(1_496); // 1495,5
    expect(couponDiscount({ kind: "percent", value: 10 }, 12_344)).toBe(1_234); // 1234,4
    expect(couponDiscount({ kind: "percent", value: 100 }, 7_000)).toBe(7_000);
    expect(couponDiscount({ kind: "amount", value: 20_000 }, 7_000)).toBe(7_000);
    expect(couponDiscount({ kind: "amount", value: 5_000 }, 0)).toBe(0);
  });
});

describe("priceCart (RF-06 a RF-08)", () => {
  it("despacho gratis sobre subtotal − descuento", () => {
    const cart = priceCart({
      lines: [line({ quantity: 5 })],
      coupon: { code: "KIDS10", ...rules() },
      freeShippingThreshold: 50_000,
      today: "2026-11-15",
    });
    expect(cart.totals).toMatchObject({
      subtotal: 50_000,
      discount: 5_000,
      totalWithoutShipping: 45_000,
    });
    expect(cart.freeShipping).toEqual({
      threshold: 50_000,
      remaining: 5_000,
      percent: 90,
      reached: false,
    });
  });

  it("un cupón que dejó de valer no descuenta y se avisa", () => {
    const cart = priceCart({
      lines: [line()],
      coupon: { code: "KIDS10", ...rules() },
      freeShippingThreshold: null,
      today: "2026-12-05",
    });
    expect(cart.coupon).toMatchObject({ valid: false, reason: "expired", discount: 0 });
    expect(cart.notices).toEqual([
      { code: "coupon_removed", message: "El cupón «KIDS10» ya no está vigente y no se aplica." },
    ]);
    expect(cart.totals.discount).toBe(0);
  });

  it("extras con precio suman por unidad; sin precio quedan por confirmar", () => {
    const cart = priceCart({
      lines: [
        line({
          quantity: 2,
          extras: [
            { code: "armado", name: "Armado", text: null, offered: true, price: 5_000 },
            { code: "nombre", name: "Nombre", text: "Ana", offered: true, price: null },
          ],
        }),
      ],
      coupon: null,
      freeShippingThreshold: null,
      today: "2026-11-15",
    });
    expect(cart.lines[0]).toMatchObject({ unitPrice: 15_000, lineTotal: 30_000 });
    expect(cart.totals.unpriced).toEqual(["Nombre"]);
    expect(cart.canCheckout).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  cartTotals,
  lineKey,
  MAX_LINES,
  MAX_QUANTITY_PER_SKU,
  priceCart,
  quantityError,
  validateAdd,
  type CatalogVariant,
  type StoredLine,
} from "../src/domain/cart.js";
import {
  checkCoupon,
  couponDiscount,
  normalizeCouponCode,
  type CouponRow,
} from "../src/domain/coupon.js";
import { quoteShipping, type ShippingZoneRow } from "../src/domain/shipping.js";

const ARMADO = {
  extraId: "e-armado",
  code: "armado",
  name: "Armado a domicilio",
  price: 15_000,
  personalization: null,
};
const NOMBRE = {
  extraId: "e-nombre",
  code: "nombre",
  name: "Nombre grabado",
  price: 5_000,
  personalization: { label: "Nombre", maxLength: 12 },
};

const variant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({
  variantId: "v1",
  sku: "TK-6536",
  productSlug: "cuna-alta-junji",
  productName: "Cuna alta JUNJI",
  optionLabel: null,
  imageUrl: "/productos/cuna/1.webp",
  price: 245_990,
  compareAtPrice: null,
  available: 0,
  leadTime: null,
  extras: [ARMADO, NOMBRE],
  ...overrides,
});

describe("lineKey", () => {
  it("una misma combinación da la misma clave, sin importar el orden ni espacios", () => {
    expect(
      lineKey("TK-1", [
        { code: "nombre", text: " Sofía " },
        { code: "armado", text: null },
      ]),
    ).toBe(
      lineKey("TK-1", [
        { code: "armado", text: null },
        { code: "nombre", text: "Sofía" },
      ]),
    );
  });

  it("otro texto u otro extra es otra línea", () => {
    expect(lineKey("TK-1", [{ code: "nombre", text: "Sofía" }])).not.toBe(
      lineKey("TK-1", [{ code: "nombre", text: "Tomás" }]),
    );
    expect(lineKey("TK-1", [])).not.toBe(lineKey("TK-1", [{ code: "armado", text: null }]));
  });
});

describe("validateAdd", () => {
  it("acepta la variante con extras y textos válidos", () => {
    const result = validateAdd(
      variant(),
      { quantity: 2, extras: [{ code: "armado" }, { code: "nombre", text: " Sofía " }] },
      [],
    );
    expect(result).toEqual({
      ok: true,
      key: "TK-6536|armado|nombre=Sofía",
      quantity: 2,
      extras: [
        { extraId: "e-armado", text: null },
        { extraId: "e-nombre", text: "Sofía" },
      ],
    });
  });

  it("todo se fabrica a pedido: sin stock igual se puede agregar", () => {
    expect(validateAdd(variant({ available: 0 }), { quantity: 9, extras: [] }, []).ok).toBe(true);
  });

  it("rechaza un producto retirado o sin precio", () => {
    expect(validateAdd(null, { quantity: 1, extras: [] }, [])).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(validateAdd(variant({ price: null }), { quantity: 1, extras: [] }, [])).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("valida la cantidad, los extras y el largo del texto", () => {
    for (const quantity of [0, 10, 1.5]) {
      expect(validateAdd(variant(), { quantity, extras: [] }, [])).toMatchObject({
        ok: false,
        error: { field: "quantity" },
      });
    }
    expect(
      validateAdd(variant(), { quantity: 1, extras: [{ code: "pintura" }] }, []),
    ).toMatchObject({
      ok: false,
      error: { field: "extras", message: "Uno de los servicios elegidos ya no está disponible." },
    });
    for (const text of ["", "   ", "Un nombre muy largo"]) {
      expect(
        validateAdd(variant(), { quantity: 1, extras: [{ code: "nombre", text }] }, []),
      ).toMatchObject({
        ok: false,
        error: { message: "Revisa el nombre (máximo 12 caracteres)." },
      });
    }
  });

  it("el máximo de unidades es por SKU, sumando todas sus líneas", () => {
    const inCart = [
      { sku: "TK-6536", key: "TK-6536", quantity: 5 },
      { sku: "TK-6536", key: "TK-6536|armado", quantity: 3 },
    ];
    expect(validateAdd(variant(), { quantity: 1, extras: [] }, inCart).ok).toBe(true);
    expect(validateAdd(variant(), { quantity: 2, extras: [] }, inCart)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Solo puedes agregar 1 unidad más." },
    });
  });

  it("limita la cantidad de líneas, salvo que la combinación ya exista", () => {
    const full = Array.from({ length: MAX_LINES }, (_, i) => ({
      sku: `TK-${i}`,
      key: `TK-${i}`,
      quantity: 1,
    }));
    expect(validateAdd(variant(), { quantity: 1, extras: [] }, full)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    const withSame = [...full.slice(1), { sku: "TK-6536", key: "TK-6536", quantity: 1 }];
    expect(validateAdd(variant(), { quantity: 1, extras: [] }, withSame).ok).toBe(true);
  });
});

describe("quantityError", () => {
  it("permite 0 (quitar) hasta el máximo por SKU contando las otras líneas", () => {
    expect(quantityError(0, 0)).toBeNull();
    expect(quantityError(MAX_QUANTITY_PER_SKU, 0)).toBeNull();
    expect(quantityError(5, 4)).toBeNull();
    expect(quantityError(6, 4)).toMatch(/hasta 5/);
    expect(quantityError(-1, 0)).toMatch(/entre 0 y 9/);
  });
});

describe("priceCart", () => {
  const line = (overrides: Partial<StoredLine> = {}): StoredLine => ({
    id: "l1",
    variantId: "v1",
    quantity: 2,
    extras: [],
    ...overrides,
  });

  it("valoriza con precios de hoy: (precio + extras) × cantidad", () => {
    const cart = priceCart(
      [
        line({
          extras: [
            { extraId: "e-armado", text: null },
            { extraId: "e-nombre", text: "Sofía" },
          ],
        }),
      ],
      new Map([["v1", variant({ available: 5 })]]),
      "3 a 5 días hábiles",
    );
    expect(cart.lines[0]).toMatchObject({
      unitPrice: 245_990,
      extrasUnitPrice: 20_000,
      lineTotal: 531_980,
      madeToOrder: false,
      leadTime: null,
      status: "ok",
    });
    expect(cart).toMatchObject({ units: 2, subtotal: 531_980, blocked: false, changed: false });
  });

  it("marca a pedido lo que supera las unidades terminadas, con su plazo", () => {
    const general = priceCart(
      [line({ quantity: 3 })],
      new Map([["v1", variant({ available: 2 })]]),
      "10 días",
    );
    expect(general.lines[0]).toMatchObject({ madeToOrder: true, leadTime: "10 días" });
    const own = priceCart(
      [line()],
      new Map([["v1", variant({ available: 0, leadTime: "15 días hábiles" })]]),
      "10 días",
    );
    expect(own.lines[0]?.leadTime).toBe("15 días hábiles");
    // A pedido no bloquea la compra.
    expect(own.blocked).toBe(false);
  });

  it("un producto retirado o sin precio bloquea el pago y no suma", () => {
    const cart = priceCart(
      [line({ id: "a", variantId: "gone" }), line({ id: "b", variantId: "v2" }), line({ id: "c" })],
      new Map([
        ["v1", variant()],
        ["v2", variant({ variantId: "v2", sku: "TK-2", price: null })],
      ]),
      "10 días",
    );
    expect(cart.lines.map((l) => l.status)).toEqual(["unavailable", "unavailable", "ok"]);
    expect(cart.subtotal).toBe(491_980);
    expect(cart).toMatchObject({ blocked: true, changed: true, units: 2 });
  });

  it("descarta extras que ya no se ofrecen e informa los de precio por confirmar", () => {
    const cart = priceCart(
      [
        line({
          extras: [
            { extraId: "e-armado", text: null },
            { extraId: "e-retirado", text: null },
          ],
        }),
      ],
      new Map([["v1", variant({ extras: [{ ...ARMADO, price: null }] })]]),
      "10 días",
    );
    expect(cart.lines[0]).toMatchObject({
      status: "adjusted",
      extrasUnitPrice: 0,
      lineTotal: 491_980,
    });
    expect(cart.unpriced).toEqual(["Armado a domicilio"]);
    expect(cart.droppedExtras.get("l1")).toEqual(["e-retirado"]);
  });
});

describe("cartTotals", () => {
  it("total = subtotal − descuento + despacho; el despacho por confirmar no suma", () => {
    expect(cartTotals(100_000, 10_000, 4_990)).toEqual({
      subtotal: 100_000,
      discount: 10_000,
      shipping: 4_990,
      total: 94_990,
    });
    expect(cartTotals(100_000, 0, null).total).toBe(100_000);
    // El descuento nunca supera el subtotal.
    expect(cartTotals(5_000, 8_000, 0)).toMatchObject({ discount: 5_000, total: 0 });
  });
});

describe("cupones", () => {
  const coupon = (overrides: Partial<CouponRow> = {}): CouponRow => ({
    code: "APRENDER10",
    kind: "percent",
    value: 10,
    startsOn: "2026-11-01",
    endsOn: "2026-11-30",
    maxUses: 100,
    usesCount: 12,
    active: true,
    ...overrides,
  });
  const TODAY = "2026-11-23";

  it("normaliza el código: mayúsculas y sin espacios", () => {
    expect(normalizeCouponCode(" aprender 10 ")).toBe("APRENDER10");
  });

  it("el porcentaje se redondea al peso y el descuento no supera el subtotal", () => {
    expect(couponDiscount({ kind: "percent", value: 10 }, 12_345)).toBe(1_235);
    expect(couponDiscount({ kind: "percent", value: 15 }, 99_990)).toBe(14_999);
    expect(couponDiscount({ kind: "amount", value: 30_000 }, 20_000)).toBe(20_000);
  });

  it("aplica un cupón vigente con cupo", () => {
    expect(checkCoupon(coupon(), 100_000, TODAY)).toEqual({
      ok: true,
      code: "APRENDER10",
      discount: 10_000,
    });
    // Los extremos de la vigencia son inclusivos.
    expect(checkCoupon(coupon(), 1_000, "2026-11-01").ok).toBe(true);
    expect(checkCoupon(coupon(), 1_000, "2026-11-30").ok).toBe(true);
  });

  it("explica por qué no se puede usar", () => {
    const reason = (row: CouponRow | null, today = TODAY) => {
      const result = checkCoupon(row, 100_000, today);
      return result.ok ? null : result.reason;
    };
    expect(reason(null)).toBe("not_found");
    expect(reason(coupon({ active: false }))).toBe("inactive");
    expect(reason(coupon(), "2026-10-31")).toBe("not_started");
    expect(reason(coupon(), "2026-12-01")).toBe("expired");
    expect(reason(coupon({ usesCount: 100 }))).toBe("exhausted");
  });
});

describe("quoteShipping", () => {
  const zone = (overrides: Partial<ShippingZoneRow> = {}): ShippingZoneRow => ({
    price: 4_990,
    active: true,
    freeShippingEligible: true,
    leadTime: "3 a 5 días hábiles",
    ...overrides,
  });

  it("el retiro en taller es gratis", () => {
    expect(quoteShipping("retiro", 10_000, zone(), null)).toEqual({
      method: "retiro",
      cost: 0,
      reason: "pickup",
      leadTime: null,
    });
  });

  it("despacho: tarifa de la zona o gratis desde el umbral si la zona lo admite", () => {
    expect(quoteShipping("despacho", 50_000, zone(), 150_000)).toMatchObject({
      cost: 4_990,
      reason: "zone",
    });
    expect(quoteShipping("despacho", 150_000, zone(), 150_000)).toMatchObject({
      cost: 0,
      reason: "threshold",
    });
    expect(
      quoteShipping("despacho", 150_000, zone({ freeShippingEligible: false }), 150_000),
    ).toMatchObject({ cost: 4_990, reason: "zone" });
  });

  it("sin zona habilitada o con tarifa a coordinar, queda por confirmar", () => {
    expect(quoteShipping("despacho", 50_000, null, null)).toMatchObject({
      cost: null,
      reason: "zone",
    });
    expect(quoteShipping("despacho", 50_000, zone({ active: false }), null).cost).toBeNull();
    expect(quoteShipping("despacho", 50_000, zone({ price: null }), null).cost).toBeNull();
    // Sin zona, el umbral igual aplica.
    expect(quoteShipping("despacho", 200_000, null, 150_000)).toMatchObject({
      cost: 0,
      reason: "threshold",
    });
  });
});

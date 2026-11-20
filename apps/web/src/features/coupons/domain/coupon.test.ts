import { describe, expect, it } from "vitest";

import {
  addDays,
  canDeleteCoupon,
  chileToday,
  couponDiscount,
  couponStatus,
  IN_USE_CANNOT_DELETE,
  isIsoDate,
  LOCKED_BY_USES,
  normalizeCouponCode,
  parseClpAmount,
  sortCoupons,
  validateCoupon,
  type Coupon,
  type CouponInput,
} from "./coupon";

const coupon = (id: string, overrides: Partial<Coupon> = {}): Coupon => ({
  id,
  code: "APRENDER10",
  kind: "percent",
  value: 10,
  startsOn: "2026-11-01",
  endsOn: "2026-12-31",
  maxUses: 100,
  uses: 0,
  active: true,
  ...overrides,
});

const input = (overrides: Partial<CouponInput> = {}): CouponInput => ({
  code: "nuevo15",
  kind: "percent",
  value: "15",
  startsOn: "2026-11-20",
  endsOn: "2026-12-31",
  maxUses: "50",
  active: true,
  ...overrides,
});

const errorsOf = (result: ReturnType<typeof validateCoupon>) => (result.ok ? {} : result.errors);

describe("normalizeCouponCode", () => {
  it("pasa a mayúsculas y quita espacios", () => {
    expect(normalizeCouponCode("  aprender 10 ")).toBe("APRENDER10");
  });
});

describe("parseClpAmount", () => {
  it("acepta enteros con o sin separador de miles y signo peso", () => {
    expect(parseClpAmount("5000")).toBe(5000);
    expect(parseClpAmount("5.000")).toBe(5000);
    expect(parseClpAmount("$ 12.990")).toBe(12990);
  });
  it("rechaza decimales y textos", () => {
    expect(parseClpAmount("4990,5")).toBeNull();
    expect(parseClpAmount("4990.5")).toBeNull();
    expect(parseClpAmount("49.90")).toBeNull();
    expect(parseClpAmount("-100")).toBeNull();
    expect(parseClpAmount("abc")).toBeNull();
    expect(parseClpAmount("")).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("acepta fechas reales y rechaza las imposibles", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("addDays", () => {
  it("cruza meses y años", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("chileToday", () => {
  it("usa la hora de Chile (UTC-3 en verano)", () => {
    // 01:30 UTC del 21 de noviembre es todavía 20 de noviembre en Santiago.
    expect(chileToday(new Date("2026-11-21T01:30:00Z"))).toBe("2026-11-20");
  });
});

describe("validateCoupon", () => {
  it("crea un cupón válido con el código normalizado", () => {
    const result = validateCoupon(input({ code: " nuevo 15 " }), []);
    expect(result).toEqual({
      ok: true,
      draft: {
        code: "NUEVO15",
        kind: "percent",
        value: 15,
        startsOn: "2026-11-20",
        endsOn: "2026-12-31",
        maxUses: 50,
        active: true,
      },
    });
  });

  it("rechaza un código repetido aunque cambien las mayúsculas", () => {
    const errors = errorsOf(validateCoupon(input({ code: "aprender10" }), [coupon("c1")]));
    expect(errors.code).toMatch(/ya existe/);
  });

  it("permite conservar el propio código al editar", () => {
    const own = coupon("c1");
    expect(validateCoupon(input({ code: "APRENDER10" }), [], own).ok).toBe(true);
  });

  it("valida largo y caracteres del código", () => {
    expect(errorsOf(validateCoupon(input({ code: "" }), [])).code).toBeDefined();
    expect(errorsOf(validateCoupon(input({ code: "AB" }), [])).code).toMatch(/entre 3 y 20/);
    expect(errorsOf(validateCoupon(input({ code: "A".repeat(21) }), [])).code).toMatch(
      /entre 3 y 20/,
    );
    expect(errorsOf(validateCoupon(input({ code: "NIÑO10" }), [])).code).toMatch(/solo letras/);
    expect(validateCoupon(input({ code: "VERANO_2026-A" }), []).ok).toBe(true);
  });

  it("exige un porcentaje entero entre 1 y 100", () => {
    for (const value of ["0", "101", "-5", "10.5", "", "diez"]) {
      expect(errorsOf(validateCoupon(input({ value }), [])).value).toMatch(/entre 1 y 100/);
    }
    expect(validateCoupon(input({ value: "100" }), []).ok).toBe(true);
    expect(validateCoupon(input({ value: "1" }), []).ok).toBe(true);
    expect(validateCoupon(input({ value: "20%" }), []).ok).toBe(true);
  });

  it("exige un monto fijo entero mayor que 0", () => {
    const amount = (value: string) => input({ kind: "amount", value });
    expect(errorsOf(validateCoupon(amount("4990,5"), [])).value).toMatch(/entero/);
    expect(errorsOf(validateCoupon(amount("4990.5"), [])).value).toMatch(/entero/);
    expect(errorsOf(validateCoupon(amount("0"), [])).value).toMatch(/mayor que 0/);
    const ok = validateCoupon(amount("$5.000"), []);
    expect(ok.ok && ok.draft.value).toBe(5000);
  });

  it("exige elegir un tipo válido", () => {
    expect(errorsOf(validateCoupon(input({ kind: "regalo" }), [])).kind).toBeDefined();
  });

  it("rechaza un término anterior al inicio y acepta el mismo día", () => {
    const errors = errorsOf(
      validateCoupon(input({ startsOn: "2026-12-10", endsOn: "2026-12-01" }), []),
    );
    expect(errors.endsOn).toMatch(/anterior al inicio/);
    expect(validateCoupon(input({ startsOn: "2026-12-10", endsOn: "2026-12-10" }), []).ok).toBe(
      true,
    );
  });

  it("exige fechas válidas", () => {
    const errors = errorsOf(validateCoupon(input({ startsOn: "", endsOn: "2026-02-30" }), []));
    expect(errors.startsOn).toBeDefined();
    expect(errors.endsOn).toBeDefined();
  });

  it("exige un máximo de usos entero de al menos 1", () => {
    for (const maxUses of ["0", "1.5", "", "-3"]) {
      expect(errorsOf(validateCoupon(input({ maxUses }), [])).maxUses).toMatch(/al menos 1/);
    }
  });

  it("no permite un máximo menor que los usos consumidos", () => {
    const used = coupon("c1", { uses: 12 });
    const errors = errorsOf(
      validateCoupon(input({ code: "APRENDER10", value: "10", maxUses: "11" }), [], used),
    );
    expect(errors.maxUses).toMatch(/12 usos/);
    expect(
      validateCoupon(input({ code: "APRENDER10", value: "10", maxUses: "12" }), [], used).ok,
    ).toBe(true);
  });

  describe("cupón con usos", () => {
    const used = coupon("c1", { uses: 3 });
    const same = { code: "APRENDER10", kind: "percent", value: "10" };

    it("bloquea cambiar el código, el tipo o el valor", () => {
      expect(errorsOf(validateCoupon(input({ ...same, code: "OTRO10" }), [], used)).code).toBe(
        LOCKED_BY_USES,
      );
      expect(
        errorsOf(validateCoupon(input({ ...same, kind: "amount", value: "10" }), [], used)).kind,
      ).toBe(LOCKED_BY_USES);
      expect(errorsOf(validateCoupon(input({ ...same, value: "15" }), [], used)).value).toBe(
        LOCKED_BY_USES,
      );
    });

    it("permite cambiar fechas, máximo de usos y estado", () => {
      const result = validateCoupon(
        input({
          ...same,
          startsOn: "2026-12-01",
          endsOn: "2027-01-31",
          maxUses: "500",
          active: false,
        }),
        [],
        used,
      );
      expect(result.ok).toBe(true);
    });

    it("sin usos sí se puede cambiar todo", () => {
      const fresh = coupon("c1", { uses: 0 });
      expect(
        validateCoupon(input({ code: "OTRO", kind: "amount", value: "3000" }), [], fresh).ok,
      ).toBe(true);
    });
  });
});

describe("canDeleteCoupon", () => {
  it("solo se elimina un cupón sin usos", () => {
    expect(canDeleteCoupon({ uses: 0 })).toBe(true);
    expect(canDeleteCoupon({ uses: 1 })).toBe(false);
    expect(IN_USE_CANNOT_DELETE).toMatch(/solo se puede desactivar/);
  });
});

describe("couponStatus", () => {
  const today = "2026-11-20";

  it("activo dentro de la vigencia, con usos disponibles", () => {
    expect(couponStatus(coupon("c"), today)).toBe("active");
    expect(couponStatus(coupon("c", { startsOn: today, endsOn: today }), today)).toBe("active");
  });
  it("programado antes del inicio y vencido después del término", () => {
    expect(couponStatus(coupon("c", { startsOn: "2026-12-01" }), today)).toBe("scheduled");
    expect(couponStatus(coupon("c", { endsOn: "2026-11-19" }), today)).toBe("expired");
  });
  it("agotado manda sobre vencido; inactivo manda sobre todo", () => {
    const exhausted = coupon("c", { uses: 100, maxUses: 100, endsOn: "2026-10-01" });
    expect(couponStatus(exhausted, today)).toBe("exhausted");
    expect(couponStatus({ ...exhausted, active: false }, today)).toBe("inactive");
  });
});

describe("couponDiscount", () => {
  it("redondea el porcentaje al peso más cercano", () => {
    expect(couponDiscount(12_345, { kind: "percent", value: 15 })).toBe(1852); // 1851,75
    expect(couponDiscount(12_343, { kind: "percent", value: 10 })).toBe(1234); // 1234,3
    expect(couponDiscount(10_005, { kind: "percent", value: 10 })).toBe(1001); // 1000,5
  });
  it("no supera el subtotal elegible", () => {
    expect(couponDiscount(3000, { kind: "amount", value: 5000 })).toBe(3000);
    expect(couponDiscount(3000, { kind: "percent", value: 100 })).toBe(3000);
  });
  it("sin subtotal no hay descuento", () => {
    expect(couponDiscount(0, { kind: "amount", value: 5000 })).toBe(0);
  });
});

describe("sortCoupons", () => {
  it("ordena activos primero y luego por código", () => {
    const list = [
      coupon("a", { code: "ZETA", active: false }),
      coupon("b", { code: "BETA" }),
      coupon("c", { code: "ALFA", endsOn: "2026-01-01" }),
      coupon("d", { code: "AAA" }),
    ];
    expect(sortCoupons(list, "2026-11-20").map((c) => c.code)).toEqual([
      "AAA",
      "BETA",
      "ALFA",
      "ZETA",
    ]);
  });
});

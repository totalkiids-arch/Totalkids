import { describe, expect, it } from "vitest";

import { REGIONS } from "@/shared/config/regions";

import {
  parseClp,
  sortZones,
  validateSettings,
  validateZone,
  type ShippingZone,
} from "./shipping-zone";

const zone = (id: string, overrides: Partial<ShippingZone> = {}): ShippingZone => ({
  id,
  region: "RM",
  commune: "Ñuñoa",
  price: 4990,
  leadTime: "3 a 5 días hábiles",
  active: true,
  ...overrides,
});

const input = (overrides: Partial<Parameters<typeof validateZone>[0]> = {}) => ({
  region: "RM",
  commune: "Providencia",
  price: "4990",
  leadTime: "3 a 5 días hábiles",
  active: true,
  ...overrides,
});

describe("montos en pesos", () => {
  it("acepta enteros con o sin puntos y signo peso", () => {
    expect(parseClp("4990")).toBe(4990);
    expect(parseClp("4.990")).toBe(4990);
    expect(parseClp(" $ 4.990 ")).toBe(4990);
    expect(parseClp("0")).toBe(0);
  });

  it("rechaza decimales, negativos y texto", () => {
    expect(parseClp("4990,5")).toBeNull();
    expect(parseClp("-1")).toBeNull();
    expect(parseClp("")).toBeNull();
    expect(parseClp("gratis")).toBeNull();
  });
});

describe("validar zona", () => {
  it("normaliza espacios y devuelve la zona lista", () => {
    const result = validateZone(input({ commune: "  Las   Condes ", price: "$5.990" }), []);
    expect(result).toEqual({
      ok: true,
      draft: {
        region: "RM",
        commune: "Las Condes",
        price: 5990,
        leadTime: "3 a 5 días hábiles",
        active: true,
      },
    });
  });

  it("marca cada campo inválido", () => {
    const result = validateZone(
      input({ region: "XX", commune: " ", price: "abc", leadTime: "" }),
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["commune", "leadTime", "price", "region"]);
    }
  });

  it("no repite una comuna en la misma región, aunque cambien tildes o mayúsculas", () => {
    const result = validateZone(input({ commune: "NUNOA" }), [zone("1")]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.commune).toMatch(/ya tiene una zona/);
  });

  it("permite el mismo nombre de comuna en otra región", () => {
    expect(validateZone(input({ region: "VS", commune: "Ñuñoa" }), [zone("1")]).ok).toBe(true);
  });

  it("acepta tarifa 0 y rechaza montos desmedidos", () => {
    expect(validateZone(input({ price: "0" }), []).ok).toBe(true);
    expect(validateZone(input({ price: "5000000" }), []).ok).toBe(false);
  });

  it("limita el largo de comuna y plazo", () => {
    expect(validateZone(input({ commune: "x".repeat(81) }), []).ok).toBe(false);
    expect(validateZone(input({ leadTime: "x".repeat(61) }), []).ok).toBe(false);
  });
});

describe("validar condiciones generales", () => {
  const settings = (overrides: Partial<Parameters<typeof validateSettings>[0]> = {}) =>
    validateSettings({
      pickup: "Tienda, lunes a viernes 10 a 18 h",
      freeShippingThreshold: "150.000",
      reservationMinutes: "15",
      ...overrides,
    });

  it("lee montos y minutos", () => {
    expect(settings()).toEqual({
      ok: true,
      settings: {
        pickup: "Tienda, lunes a viernes 10 a 18 h",
        freeShippingThreshold: 150000,
        reservationMinutes: 15,
      },
    });
  });

  it("umbral vacío significa sin despacho gratis", () => {
    const result = settings({ freeShippingThreshold: "  " });
    expect(result.ok && result.settings.freeShippingThreshold).toBeNull();
  });

  it("rechaza retiro vacío, umbral inválido y minutos fuera de rango", () => {
    const result = settings({
      pickup: "",
      freeShippingThreshold: "mucho",
      reservationMinutes: "0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "freeShippingThreshold",
        "pickup",
        "reservationMinutes",
      ]);
    }
    expect(settings({ reservationMinutes: "121" }).ok).toBe(false);
    expect(settings({ reservationMinutes: "1.5" }).ok).toBe(false);
    expect(settings({ reservationMinutes: "120" }).ok).toBe(true);
  });
});

describe("orden de zonas", () => {
  it("ordena por región de norte a sur y luego por comuna", () => {
    const sorted = sortZones(
      [
        zone("a", { region: "AR", commune: "Temuco" }),
        zone("b", { commune: "Santiago" }),
        zone("c", { commune: "Ñuñoa" }),
        zone("d", { region: "VS", commune: "Viña del Mar" }),
      ],
      REGIONS.map((r) => r.code),
    );
    expect(sorted.map((z) => z.id)).toEqual(["d", "c", "b", "a"]);
  });
});

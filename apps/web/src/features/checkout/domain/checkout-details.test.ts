import { describe, expect, it } from "vitest";

import { parseCheckoutDetails, type CheckoutInput } from "./checkout-details";
import { isRegionCode, REGIONS, regionName } from "./regions";

const buyer = {
  nombre: "  María González ",
  rut: "123456785",
  correo: "Maria@Correo.CL",
  telefono: "+56 9 1234 5678",
};

const parse = (overrides: CheckoutInput = {}) =>
  parseCheckoutDetails({ ...buyer, entrega: "retiro", documento: "boleta", ...overrides });

describe("parseCheckoutDetails · comprador", () => {
  it("normaliza nombre, RUT, correo y teléfono", () => {
    const result = parse();
    expect(result).toEqual({
      ok: true,
      details: {
        buyer: {
          name: "María González",
          rut: "12.345.678-5",
          email: "maria@correo.cl",
          phone: "+56912345678",
        },
        delivery: { method: "retiro" },
        billing: { document: "boleta" },
      },
    });
  });

  it("acepta teléfonos sin +56 y con guiones o paréntesis", () => {
    for (const telefono of ["912345678", "56912345678", "(9) 1234-5678", "+56 2 2345 6789"]) {
      const result = parse({ telefono });
      expect(result.ok, telefono).toBe(true);
    }
  });

  it("informa un error por campo, listo para mostrar", () => {
    const result = parseCheckoutDetails({ entrega: "retiro", documento: "boleta" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      nombre: "Ingresa tu nombre y apellido.",
      rut: "Ingresa tu RUT.",
      correo: "Ingresa tu correo electrónico.",
      telefono: "Ingresa tu teléfono.",
    });
  });

  it("rechaza RUT con verificador incorrecto, correo y teléfono mal escritos", () => {
    const result = parse({ rut: "12.345.678-9", correo: "maria@", telefono: "1234" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.rut).toMatch(/dígito verificador/);
    expect(result.errors.correo).toMatch(/correo válido/);
    expect(result.errors.telefono).toMatch(/9 dígitos/);
  });

  it("acota el largo de los textos", () => {
    const result = parse({ nombre: "a".repeat(121) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.nombre).toMatch(/máximo 120/);
  });
});

describe("parseCheckoutDetails · entrega", () => {
  const address = {
    entrega: "domicilio",
    region: "AR",
    comuna: " Temuco ",
    direccion: "Av. Alemania 0123",
    depto: "",
    indicaciones: "",
  };

  it("despacho a domicilio exige región, comuna y dirección", () => {
    const result = parse({ entrega: "domicilio" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["comuna", "direccion", "region"]);
  });

  it("guarda la dirección y deja en null lo opcional vacío", () => {
    const result = parse(address);
    expect(result.ok && result.details.delivery).toEqual({
      method: "domicilio",
      region: "AR",
      commune: "Temuco",
      street: "Av. Alemania 0123",
      unit: null,
      notes: null,
    });
  });

  it("rechaza una región desconocida", () => {
    const result = parse({ ...address, region: "XX" });
    expect(!result.ok && result.errors.region).toBe("Elige una región.");
  });

  it("el retiro en tienda ignora los campos de dirección", () => {
    const result = parse({ ...address, entrega: "retiro", region: "XX" });
    expect(result.ok && result.details.delivery).toEqual({ method: "retiro" });
  });

  it("exige elegir un método de entrega válido", () => {
    const result = parse({ entrega: "dron" });
    expect(!result.ok && result.errors.entrega).toBe("Elige cómo quieres recibir tu pedido.");
  });
});

describe("parseCheckoutDetails · documento tributario", () => {
  const invoice = {
    documento: "factura",
    empresa_rut: "76.123.456-0",
    razon_social: "Jardín Infantil Los Peques SpA",
    giro: "Educación preescolar",
    factura_correo: "FACTURAS@peques.cl",
    factura_direccion: "Calle Uno 123",
    factura_comuna: "Temuco",
  };

  it("factura exige los datos de la empresa", () => {
    const result = parse({ documento: "factura" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "empresa_rut",
      "factura_comuna",
      "factura_correo",
      "factura_direccion",
      "giro",
      "razon_social",
    ]);
  });

  it("normaliza la factura y lee la casilla de orden de compra", () => {
    const result = parse({ ...invoice, orden_compra: "on" });
    expect(result.ok && result.details.billing).toEqual({
      document: "factura",
      rut: "76.123.456-0",
      businessName: "Jardín Infantil Los Peques SpA",
      activity: "Educación preescolar",
      email: "facturas@peques.cl",
      address: "Calle Uno 123",
      commune: "Temuco",
      purchaseOrder: true,
    });
    const without = parse(invoice);
    expect(
      without.ok &&
        without.details.billing.document === "factura" &&
        without.details.billing.purchaseOrder,
    ).toBe(false);
  });

  it("la boleta ignora los datos de factura", () => {
    const result = parse({ ...invoice, documento: "boleta", empresa_rut: "mal" });
    expect(result.ok && result.details.billing).toEqual({ document: "boleta" });
  });

  it("exige elegir boleta o factura", () => {
    const result = parse({ documento: "" });
    expect(!result.ok && result.errors.documento).toBe("Elige boleta o factura.");
  });

  it("ignora valores que no son texto", () => {
    const result = parse({ nombre: 42 });
    expect(!result.ok && result.errors.nombre).toBe("Ingresa tu nombre y apellido.");
  });
});

describe("regiones", () => {
  it("lista las 16 regiones con código único", () => {
    expect(REGIONS).toHaveLength(16);
    expect(new Set(REGIONS.map((r) => r.code)).size).toBe(16);
    expect(isRegionCode("RM")).toBe(true);
    expect(isRegionCode("rm")).toBe(false);
    expect(regionName("AR")).toBe("La Araucanía");
  });
});

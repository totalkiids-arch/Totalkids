import { describe, expect, it } from "vitest";

import { parseCheckoutDraft, pickCheckoutValues, serializeCheckoutDraft } from "./checkout-draft";
import { quoteShipping, shippingLabel } from "./shipping";

describe("borrador del checkout", () => {
  it("guarda y lee los valores del formulario", () => {
    const values = { nombre: "María", entrega: "retiro", documento: "boleta" };
    expect(parseCheckoutDraft(serializeCheckoutDraft(values))).toEqual(values);
  });

  it("descarta campos desconocidos, vacíos y que no son texto", () => {
    expect(
      pickCheckoutValues({ nombre: "María", rut: "", clave: "x", telefono: 912345678 }),
    ).toEqual({ nombre: "María" });
  });

  it("acota el largo de cada valor", () => {
    expect(pickCheckoutValues({ nombre: "a".repeat(1000) }).nombre).toHaveLength(400);
  });

  it("un formato irreconocible es un borrador vacío", () => {
    expect(parseCheckoutDraft(undefined)).toEqual({});
    expect(parseCheckoutDraft("{no es json")).toEqual({});
    expect(parseCheckoutDraft(JSON.stringify({ v: 2, d: { nombre: "x" } }))).toEqual({});
    expect(parseCheckoutDraft(JSON.stringify({ v: 1, d: { clave: "x" } }))).toEqual({});
  });
});

describe("quoteShipping", () => {
  it("el retiro en taller es gratis", () => {
    expect(quoteShipping("retiro", 10_000, null)).toEqual({
      kind: "free",
      cost: 0,
      reason: "pickup",
    });
  });

  it("el despacho es gratis desde el umbral", () => {
    expect(quoteShipping("domicilio", 150_000, 150_000)).toMatchObject({
      kind: "free",
      reason: "threshold",
    });
    expect(quoteShipping("domicilio", 149_990, 150_000).kind).toBe("pending");
  });

  it("sin umbral ni tarifas, el despacho queda por confirmar", () => {
    const quote = quoteShipping("domicilio", 1_000_000, null);
    expect(quote).toEqual({ kind: "pending", cost: null });
    expect(shippingLabel(quote)).toBe("Por confirmar");
    expect(quoteShipping("domicilio", 1_000_000, 0).kind).toBe("pending");
  });
});

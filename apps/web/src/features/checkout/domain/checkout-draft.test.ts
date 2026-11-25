import { describe, expect, it } from "vitest";

import { parseCheckoutDraft, pickCheckoutValues, serializeCheckoutDraft } from "./checkout-draft";

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

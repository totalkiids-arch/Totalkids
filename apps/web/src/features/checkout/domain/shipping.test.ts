import { describe, expect, it } from "vitest";

import { fromApiQuote, previewShipping, shippingLabel } from "./shipping";

const quote = (over: Partial<Parameters<typeof fromApiQuote>[0]>) => ({
  cost: null,
  reason: "coordinate" as const,
  leadTime: null,
  message: null,
  ...over,
});

describe("fromApiQuote", () => {
  it("retiro y umbral son gratis", () => {
    expect(fromApiQuote(quote({ cost: 0, reason: "pickup" }))).toEqual({
      kind: "free",
      cost: 0,
      reason: "pickup",
    });
    expect(fromApiQuote(quote({ cost: 0, reason: "threshold" }))).toMatchObject({
      reason: "threshold",
    });
  });

  it("una zona con tarifa se cobra; con tarifa 0 es gratis", () => {
    const rate = fromApiQuote(quote({ cost: 12_990, reason: "zone", leadTime: "3 días" }));
    expect(rate).toEqual({ kind: "rate", cost: 12_990, leadTime: "3 días" });
    expect(shippingLabel(rate)).toBe("$12.990");
    expect(fromApiQuote(quote({ cost: 0, reason: "zone" }))).toMatchObject({ kind: "free" });
  });

  it("a coordinar o tarifa por confirmar: sin costo y con el mensaje de la API", () => {
    const pending = fromApiQuote(quote({ reason: "pending_rate", message: "Te contactamos" }));
    expect(pending).toEqual({ kind: "pending", cost: null, message: "Te contactamos" });
    expect(shippingLabel(pending)).toBe("Por confirmar");
  });
});

describe("previewShipping", () => {
  it("el retiro es gratis y el despacho se calcula en el pago", () => {
    expect(previewShipping("retiro").kind).toBe("free");
    expect(previewShipping("domicilio")).toMatchObject({ kind: "pending", cost: null });
  });
});

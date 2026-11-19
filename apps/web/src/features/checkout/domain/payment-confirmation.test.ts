import { describe, expect, it } from "vitest";

import {
  parsePaymentConfirmation,
  TERMS_FIELD,
  TERMS_REQUIRED_MESSAGE,
} from "./payment-confirmation";

describe("parsePaymentConfirmation", () => {
  it("acepta la casilla de condiciones marcada", () => {
    expect(parsePaymentConfirmation({ [TERMS_FIELD]: "on" })).toEqual({ ok: true });
    expect(parsePaymentConfirmation({ [TERMS_FIELD]: "true" })).toEqual({ ok: true });
  });

  it("exige aceptar las condiciones", () => {
    const rejected = { ok: false, error: TERMS_REQUIRED_MESSAGE };
    expect(parsePaymentConfirmation({})).toEqual(rejected);
    expect(parsePaymentConfirmation({ [TERMS_FIELD]: "" })).toEqual(rejected);
    expect(parsePaymentConfirmation({ [TERMS_FIELD]: "off" })).toEqual(rejected);
    expect(parsePaymentConfirmation({ [TERMS_FIELD]: true })).toEqual(rejected);
  });
});

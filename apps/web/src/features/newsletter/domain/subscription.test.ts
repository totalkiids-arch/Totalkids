import { describe, expect, it } from "vitest";

import {
  CONSENT_VERSION,
  isConsentGiven,
  parseSubscription,
  parseUnsubscribe,
} from "./subscription";

const NOW = "2026-11-20T15:00:00.000Z";

describe("parseSubscription", () => {
  it("registra el correo normalizado con la versión y fecha del consentimiento", () => {
    expect(parseSubscription({ correo: " Camila@Correo.CL ", consentimiento: "on" }, NOW)).toEqual({
      ok: true,
      email: "camila@correo.cl",
      consent: { version: CONSENT_VERSION, acceptedAt: NOW },
    });
  });

  it("acepta el consentimiento que envía la portada", () => {
    expect(parseSubscription({ correo: "a@b.cl", consentimiento: "si" }, NOW).ok).toBe(true);
  });

  it("sin consentimiento explícito no suscribe", () => {
    for (const consentimiento of [undefined, "", "no", "off"]) {
      const result = parseSubscription({ correo: "a@b.cl", consentimiento }, NOW);
      expect(!result.ok && result.errors.consentimiento).toMatch(/Marca la casilla/);
    }
  });

  it("informa correo y consentimiento a la vez", () => {
    const result = parseSubscription({ correo: "camila@" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.correo).toMatch(/correo válido/);
    expect(result.errors.consentimiento).toBeDefined();
  });
});

describe("parseUnsubscribe", () => {
  it("solo pide el correo", () => {
    expect(parseUnsubscribe({ correo: "Camila@Correo.cl" })).toEqual({
      ok: true,
      email: "camila@correo.cl",
    });
  });

  it("rechaza un correo vacío o inválido", () => {
    expect(parseUnsubscribe({})).toEqual({ ok: false, errors: { correo: "Ingresa tu correo." } });
    expect(parseUnsubscribe({ correo: 42 }).ok).toBe(false);
  });
});

describe("isConsentGiven", () => {
  it("solo cuenta un consentimiento marcado", () => {
    expect(isConsentGiven("on")).toBe(true);
    expect(isConsentGiven("si")).toBe(true);
    expect(isConsentGiven(true)).toBe(false);
    expect(isConsentGiven("1")).toBe(false);
  });
});

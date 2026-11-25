import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toAdminTheme, toPublicTheme } from "./store-theme-api";

describe("store-theme-api", () => {
  it("lee la plantilla activa", () => {
    expect(toAdminTheme({ theme: "navidad", themes: [], updatedAt: null })).toBe("navidad");
    expect(toPublicTheme({ theme: "invierno" })).toBe("invierno");
  });

  it("en la tienda, una respuesta inesperada da la plantilla por defecto", () => {
    expect(toPublicTheme({ theme: "carnaval" })).toBe("clasica");
    expect(toPublicTheme(null)).toBe("clasica");
  });

  it("en el panel, una respuesta inesperada cuenta como API no disponible", () => {
    expect(() => toAdminTheme({ theme: "carnaval" })).toThrow(PANEL_MESSAGES.unavailable);
  });
});

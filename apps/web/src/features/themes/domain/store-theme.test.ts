import { describe, expect, it } from "vitest";

import { DEFAULT_STORE_THEME, isStoreThemeId, storeThemes } from "./store-theme";

describe("plantillas de tienda", () => {
  it("ofrece siete plantillas intercambiables y una predeterminada", () => {
    expect(storeThemes).toHaveLength(7);
    expect(storeThemes.map((theme) => theme.id)).toContain(DEFAULT_STORE_THEME);
  });

  it("acepta únicamente los identificadores de plantilla disponibles", () => {
    expect(isStoreThemeId("navidad")).toBe(true);
    expect(isStoreThemeId("verano")).toBe(false);
    expect(isStoreThemeId(undefined)).toBe(false);
  });
});

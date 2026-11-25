import "server-only";

import { randomUUID } from "node:crypto";

import { apiFetch } from "@/shared/infrastructure/api-client";

import type { StoreThemeSource } from "../application/ports";
import { DEFAULT_STORE_THEME } from "../domain/store-theme";
import { toPublicTheme } from "./store-theme-api";

/**
 * Plantilla de la tienda desde la API pública (GET /store-theme, sin sesión).
 * Se guarda 60 s con la etiqueta STORE_THEME_TAG, que el panel invalida al
 * activar otra. Si la API no responde, la tienda usa la plantilla por defecto.
 */
export const STORE_THEME_TAG = "tienda-tema";

export const apiStoreThemeSource: StoreThemeSource = {
  async current() {
    try {
      const response = await apiFetch("/api/v1/store-theme", {
        requestId: randomUUID(),
        timeoutMs: 2000,
        cache: "force-cache",
        next: { revalidate: 60, tags: [STORE_THEME_TAG] },
      });
      if (!response.ok) return DEFAULT_STORE_THEME;
      return toPublicTheme(await response.json());
    } catch {
      return DEFAULT_STORE_THEME;
    }
  },
};

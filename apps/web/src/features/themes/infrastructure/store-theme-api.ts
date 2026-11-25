import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import { DEFAULT_STORE_THEME, STORE_THEMES, type StoreThemeId } from "../domain/store-theme";

/*
 * Traducción de GET /store-theme y /admin/store-theme (apps/api/openapi.yaml).
 * Puro (sin server-only ni Next.js) para poder probarlo.
 */

const ApiTheme = z.object({ theme: z.enum(STORE_THEMES) });

/** Panel: un cuerpo inesperado cuenta como API no disponible. */
export function toAdminTheme(body: unknown): StoreThemeId {
  const parsed = ApiTheme.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data.theme;
}

/** Tienda: un cuerpo inesperado (o una plantilla que esta versión no conoce) da la por defecto. */
export function toPublicTheme(body: unknown): StoreThemeId {
  const parsed = ApiTheme.safeParse(body);
  return parsed.success ? parsed.data.theme : DEFAULT_STORE_THEME;
}

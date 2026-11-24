import { z } from "zod";

import type { AdminRole } from "@/features/users";
import { panelErrorMessage, PanelApiError, unavailableError } from "@/shared/lib/panel-errors";

import type { AdminSession, AuthResult } from "../application/admin-session";

/*
 * Traducción de las respuestas de /auth a los resultados del puerto. Puro (sin
 * server-only ni Next.js) para poder probarlo sin levantar la API.
 */

export const INVALID_RESET_LINK = "El enlace no es válido o ya venció. Pide uno nuevo.";

// Lista local (no ADMIN_ROLES): el índice de users carga su contenedor de servidor.
// `satisfies` obliga a que cada valor sea un AdminRole.
const ROLES = ["admin", "operator"] as const satisfies readonly AdminRole[];

const SessionBody = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(ROLES),
  }),
  expiresAt: z.string(),
});

/** Cuerpo de GET /auth/session → AdminSession. Un cuerpo inesperado cuenta como caída. */
export function toAdminSession(body: unknown): AdminSession {
  const parsed = SessionBody.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  const { role, ...user } = parsed.data.user;
  return { user, role, expiresAt: parsed.data.expiresAt };
}

/** Un error de la API (o de red) → resultado fallido con mensaje y errores por campo. */
export function toAuthFailure(error: unknown): Extract<AuthResult, { ok: false }> {
  const fieldErrors = error instanceof PanelApiError ? { ...error.fieldErrors } : {};
  if (fieldErrors.token) {
    delete fieldErrors.token;
    return { ok: false, message: INVALID_RESET_LINK, fieldErrors, invalidToken: true };
  }
  return { ok: false, message: panelErrorMessage(error), fieldErrors };
}

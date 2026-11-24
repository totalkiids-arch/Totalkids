import "server-only";

import { cache } from "react";

import { isPanelApiError } from "@/shared/lib/panel-errors";
import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";

import type { AdminAuthGateway, AdminSessionReader } from "../application/admin-session";
import { toAdminSession, toAuthFailure } from "./auth-api-results";

/**
 * Sesión real del panel (LN-04) a través de la API: cookie tk_panel HttpOnly
 * (__Host-tk_panel en producción), 12 h de vida o 2 h sin uso, revocable.
 * El rol se lee de la API en cada petición; la autorización la aplica el backend.
 */

/** Una sola llamada a /auth/session por petición, aunque la pidan layout, página y acciones. */
const readSession = cache(async () => {
  try {
    return toAdminSession(await panelGet("/auth/session", { onUnauthorized: "throw" }));
  } catch (error) {
    if (isPanelApiError(error) && error.kind === "unauthorized") return null;
    throw error;
  }
});

export const apiAdminSession: AdminSessionReader = { read: readSession };

export const apiAdminAuth: AdminAuthGateway = {
  async signIn(email, password) {
    try {
      await panelSend("/auth/login", {
        body: { email, password },
        renewCsrf: true,
        // Un 401 aquí son credenciales inválidas, no una sesión vencida.
        onUnauthorized: "throw",
      });
      return { ok: true };
    } catch (error) {
      return toAuthFailure(error);
    }
  },

  async signOut() {
    try {
      await panelSend("/auth/logout", { renewCsrf: true, onUnauthorized: "throw" });
    } catch {
      // Sin API no se puede revocar en la base, pero la sesión vence sola (2 h
      // sin uso). La acción igual lleva al ingreso.
    }
  },

  async requestPasswordReset(email) {
    try {
      await panelSend("/auth/password-reset/request", { body: { email }, onUnauthorized: "throw" });
      return { ok: true };
    } catch (error) {
      return toAuthFailure(error);
    }
  },

  async resetPassword(token, password) {
    try {
      await panelSend("/auth/password-reset/confirm", {
        body: { token, password },
        renewCsrf: true,
        onUnauthorized: "throw",
      });
      return { ok: true };
    } catch (error) {
      return toAuthFailure(error);
    }
  },
};

import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { UserAdmin } from "../application/ports";
import { validateUser } from "../domain/internal-user";
import { toChangedUser, toCreatedUser, toUserList } from "./admin-users-api";

/**
 * Cuentas internas en la API (solo Administrador). Crear usa POST /admin/users
 * (la API envía la invitación); editar, activar y desactivar usan
 * PATCH /admin/users/{id}, el formulario completo de la pantalla (también
 * cambia el rol, con las mismas reglas que /admin/users/{id}/role).
 */

const enc = encodeURIComponent;
const NOT_FOUND = "Esa cuenta ya no existe. Recarga la página.";

const isMissing = (error: unknown) =>
  isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation");

export const apiUserAdmin: UserAdmin = {
  async list() {
    return toUserList(await panelGet("/admin/users"));
  },

  async save(id, input) {
    const { users } = await apiUserAdmin.list();
    const existing = id === null ? null : (users.find((u) => u.id === id) ?? null);
    if (id !== null && !existing) return { ok: false, errors: { form: NOT_FOUND } };
    const result = validateUser(input, users, existing);
    if (!result.ok) return result;

    try {
      if (!existing) {
        const response = await panelSend("/admin/users", { body: result.draft });
        return { ok: true, ...toCreatedUser(response.body), sessionsRevoked: 0 };
      }
      const response = await panelSend(`/admin/users/${enc(existing.id)}`, {
        method: "PATCH",
        body: result.draft,
      });
      return { ok: true, ...toChangedUser(response.body), invitationSent: false };
    } catch (error) {
      return { ok: false, errors: businessFieldErrors(error, NOT_FOUND) };
    }
  },

  async setActive(id, active) {
    try {
      const response = await panelSend(`/admin/users/${enc(id)}`, {
        method: "PATCH",
        body: { active },
      });
      return { ok: true, ...toChangedUser(response.body) };
    } catch (error) {
      if (isMissing(error)) return { ok: false, reason: "not-found" };
      // 409: dejaría el panel sin Administradores activos, o es la propia cuenta.
      if (isPanelApiError(error) && error.kind === "conflict") {
        return { ok: false, reason: "conflict", message: error.message };
      }
      throw error;
    }
  },
};

import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { BannerAdmin } from "../application/ports";
import { validateBanner } from "../domain/banner";
import { toAdminBanner, toApiBannerBody, toBannerList } from "./banners-api";

/**
 * Banners del panel en la API (/admin/banners). Las reglas del dominio se
 * aplican antes de llamar (mismos mensajes); la API las vuelve a aplicar,
 * autoriza (solo Administrador) y registra el cambio.
 */

const enc = encodeURIComponent;
const NOT_FOUND = "Ese banner ya no existe. Recarga la página.";

const isMissing = (error: unknown) =>
  isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation");

/** La API nombra el orden `sortOrder`; el formulario, `order`. */
function toFormErrors(errors: Record<string, string>) {
  const { sortOrder, ...rest } = errors;
  return sortOrder ? { ...rest, order: sortOrder } : rest;
}

export const apiBannerAdmin: BannerAdmin = {
  async list() {
    return toBannerList(await panelGet("/admin/banners"));
  },

  async save(id, input) {
    const result = validateBanner(input);
    if (!result.ok) return result;
    try {
      const body = toApiBannerBody(result.draft);
      const response = id
        ? await panelSend(`/admin/banners/${enc(id)}`, { method: "PATCH", body })
        : await panelSend("/admin/banners", { body });
      return { ok: true, value: toAdminBanner(response.body) };
    } catch (error) {
      return { ok: false, errors: toFormErrors(businessFieldErrors(error, NOT_FOUND)) };
    }
  },

  async setActive(id, active) {
    try {
      if (active) {
        const response = await panelSend(`/admin/banners/${enc(id)}`, {
          method: "PATCH",
          body: { active: true },
        });
        return toAdminBanner(response.body);
      }
      // DELETE desactiva (204, sin cuerpo): se relee para mostrar el estado nuevo.
      await panelSend(`/admin/banners/${enc(id)}`, { method: "DELETE" });
      const banners = await apiBannerAdmin.list();
      return banners.find((b) => b.id === id) ?? null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
};

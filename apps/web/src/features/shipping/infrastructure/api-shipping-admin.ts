import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { ShippingAdmin } from "../application/ports";
import { validateSettings, validateZone } from "../domain/shipping-zone";
import {
  toApiSettingsBody,
  toApiZoneBody,
  toSettingsFormErrors,
  toShippingSettings,
  toShippingZone,
  toZoneList,
} from "./shipping-api";

/**
 * Despacho y retiro en la API. Las reglas del dominio se aplican antes de
 * llamar (mismos mensajes); la API las vuelve a aplicar, autoriza (solo
 * Administrador) y registra el cambio.
 */

const enc = encodeURIComponent;
const NOT_FOUND = "Esa zona ya no existe. Recarga la página.";

const isMissing = (error: unknown) =>
  isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation");

export const apiShippingAdmin: ShippingAdmin = {
  async listZones() {
    return toZoneList(await panelGet("/admin/shipping-zones"));
  },

  async saveZone(id, input) {
    const zones = await apiShippingAdmin.listZones();
    if (id !== null && !zones.some((z) => z.id === id)) {
      return { ok: false, errors: { form: NOT_FOUND } };
    }
    const result = validateZone(
      input,
      zones.filter((z) => z.id !== id),
    );
    if (!result.ok) return result;
    try {
      const body = toApiZoneBody(result.draft);
      const response = id
        ? await panelSend(`/admin/shipping-zones/${enc(id)}`, { method: "PATCH", body })
        : await panelSend("/admin/shipping-zones", { body });
      return { ok: true, value: toShippingZone(response.body) };
    } catch (error) {
      return { ok: false, errors: businessFieldErrors(error, NOT_FOUND) };
    }
  },

  async setZoneActive(id, active) {
    try {
      if (active) {
        const response = await panelSend(`/admin/shipping-zones/${enc(id)}`, {
          method: "PATCH",
          body: { active: true },
        });
        return toShippingZone(response.body);
      }
      // DELETE desactiva (204, sin cuerpo): se relee para mostrar el estado nuevo.
      await panelSend(`/admin/shipping-zones/${enc(id)}`, { method: "DELETE" });
      return (await apiShippingAdmin.listZones()).find((z) => z.id === id) ?? null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },

  async getSettings() {
    return toShippingSettings(await panelGet("/admin/shipping-settings"));
  },

  async saveSettings(input) {
    const result = validateSettings(input);
    if (!result.ok) return result;
    try {
      const response = await panelSend("/admin/shipping-settings", {
        method: "PUT",
        body: toApiSettingsBody(result.settings),
      });
      return { ok: true, value: toShippingSettings(response.body) };
    } catch (error) {
      return { ok: false, errors: toSettingsFormErrors(businessFieldErrors(error)) };
    }
  },
};

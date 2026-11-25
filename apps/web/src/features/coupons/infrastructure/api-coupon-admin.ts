import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { CouponAdmin } from "../application/ports";
import { validateCoupon } from "../domain/coupon";
import { toAdminCoupon, toApiCouponBody, toCouponList } from "./admin-coupons-api";

/**
 * Cupones del panel en la API (/admin/coupons). Las reglas del dominio se
 * aplican antes de llamar (mismos mensajes); la API las vuelve a aplicar,
 * autoriza (solo Administrador) y registra el cambio.
 */

const enc = encodeURIComponent;
const NOT_FOUND = "Ese cupón ya no existe. Recarga la página.";

const isMissing = (error: unknown) =>
  isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation");

export const apiCouponAdmin: CouponAdmin = {
  async list() {
    return toCouponList(await panelGet("/admin/coupons"));
  },

  async save(id, input) {
    const { coupons } = await apiCouponAdmin.list();
    const existing = id === null ? null : (coupons.find((c) => c.id === id) ?? null);
    if (id !== null && !existing) return { ok: false, errors: { form: NOT_FOUND } };

    const others = coupons.filter((c) => c.id !== id);
    const result = validateCoupon(input, others, existing);
    if (!result.ok) return result;

    try {
      const body = toApiCouponBody(result.draft, existing?.termsLocked ?? false);
      const response = existing
        ? await panelSend(`/admin/coupons/${enc(existing.id)}`, { method: "PATCH", body })
        : await panelSend("/admin/coupons", { body });
      return { ok: true, value: toAdminCoupon(response.body) };
    } catch (error) {
      return { ok: false, errors: businessFieldErrors(error, NOT_FOUND) };
    }
  },

  async setActive(id, active) {
    try {
      const response = await panelSend(`/admin/coupons/${enc(id)}`, {
        method: "PATCH",
        body: { active },
      });
      return toAdminCoupon(response.body);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },

  async remove(id) {
    try {
      await panelSend(`/admin/coupons/${enc(id)}`, { method: "DELETE" });
      return { ok: true };
    } catch (error) {
      if (isMissing(error)) return { ok: false, reason: "not-found" };
      if (isPanelApiError(error) && error.kind === "conflict") {
        return { ok: false, reason: "in-use" };
      }
      throw error;
    }
  },
};

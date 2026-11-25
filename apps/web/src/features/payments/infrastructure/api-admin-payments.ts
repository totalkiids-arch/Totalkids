import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { AdminPayments } from "../application/ports";
import { toApiPaymentSearch } from "../domain/payment-query";
import { toPaymentPage, toReconcileOutcome } from "./admin-payments-api";

const enc = encodeURIComponent;
const NOT_FOUND = "El pago ya no existe.";

/** Pagos en la API: listado, «Consultar en Flow» y resolución manual (LN-15). */
export const apiAdminPayments: AdminPayments = {
  async list(query) {
    return toPaymentPage(await panelGet(`/admin/payments?${toApiPaymentSearch(query)}`));
  },

  async reconcile(id) {
    try {
      const response = await panelSend(`/admin/payments/${enc(id)}/reconcile`);
      return { ok: true, outcome: toReconcileOutcome(response.body) };
    } catch (error) {
      if (isPanelApiError(error)) {
        // 409: ya no es el último intento abierto, o Flow no está configurado.
        if (error.kind === "conflict") return { ok: false, reason: "not-allowed" };
        if (error.kind === "not-found" || error.kind === "validation") {
          return { ok: false, reason: "not-found" };
        }
      }
      throw error;
    }
  },

  async resolve(id, input) {
    try {
      await panelSend(`/admin/payments/${enc(id)}/resolve`, {
        body: { action: input.action, reason: input.reason.trim() },
      });
      return { ok: true };
    } catch (error) {
      // 422 (motivo), 409 (la regla no lo permite) y 404 vuelven por campo.
      return { ok: false, errors: businessFieldErrors(error, NOT_FOUND) };
    }
  },
};

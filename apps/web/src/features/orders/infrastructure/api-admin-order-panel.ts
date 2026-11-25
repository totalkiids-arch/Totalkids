import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { AdminOrderPanel, PanelResult } from "../application/admin-order-panel";
import { toApiOrderSearch } from "../domain/admin-order-query";
import { toAdminOrderDetail, toOrderListPage, toPanelSummary } from "./admin-orders-api";

/**
 * Pedidos del panel en la API (LN-13). `{ref}` es el número visible ("TK-1048"),
 * que la API acepta igual que el uuid. Los cambios bloquean la fila del pedido
 * y quedan en audit_log con actor, motivo y requestId: aquí no se repiten reglas.
 */

const path = (ref: string) => `/admin/orders/${encodeURIComponent(ref)}` as const;
const NOT_FOUND = "El pedido ya no existe.";

/** Ejecuta la mutación; 422/409/404 vuelven como errores por campo. */
async function mutate(run: () => Promise<unknown>): Promise<PanelResult> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    return { ok: false, errors: businessFieldErrors(error, NOT_FOUND) };
  }
}

export const apiAdminOrderPanel: AdminOrderPanel = {
  async summary() {
    return toPanelSummary(await panelGet("/admin/summary"));
  },

  async list(query) {
    return toOrderListPage(await panelGet(`/admin/orders?${toApiOrderSearch(query)}`));
  },

  async get(ref) {
    try {
      return toAdminOrderDetail(await panelGet(path(ref)));
    } catch (error) {
      // Número con forma inválida (422) o inexistente (404): no existe.
      if (isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation"))
        return null;
      throw error;
    }
  },

  changeStatus(ref, input) {
    return mutate(() =>
      panelSend(`${path(ref)}/status`, {
        method: "PATCH",
        body: {
          to: input.to,
          reason: input.reason.trim(),
          // Transportista y seguimiento solo si vienen (al despachar a domicilio).
          ...(input.carrier.trim() ? { carrier: input.carrier.trim() } : {}),
          ...(input.code.trim() ? { code: input.code.trim() } : {}),
          restock: input.restock,
        },
      }),
    );
  },

  registerRefund(ref, input) {
    return mutate(() =>
      panelSend(`${path(ref)}/refund-records`, {
        body: {
          amount: input.amount,
          date: input.date,
          reference: input.reference.trim(),
          status: input.status,
        },
      }),
    );
  },

  resolveRefund(ref, refundId, status) {
    return mutate(() =>
      panelSend(`${path(ref)}/refund-records/${encodeURIComponent(refundId)}`, {
        method: "PATCH",
        body: { status },
      }),
    );
  },

  registerInvoice(ref, input) {
    return mutate(() =>
      panelSend(`${path(ref)}/invoice`, {
        body: input.replace
          ? { number: input.number, replace: true, reason: input.reason.trim() }
          : { number: input.number },
      }),
    );
  },
};

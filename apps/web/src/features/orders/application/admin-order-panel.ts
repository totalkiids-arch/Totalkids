import type { AdminOrderDetail, FieldErrors, PanelSummary } from "../domain/admin-order";
import type { AdminOrderListPage, AdminOrderQuery } from "../domain/admin-order-query";

export type PanelResult = { ok: true } | { ok: false; errors: FieldErrors };

/**
 * Puerto: gestión de pedidos del panel (RF-27, RF-28, RF-32, RF-34). Lo
 * implementa la API (LN-13): ella autoriza (reembolsos y corrección de folio,
 * solo Administrador), aplica las reglas y registra el actor desde la sesión.
 * Las reglas de negocio vuelven como errores por campo; 403 o la API caída se
 * lanzan como PanelApiError y un 401 lleva al ingreso.
 */
export interface AdminOrderPanel {
  /** Resumen del panel (pedidos por estado, pagos por revisar, últimos pedidos). */
  summary(): Promise<PanelSummary>;
  list(query: AdminOrderQuery): Promise<AdminOrderListPage>;
  /** `ref` = número visible ("TK-1048"). null si no existe. */
  get(ref: string): Promise<AdminOrderDetail | null>;
  changeStatus(
    ref: string,
    input: { to: string; reason: string; carrier: string; code: string; restock: boolean },
  ): Promise<PanelResult>;
  registerRefund(
    ref: string,
    input: { amount: number; date: string; reference: string; status: string },
  ): Promise<PanelResult>;
  resolveRefund(
    ref: string,
    refundId: string,
    status: "processed" | "failed",
  ): Promise<PanelResult>;
  /** Registra el folio, o lo corrige (`replace`, solo Administrador, con motivo). */
  registerInvoice(
    ref: string,
    input: { number: string; replace: boolean; reason: string },
  ): Promise<PanelResult>;
}

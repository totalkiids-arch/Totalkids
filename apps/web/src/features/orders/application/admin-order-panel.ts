import type {
  AdminOrderRecord,
  FieldErrors,
  RefundInput,
  StatusChangeInput,
} from "../domain/order-workflow";

export type PanelResult =
  { ok: true; record: AdminOrderRecord } | { ok: false; errors: FieldErrors };

/**
 * Puerto: gestión de pedidos del panel (RF-27, RF-32, RF-33, RF-34). Hoy lo
 * implementa un almacén de demostración en memoria; con LN-09/LN-16, la API
 * (PATCH /admin/orders/{id}/status, POST /admin/orders/{id}/refund-records…).
 * Cada operación valida con las reglas del dominio: la interfaz no es la única
 * defensa. `actor` lo pone el servidor desde la sesión, nunca el formulario.
 */
export interface AdminOrderPanel {
  list(): Promise<AdminOrderRecord[]>;
  /** null si no existe. */
  get(id: string): Promise<AdminOrderRecord | null>;
  changeStatus(id: string, input: StatusChangeInput, actor: string): Promise<PanelResult>;
  /** El responsable del reembolso es `actor`. */
  registerRefund(
    id: string,
    input: Omit<RefundInput, "responsible">,
    actor: string,
  ): Promise<PanelResult>;
  resolveRefund(
    id: string,
    input: { refundId: string; status: string },
    actor: string,
  ): Promise<PanelResult>;
  /** Registra el folio de la factura emitida por Total Kids. */
  registerInvoice(id: string, input: { number: string }, actor: string): Promise<PanelResult>;
  /** Consulta el estado del último intento en Flow (hoy, una respuesta simulada). */
  reconcile(
    id: string,
    input: { result: string; reason: string },
    actor: string,
  ): Promise<PanelResult>;
}

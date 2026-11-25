import type {
  DeliveryMethod,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  TaxDocument,
} from "../../generated/prisma/enums.js";

/**
 * Reglas del panel de pedidos (LN-13; RF-27, RF-32, RF-34; RN-04 a RN-06).
 * Funciones puras: la tabla de transiciones, las guardas y los textos son los
 * de `apps/web/src/features/orders/domain/order-workflow.ts`, así el panel
 * (LN-16) muestra los mismos mensajes que devuelve la API.
 */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pendiente de pago",
  in_review: "Pago en revisión",
  confirmed: "Confirmado",
  preparing: "En preparación",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
};

/** Estado del pago del pedido = el de su último intento; `none` si nunca se intentó. */
export type OrderPaymentStatus = PaymentStatus | "none";

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  rejected: "Rechazado",
  voided: "Anulado",
  in_review: "En revisión",
  expired: "Vencido",
  refund_pending: "Reembolso pendiente",
  none: "Sin pago",
};

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  requested: "Solicitado",
  processed: "Procesado",
  failed: "Fallido",
};

export type OrderRefundState = "not_requested" | RefundStatus;

/** Tabla "Estados y transiciones" de la SRS. delivered, cancelled y expired son terminales. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled", "expired"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  in_review: ["confirmed", "cancelled"],
  cancelled: [],
  expired: [],
};

/** Estados con el pago confirmado: desde aquí corresponde emitir la factura. */
export const PAID_STATUSES: readonly OrderStatus[] = [
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
];

export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const TRACKING_MAX = 80;
export const REFERENCE_MIN = 3;
export const REFERENCE_MAX = 120;
/** Folio de factura electrónica: solo dígitos, hasta 10 (sin ceros a la izquierda). */
export const INVOICE_NUMBER = /^\d{1,10}$/;

// ── Mensajes (los mismos del panel) ──────────────────────────────────────────

export const MESSAGES = {
  unpaidConfirm: "Primero concilia y confirma el pago en Pagos y conciliación.",
  unpaidShip: "Un pedido sin pago confirmado no se despacha.",
  unresolvedPayment:
    "Hay un pago sin resolver: concílialo en Pagos antes de cancelar o marcar como vencido.",
  chooseStatus: "Elige el nuevo estado.",
  reasonShort: "Escribe el motivo del cambio (mínimo 3 caracteres).",
  reasonLong: `El motivo admite hasta ${String(REASON_MAX)} caracteres.`,
  carrierMissing: "Ingresa el transportista para despachar.",
  carrierLong: `El transportista admite hasta ${String(TRACKING_MAX)} caracteres.`,
  codeMissing: "Ingresa el código de seguimiento para despachar.",
  codeLong: `El código admite hasta ${String(TRACKING_MAX)} caracteres.`,
  restockDone: "La reposición de stock ya se registró para este pedido.",
  restockNotAllowed: "La reposición de stock solo se registra al cancelar un pedido pagado.",
  cancelPaidNotice: "Cancelar no devuelve dinero: gestiona la devolución con un reembolso manual.",
  refundUnpaid: "Solo se registran reembolsos de pedidos con pago confirmado.",
  refundAmount: "Ingresa un monto entero en CLP mayor que 0.",
  refundFull: "El pedido ya tiene registrado todo lo cobrado.",
  refundDate: "Ingresa la fecha del reembolso.",
  refundFuture: "La fecha del reembolso no puede ser futura.",
  refundBeforeCharge: "La fecha no puede ser anterior al cobro.",
  refundReference: "Ingresa la referencia del comprobante.",
  refundReferenceLong: `La referencia admite hasta ${String(REFERENCE_MAX)} caracteres.`,
  refundStatus: "Elige si el reembolso está solicitado o ya procesado.",
  refundMissing: "El reembolso ya no existe.",
  refundResolved: "Ese reembolso ya fue resuelto.",
  refundResolution: "Elige Procesado o Fallido.",
  invoiceBoleta: "Este pedido es con boleta: el comprobante de Flow la reemplaza.",
  invoiceDone: "La factura de este pedido ya está registrada.",
  invoiceUnpaid: "La factura se emite cuando el pago está confirmado.",
  invoiceNumber: "Ingresa el folio de la factura (solo números).",
  invoiceDuplicate: "Ese folio ya está registrado en otro pedido.",
  invoiceSame: "Ese folio ya es el registrado: no hay nada que corregir.",
  invoiceReplaceReason: "Escribe el motivo de la corrección (mínimo 3 caracteres).",
  invoiceReplaceForbidden: "Solo el Administrador corrige el folio de una factura registrada.",
} as const;

export function money(amount: number): string {
  return `$${amount.toLocaleString("es-CL")}`;
}

export function refundOverMessage(remaining: number): string {
  return remaining === 0
    ? MESSAGES.refundFull
    : `El monto supera lo cobrado: quedan ${money(remaining)} por registrar.`;
}

export function transitionNotAllowedMessage(from: OrderStatus, to: OrderStatus): string {
  return `Un pedido "${ORDER_STATUS_LABEL[from]}" no puede pasar a "${ORDER_STATUS_LABEL[to]}".`;
}

/** "TK-1048". */
export function orderRef(number: number): string {
  return `TK-${String(number)}`;
}

// ── Estado mínimo que necesitan las reglas ───────────────────────────────────

export interface WorkflowPayment {
  attempt: number;
  status: PaymentStatus;
  amount: number;
  paidAt: Date | null;
}

export interface WorkflowRefund {
  status: RefundStatus;
  amount: number;
}

export interface WorkflowOrder {
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  taxDocument: TaxDocument;
  invoiceFolio: string | null;
  restockRecordedAt: Date | null;
  payments: readonly WorkflowPayment[];
  refunds?: readonly WorkflowRefund[];
  /**
   * Quedan reservas activas, en revisión o liberadas sin vender, o un cupón
   * reservado: el pago no se terminó de asentar (eso lo hace el flujo de pago,
   * LN-10/LN-15, o la resolución manual en Pagos).
   */
  unsettled?: boolean;
}

// ── Pago ─────────────────────────────────────────────────────────────────────

export function latestPayment(order: Pick<WorkflowOrder, "payments">): WorkflowPayment | null {
  let latest: WorkflowPayment | null = null;
  for (const p of order.payments) if (!latest || p.attempt > latest.attempt) latest = p;
  return latest;
}

export function orderPaymentStatus(order: Pick<WorkflowOrder, "payments">): OrderPaymentStatus {
  return latestPayment(order)?.status ?? "none";
}

/** El intento cobrado, si existe (la base admite a lo más uno por pedido). */
export function paidPayment(order: Pick<WorkflowOrder, "payments">): WorkflowPayment | null {
  return order.payments.find((p) => p.status === "paid") ?? null;
}

/** El último intento aún puede estar cobrando: no se da por fallido (RN-04). */
export function hasUnresolvedPayment(order: Pick<WorkflowOrder, "payments">): boolean {
  const status = orderPaymentStatus(order);
  return status === "pending" || status === "in_review";
}

// ── Transiciones ─────────────────────────────────────────────────────────────

export interface Block {
  /** Campo del formulario del panel al que corresponde el error. */
  field: "to" | "form";
  message: string;
}

/** Por qué no se permite pasar a `to` (null si se permite). */
export function transitionBlock(order: WorkflowOrder, to: OrderStatus): Block | null {
  const from = order.status;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return { field: "to", message: transitionNotAllowedMessage(from, to) };
  }
  const paid = paidPayment(order) !== null;
  if (to === "confirmed" && (!paid || order.unsettled)) {
    return { field: "to", message: MESSAGES.unpaidConfirm };
  }
  if (to === "shipped" && !paid) return { field: "to", message: MESSAGES.unpaidShip };
  // RN-04: mientras Flow pueda estar cobrando, el pedido no se cancela ni vence
  // (desde cualquier estado, no solo desde pendiente de pago).
  if ((to === "cancelled" || to === "expired") && hasUnresolvedPayment(order)) {
    return { field: "to", message: MESSAGES.unresolvedPayment };
  }
  return null;
}

export function availableTransitions(order: WorkflowOrder): OrderStatus[] {
  return ALLOWED_TRANSITIONS[order.status].filter((to) => !transitionBlock(order, to));
}

/** Cancelar o vencer está en la tabla, pero lo bloquea un pago sin resolver. */
export function blockedByUnresolvedPayment(order: WorkflowOrder): boolean {
  return (["cancelled", "expired"] as const).some(
    (to) =>
      ALLOWED_TRANSITIONS[order.status].includes(to) &&
      transitionBlock(order, to)?.message === MESSAGES.unresolvedPayment,
  );
}

/**
 * La reposición se registra al cancelar un pedido cuyo stock ya se consumió
 * (pagado: confirmado o en preparación), una sola vez (RN-06).
 */
export function canRecordRestock(order: WorkflowOrder, to: OrderStatus): boolean {
  return (
    to === "cancelled" &&
    (order.status === "confirmed" || order.status === "preparing") &&
    paidPayment(order) !== null &&
    order.restockRecordedAt === null
  );
}

/** En retiro en taller, "Despachado" es "listo para retiro": sin transportista ni código. */
export function needsTracking(order: Pick<WorkflowOrder, "deliveryMethod">, to: OrderStatus) {
  return to === "shipped" && order.deliveryMethod === "shipping";
}

// ── Reembolsos ───────────────────────────────────────────────────────────────

const sum = (refunds: readonly WorkflowRefund[], keep: (r: WorkflowRefund) => boolean) =>
  refunds.filter(keep).reduce((total, r) => total + r.amount, 0);

export function chargedAmount(order: Pick<WorkflowOrder, "payments">): number {
  return paidPayment(order)?.amount ?? 0;
}

/** Cuentan para el tope: solicitados y procesados (no los fallidos). */
export function committedRefunds(refunds: readonly WorkflowRefund[]): number {
  return sum(refunds, (r) => r.status !== "failed");
}

export function processedRefunds(refunds: readonly WorkflowRefund[]): number {
  return sum(refunds, (r) => r.status === "processed");
}

export function refundableAmount(order: WorkflowOrder): number {
  return Math.max(0, chargedAmount(order) - committedRefunds(order.refunds ?? []));
}

export function refundState(refunds: readonly WorkflowRefund[]): OrderRefundState {
  if (refunds.length === 0) return "not_requested";
  if (refunds.some((r) => r.status === "requested")) return "requested";
  if (refunds.some((r) => r.status === "processed")) return "processed";
  return "failed";
}

// ── Factura ──────────────────────────────────────────────────────────────────

/** El comprador pidió factura, el pago está confirmado y aún no hay folio. */
export function invoicePending(
  order: Pick<WorkflowOrder, "taxDocument" | "invoiceFolio" | "status">,
): boolean {
  return (
    order.taxDocument === "factura" &&
    order.invoiceFolio === null &&
    PAID_STATUSES.includes(order.status)
  );
}

/** Se puede emitir (o corregir) la factura: pedido con factura y pagado. */
export function invoiceAllowed(order: Pick<WorkflowOrder, "status">): boolean {
  return PAID_STATUSES.includes(order.status);
}

/** Folio sin espacios ni ceros a la izquierda; null si no es válido. */
export function normalizeFolio(input: string): string | null {
  const folio = input.trim().replace(/^0+(?=\d)/, "");
  return INVOICE_NUMBER.test(folio) ? folio : null;
}

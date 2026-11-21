/**
 * Gestión de pedidos del panel (RF-27, RF-32, RF-33, RF-34; RN-04 a RN-06).
 * Dominio puro: sin React, Next.js ni acceso a red.
 *
 * `Order` (order.ts) es el pedido que ve el comprador y no cambia de forma.
 * Aquí se le suma lo que solo conoce el panel: intentos de pago, reembolsos
 * manuales y un historial auditado (actor, fecha y motivo).
 *
 * Tabla "Estados y transiciones" de la SRS:
 * - Pedido: pendiente_pago → confirmado → preparando → despachado → entregado;
 *   pendiente_pago → vencido o cancelado; confirmado/preparando → cancelado con
 *   gestión de devolución; "en revisión" sale solo con resolución auditada.
 * - Intento de pago: pendiente → pagado, rechazado o anulado según la consulta
 *   al proveedor; un fallo de comunicación es incierto, no rechazo.
 * - Reembolso manual: no_solicitado → solicitado → procesado o fallido. No
 *   altera el hecho histórico del cobro original.
 */
import type { PaymentStatus } from "@/features/payments";

import {
  invoicePending,
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  type Order,
  type OrderStatus,
} from "./order";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Un intento de cobro en Flow. Del más antiguo al más reciente en el pedido. */
export interface PaymentAttempt {
  /** Identificador propio enviado a Flow (único por intento). */
  commerceOrder: string;
  /** Número que asigna Flow, cuando existe. */
  flowOrder: number | null;
  amount: number;
  status: PaymentStatus;
  /** Fecha y hora ISO del intento. */
  createdAt: string;
  /** Última consulta del estado a Flow (conciliación), ISO. */
  lastCheckedAt: string | null;
}

export const REFUND_STATUSES = ["requested", "processed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  requested: "Solicitado",
  processed: "Procesado",
  failed: "Fallido",
};

/** Estado del reembolso del pedido; sin registros es "no solicitado". */
export type OrderRefundState = "not_requested" | RefundStatus;

export const ORDER_REFUND_STATE_LABEL: Record<OrderRefundState, string> = {
  not_requested: "No solicitado",
  ...REFUND_STATUS_LABEL,
};

/** Reembolso manual (RF-32): registra una devolución externa, no mueve dinero. */
export interface RefundRecord {
  id: string;
  amount: number;
  /** Fecha del reembolso, AAAA-MM-DD. */
  date: string;
  reference: string;
  /** Quién lo registró (rol en la demo). */
  responsible: string;
  status: RefundStatus;
  /** Fecha y hora ISO del registro. */
  registeredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export type AuditKind = "status" | "payment" | "refund" | "restock" | "invoice" | "system";

/** Entrada del historial del panel (RF-34): actor, fecha y motivo. */
export interface AuditEntry {
  /** Fecha y hora ISO. */
  at: string;
  actor: string;
  kind: AuditKind;
  from: OrderStatus | null;
  to: OrderStatus | null;
  reason: string | null;
  detail: string;
}

export interface AdminOrderRecord {
  order: Order;
  attempts: PaymentAttempt[];
  refunds: RefundRecord[];
  /** Del más antiguo al más reciente. */
  audit: AuditEntry[];
  /** Cuándo se registró la reposición de stock (RN-06: una sola vez). */
  restockRecordedAt: string | null;
}

export type FieldErrors = Partial<Record<string, string>>;
export type WorkflowResult =
  { ok: true; record: AdminOrderRecord } | { ok: false; errors: FieldErrors };

/** Quién hace el cambio y cuándo (lo pone el servidor, nunca el formulario). */
export interface ChangeContext {
  actor: string;
  /** Fecha y hora ISO. */
  at: string;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const TRACKING_MAX = 80;
export const REFERENCE_MAX = 120;

const money = (amount: number) => `$${amount.toLocaleString("es-CL")}`;

const CHILE_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario en Chile (AAAA-MM-DD) de una fecha y hora ISO. */
export function chileDate(iso: string): string {
  return CHILE_DAY.format(new Date(iso));
}

function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

function reasonError(reason: string): string | undefined {
  const text = reason.trim();
  if (text.length < REASON_MIN) return "Escribe el motivo del cambio (mínimo 3 caracteres).";
  if (text.length > REASON_MAX) return `El motivo admite hasta ${REASON_MAX} caracteres.`;
  return undefined;
}

// ── Pago ─────────────────────────────────────────────────────────────────────

export function latestAttempt(record: Pick<AdminOrderRecord, "attempts">): PaymentAttempt | null {
  return record.attempts.at(-1) ?? null;
}

/** Estado del pago del pedido: el de su último intento (null si nunca se intentó). */
export function orderPaymentStatus(
  record: Pick<AdminOrderRecord, "attempts">,
): PaymentStatus | null {
  return latestAttempt(record)?.status ?? null;
}

/** El intento cobrado, si existe. Un pedido tiene a lo más un cobro. */
export function paidAttempt(record: Pick<AdminOrderRecord, "attempts">): PaymentAttempt | null {
  return record.attempts.find((a) => a.status === "paid") ?? null;
}

/** Hay un intento cuyo resultado aún no se conoce: no se puede dar por fallido (RN-04). */
export function hasUnresolvedPayment(record: Pick<AdminOrderRecord, "attempts">): boolean {
  const status = orderPaymentStatus(record);
  return status === "pending" || status === "in_review";
}

// ── Transiciones del pedido (RF-27) ──────────────────────────────────────────

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

export const UNPAID_CONFIRM_MESSAGE =
  "Primero concilia y confirma el pago en Pagos y conciliación.";
export const UNPAID_SHIP_MESSAGE = "Un pedido sin pago confirmado no se despacha.";
export const UNRESOLVED_PAYMENT_MESSAGE =
  "Hay un pago sin resolver: concílialo en Pagos antes de cancelar o marcar como vencido.";

/** Por qué no se permite pasar a `to` (null si se permite). */
export function transitionBlock(record: AdminOrderRecord, to: OrderStatus): string | null {
  const from = record.order.status;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return `Un pedido "${ORDER_STATUS_LABEL[from]}" no puede pasar a "${ORDER_STATUS_LABEL[to]}".`;
  }
  const paid = paidAttempt(record) !== null;
  if (to === "confirmed" && !paid) return UNPAID_CONFIRM_MESSAGE;
  if (to === "shipped" && !paid) return UNPAID_SHIP_MESSAGE;
  // RN-04/RN-06: mientras Flow pueda estar cobrando, un pedido sin pagar no se
  // cancela ni se da por vencido: primero se consulta el estado del pago.
  if (
    (to === "cancelled" || to === "expired") &&
    from === "pending_payment" &&
    hasUnresolvedPayment(record)
  ) {
    return UNRESOLVED_PAYMENT_MESSAGE;
  }
  return null;
}

/** Transiciones que la interfaz ofrece: las de la tabla que cumplen sus condiciones. */
export function availableTransitions(record: AdminOrderRecord): OrderStatus[] {
  return ALLOWED_TRANSITIONS[record.order.status].filter((to) => !transitionBlock(record, to));
}

/** Cancelar o vencer existe en la tabla pero lo bloquea un pago sin resolver. */
export function blockedByUnresolvedPayment(record: AdminOrderRecord): boolean {
  return (["cancelled", "expired"] as const).some(
    (to) =>
      ALLOWED_TRANSITIONS[record.order.status].includes(to) &&
      transitionBlock(record, to) === UNRESOLVED_PAYMENT_MESSAGE,
  );
}

/**
 * Se ofrece registrar la reposición al cancelar un pedido cuyo stock ya se
 * consumió (pagado: confirmado o en preparación), una sola vez (RN-06).
 */
export function canRecordRestock(record: AdminOrderRecord, to: OrderStatus): boolean {
  return (
    to === "cancelled" &&
    (record.order.status === "confirmed" || record.order.status === "preparing") &&
    record.restockRecordedAt === null
  );
}

/** Cancelar un pedido pagado no devuelve dinero (RN-06). */
export function cancellingPaidOrder(record: AdminOrderRecord, to: OrderStatus): boolean {
  return to === "cancelled" && paidAttempt(record) !== null;
}

export interface StatusChangeInput {
  to: string;
  reason: string;
  carrier: string;
  code: string;
  /** Las unidades vuelven a ser vendibles: registrar la reposición. */
  restock: boolean;
}

const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(value);

export function validateStatusChange(
  record: AdminOrderRecord,
  input: StatusChangeInput,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!isOrderStatus(input.to)) {
    errors.to = "Elige el nuevo estado.";
  } else {
    const block = transitionBlock(record, input.to);
    if (block) errors.to = block;
    if (input.to === "shipped") {
      const carrier = input.carrier.trim();
      const code = input.code.trim();
      if (!carrier) errors.carrier = "Ingresa el transportista para despachar.";
      else if (carrier.length > TRACKING_MAX)
        errors.carrier = `El transportista admite hasta ${TRACKING_MAX} caracteres.`;
      if (!code) errors.code = "Ingresa el código de seguimiento para despachar.";
      else if (code.length > TRACKING_MAX)
        errors.code = `El código admite hasta ${TRACKING_MAX} caracteres.`;
    }
    if (input.restock && !canRecordRestock(record, input.to)) {
      errors.restock =
        record.restockRecordedAt !== null
          ? "La reposición de stock ya se registró para este pedido."
          : "La reposición de stock solo se registra al cancelar un pedido pagado.";
    }
  }
  const reason = reasonError(input.reason);
  if (reason) errors.reason = reason;
  return errors;
}

/** Lo que ve el comprador en su seguimiento (sin el motivo interno). */
function buyerLabel(to: OrderStatus, carrier: string): string {
  switch (to) {
    case "confirmed":
      return "Pedido confirmado";
    case "preparing":
      return "En preparación";
    case "shipped":
      return `Despachado con ${carrier}`;
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Pedido cancelado";
    case "expired":
      return "Venció el plazo de pago";
    case "pending_payment":
      return "Esperando el pago";
    case "in_review":
      return "Estamos verificando tu pago";
  }
}

function unitsSummary(order: Order) {
  const units = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  const detail = order.lines.map((l) => `${l.sku} × ${l.quantity}`).join(", ");
  return `${units} unidad${units === 1 ? "" : "es"} (${detail})`;
}

/** Aplica un cambio de estado validado. No toca pagos ni reembolsos. */
export function applyStatusChange(
  record: AdminOrderRecord,
  input: StatusChangeInput,
  ctx: ChangeContext,
): WorkflowResult {
  const errors = validateStatusChange(record, input);
  if (hasErrors(errors) || !isOrderStatus(input.to)) return { ok: false, errors };

  const to = input.to;
  const from = record.order.status;
  const carrier = input.carrier.trim();
  const code = input.code.trim();
  const reason = input.reason.trim();

  const details = [`${ORDER_STATUS_LABEL[from]} → ${ORDER_STATUS_LABEL[to]}`];
  if (to === "shipped") details.push(`${carrier} · seguimiento ${code}`);
  if (cancellingPaidOrder(record, to)) {
    details.push("Cancelar no devuelve dinero: gestiona la devolución con un reembolso manual.");
  }

  const audit: AuditEntry[] = [
    ...record.audit,
    { at: ctx.at, actor: ctx.actor, kind: "status", from, to, reason, detail: details.join(". ") },
  ];
  const restock = input.restock && canRecordRestock(record, to);
  if (restock) {
    audit.push({
      at: ctx.at,
      actor: ctx.actor,
      kind: "restock",
      from: null,
      to: null,
      reason,
      detail: `Reposición de stock registrada: ${unitsSummary(record.order)}.`,
    });
  }

  return {
    ok: true,
    record: {
      ...record,
      order: {
        ...record.order,
        status: to,
        tracking: to === "shipped" ? { carrier, code } : record.order.tracking,
        history: [...record.order.history, { at: ctx.at, label: buyerLabel(to, carrier) }],
      },
      audit,
      restockRecordedAt: restock ? ctx.at : record.restockRecordedAt,
    },
  };
}

// ── Reembolso manual (RF-32) ─────────────────────────────────────────────────

/** Monto cobrado (0 si no hay pago confirmado). */
export function chargedAmount(record: Pick<AdminOrderRecord, "attempts">): number {
  return paidAttempt(record)?.amount ?? 0;
}

/** Reembolsos que cuentan para el tope: solicitados y procesados (no los fallidos). */
export function committedRefunds(record: Pick<AdminOrderRecord, "refunds">): number {
  return record.refunds.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amount, 0);
}

/** Procesados: dinero que efectivamente se devolvió por fuera. */
export function processedRefunds(record: Pick<AdminOrderRecord, "refunds">): number {
  return record.refunds
    .filter((r) => r.status === "processed")
    .reduce((sum, r) => sum + r.amount, 0);
}

export function refundableAmount(record: AdminOrderRecord): number {
  return Math.max(0, chargedAmount(record) - committedRefunds(record));
}

export function refundState(record: Pick<AdminOrderRecord, "refunds">): OrderRefundState {
  if (record.refunds.length === 0) return "not_requested";
  if (record.refunds.some((r) => r.status === "requested")) return "requested";
  if (record.refunds.some((r) => r.status === "processed")) return "processed";
  return "failed";
}

export interface RefundInput {
  amount: number;
  /** AAAA-MM-DD. */
  date: string;
  reference: string;
  /** Lo pone el servidor desde la sesión. */
  responsible: string;
  /** Estado inicial: ya procesado por fuera o solo solicitado. */
  status: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 0));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === (m ?? 0) - 1 && date.getUTCDate() === d
  );
}

/** `today` es la fecha local (AAAA-MM-DD) del servidor en Chile. */
export function validateRefund(
  record: AdminOrderRecord,
  input: RefundInput,
  today: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const paid = paidAttempt(record);
  if (!paid) {
    errors.form = "Solo se registran reembolsos de pedidos con pago confirmado.";
    return errors;
  }

  const remaining = refundableAmount(record);
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    errors.amount = "Ingresa un monto entero en CLP mayor que 0.";
  } else if (input.amount > remaining) {
    errors.amount =
      remaining === 0
        ? "El pedido ya tiene registrado todo lo cobrado."
        : `El monto supera lo cobrado: quedan ${money(remaining)} por registrar.`;
  }

  const paidOn = chileDate(paid.createdAt);
  if (!isCalendarDate(input.date)) errors.date = "Ingresa la fecha del reembolso.";
  else if (input.date > today) errors.date = "La fecha del reembolso no puede ser futura.";
  else if (input.date < paidOn) errors.date = "La fecha no puede ser anterior al cobro.";

  const reference = input.reference.trim();
  if (reference.length < 3) errors.reference = "Ingresa la referencia del comprobante.";
  else if (reference.length > REFERENCE_MAX)
    errors.reference = `La referencia admite hasta ${REFERENCE_MAX} caracteres.`;

  if (!input.responsible.trim()) errors.form = "Falta el responsable del registro.";
  if (input.status !== "requested" && input.status !== "processed") {
    errors.status = "Elige si el reembolso está solicitado o ya procesado.";
  }
  return errors;
}

/** Registra el reembolso. El intento cobrado no cambia: el cobro sigue siendo un hecho. */
export function applyRefund(
  record: AdminOrderRecord,
  input: RefundInput,
  ctx: ChangeContext & { id: string; today: string },
): WorkflowResult {
  const errors = validateRefund(record, input, ctx.today);
  if (hasErrors(errors)) return { ok: false, errors };
  const status: RefundStatus = input.status === "processed" ? "processed" : "requested";
  const refund: RefundRecord = {
    id: ctx.id,
    amount: input.amount,
    date: input.date,
    reference: input.reference.trim(),
    responsible: input.responsible.trim(),
    status,
    registeredAt: ctx.at,
    resolvedAt: status === "processed" ? ctx.at : null,
    resolvedBy: status === "processed" ? ctx.actor : null,
  };
  return {
    ok: true,
    record: {
      ...record,
      refunds: [...record.refunds, refund],
      audit: [
        ...record.audit,
        {
          at: ctx.at,
          actor: ctx.actor,
          kind: "refund",
          from: null,
          to: null,
          reason: `Referencia ${refund.reference}`,
          detail: `Reembolso manual registrado (${REFUND_STATUS_LABEL[status]}): ${money(refund.amount)} del ${refund.date}. No mueve dinero.`,
        },
      ],
    },
  };
}

/** Un reembolso solicitado pasa a procesado o fallido. */
export function resolveRefund(
  record: AdminOrderRecord,
  input: { refundId: string; status: string },
  ctx: ChangeContext,
): WorkflowResult {
  const refund = record.refunds.find((r) => r.id === input.refundId);
  if (!refund) return { ok: false, errors: { form: "El reembolso ya no existe." } };
  if (refund.status !== "requested") {
    return { ok: false, errors: { form: "Ese reembolso ya fue resuelto." } };
  }
  if (input.status !== "processed" && input.status !== "failed") {
    return { ok: false, errors: { form: "Elige Procesado o Fallido." } };
  }
  const status: RefundStatus = input.status;
  return {
    ok: true,
    record: {
      ...record,
      refunds: record.refunds.map((r) =>
        r.id === refund.id ? { ...r, status, resolvedAt: ctx.at, resolvedBy: ctx.actor } : r,
      ),
      audit: [
        ...record.audit,
        {
          at: ctx.at,
          actor: ctx.actor,
          kind: "refund",
          from: null,
          to: null,
          reason: `Referencia ${refund.reference}`,
          detail: `Reembolso de ${money(refund.amount)}: ${REFUND_STATUS_LABEL[status]}.`,
        },
      ],
    },
  };
}

// ── Conciliación con Flow (RF-33, RN-04, RN-05) ──────────────────────────────

export const RECONCILIATION_RESULTS = ["paid", "rejected", "uncertain"] as const;
export type ReconciliationResult = (typeof RECONCILIATION_RESULTS)[number];

export const RECONCILIATION_RESULT_LABEL: Record<ReconciliationResult, string> = {
  paid: "Pago confirmado",
  rejected: "Pago rechazado",
  uncertain: "Sin respuesta: sigue incierto",
};

/** Solo se consulta un intento pendiente o en revisión. */
export function canReconcile(record: Pick<AdminOrderRecord, "attempts">): boolean {
  return hasUnresolvedPayment(record);
}

const ATTEMPT_AFTER: Record<ReconciliationResult, PaymentStatus> = {
  paid: "paid",
  rejected: "rejected",
  uncertain: "in_review",
};

function orderAfter(status: OrderStatus, result: ReconciliationResult): OrderStatus {
  const open = status === "pending_payment" || status === "in_review";
  switch (result) {
    case "paid":
      // RN-05: un pago tardío sobre un pedido cerrado queda en revisión, no se despacha.
      return open ? "confirmed" : "in_review";
    case "rejected":
      // A3 / RF-18: se liberan las reservas y el comprador puede reintentar.
      return status === "in_review" ? "pending_payment" : status;
    case "uncertain":
      // RN-04: no se asume rechazo; queda en revisión.
      return status === "pending_payment" ? "in_review" : status;
  }
}

const BUYER_PAYMENT_LABEL: Record<ReconciliationResult, string> = {
  paid: "Pago confirmado por Flow",
  rejected: "El pago fue rechazado: puedes intentarlo de nuevo",
  uncertain: "Estamos verificando tu pago",
};

export function applyReconciliation(
  record: AdminOrderRecord,
  input: { result: string; reason: string },
  ctx: ChangeContext,
): WorkflowResult {
  const errors: FieldErrors = {};
  if (!canReconcile(record)) {
    errors.form = "Este pedido no tiene un pago pendiente ni en revisión.";
  }
  if (!(RECONCILIATION_RESULTS as readonly string[]).includes(input.result)) {
    errors.result = "Elige la respuesta simulada de Flow.";
  }
  const reason = reasonError(input.reason);
  if (reason) errors.reason = reason;
  if (hasErrors(errors)) return { ok: false, errors };

  const result = input.result as ReconciliationResult;
  const from = record.order.status;
  const to = orderAfter(from, result);
  const last = record.attempts.length - 1;
  const changed = to !== from;

  let detail = `Consulta a Flow (simulada): ${RECONCILIATION_RESULT_LABEL[result]}.`;
  if (changed) detail += ` ${ORDER_STATUS_LABEL[from]} → ${ORDER_STATUS_LABEL[to]}.`;
  if (result === "paid" && to === "in_review") {
    detail += " Pago tardío: resolver asignación de stock o devolución manual (RN-05).";
  }

  return {
    ok: true,
    record: {
      ...record,
      attempts: record.attempts.map((a, i) =>
        i === last ? { ...a, status: ATTEMPT_AFTER[result], lastCheckedAt: ctx.at } : a,
      ),
      order: {
        ...record.order,
        status: to,
        history:
          changed || result !== "uncertain"
            ? [...record.order.history, { at: ctx.at, label: BUYER_PAYMENT_LABEL[result] }]
            : record.order.history,
      },
      audit: [
        ...record.audit,
        {
          at: ctx.at,
          actor: ctx.actor,
          kind: "payment",
          from: changed ? from : null,
          to: changed ? to : null,
          reason: input.reason.trim(),
          detail,
        },
      ],
    },
  };
}

// ── Resumen del panel ────────────────────────────────────────────────────────

export interface OrdersOverview {
  /** Suma de los intentos cobrados. */
  charged: number;
  /** Reembolsos procesados (se informan aparte, RF-30). */
  refunded: number;
  byStatus: Record<OrderStatus, number>;
  /** Pedidos con pago en revisión (incierto). */
  paymentsInReview: number;
  /** Pedidos con pago pendiente. */
  paymentsPending: number;
}

export function ordersOverview(records: readonly AdminOrderRecord[]): OrdersOverview {
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  let charged = 0;
  let refunded = 0;
  let paymentsInReview = 0;
  let paymentsPending = 0;
  for (const record of records) {
    byStatus[record.order.status] += 1;
    charged += chargedAmount(record);
    refunded += processedRefunds(record);
    const payment = orderPaymentStatus(record);
    if (payment === "in_review") paymentsInReview += 1;
    if (payment === "pending") paymentsPending += 1;
  }
  return { charged, refunded, byStatus, paymentsInReview, paymentsPending };
}

/** Folio de factura electrónica: solo dígitos, hasta 10. */
const INVOICE_NUMBER = /^\d{1,10}$/;

/**
 * Registra la factura que Total Kids emitió fuera de la tienda (portal del SII
 * o su sistema de facturación). Flow solo cubre la boleta, así que los pedidos
 * con factura quedan "pendientes de emitir" hasta registrar el folio.
 */
export function registerInvoice(
  record: AdminOrderRecord,
  input: { number: string },
  ctx: ChangeContext,
): WorkflowResult {
  const { order } = record;
  if (order.document !== "factura") {
    return {
      ok: false,
      errors: { form: "Este pedido es con boleta: el comprobante de Flow la reemplaza." },
    };
  }
  if (order.invoice)
    return { ok: false, errors: { form: "La factura de este pedido ya está registrada." } };
  if (!invoicePending(order)) {
    return { ok: false, errors: { form: "La factura se emite cuando el pago está confirmado." } };
  }
  const number = input.number.trim().replace(/^0+(?=\d)/, "");
  if (!INVOICE_NUMBER.test(number)) {
    return { ok: false, errors: { number: "Ingresa el folio de la factura (solo números)." } };
  }
  return {
    ok: true,
    record: {
      ...record,
      order: { ...order, invoice: { number, issuedAt: ctx.at, issuedBy: ctx.actor } },
      audit: [
        ...record.audit,
        {
          at: ctx.at,
          actor: ctx.actor,
          kind: "invoice",
          from: null,
          to: null,
          reason: null,
          detail: `Factura N° ${number} emitida.`,
        },
      ],
    },
  };
}

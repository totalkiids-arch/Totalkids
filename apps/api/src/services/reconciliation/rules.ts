import type { OrderStatus, PaymentStatus } from "../../generated/prisma/enums.js";
import type { FlowStatus } from "../flow/client.js";

/**
 * Reglas de la conciliación y los vencimientos (LN-15; RF-18, RF-33, RN-04 a
 * RN-06). Funciones puras: las usan el job del worker, la conciliación manual
 * del panel y la resolución manual.
 */

const MINUTE = 60_000;

/**
 * Espera entre consultas a Flow tras cada resultado incierto seguido (D-02:
 * cada 2 minutos al principio). Después del último, cada 60 minutos.
 */
export const RECONCILE_DELAYS_MS: readonly number[] = [2, 5, 15, 30, 60].map((m) => m * MINUTE);

/** Consultas inciertas seguidas tras las que el pago pasa a revisión con alerta. */
export const RECONCILE_MAX_ATTEMPTS = 5;

/**
 * Margen tras `paymentDueAt`. La orden se crea en Flow con `timeout` igual al
 * tiempo que queda hasta `paymentDueAt` (start.ts), y Flow no la deja pagar
 * después: pasado este margen, un pago que Flow informa pendiente ya no se cobra.
 */
export const FLOW_GRACE_MS = 10 * MINUTE;

/** Un intento pendiente más antiguo que esto se consulta aunque el plazo siga vigente. */
export const STALE_PENDING_MS = 10 * MINUTE;

/** Reclamo del worker: mientras dure, otra instancia no toma el mismo pago. */
export const CLAIM_LEASE_MS = 2 * MINUTE;

/** Pendiente o en revisión: Flow aún podría estar cobrando (RN-04). */
export function isOpenPayment(status: PaymentStatus): boolean {
  return status === "pending" || status === "in_review";
}

/** Espera antes de la próxima consulta, según las consultas inciertas seguidas. */
export function nextCheckDelay(uncertainAttempts: number): number {
  const index = Math.min(Math.max(uncertainAttempts - 1, 0), RECONCILE_DELAYS_MS.length - 1);
  return RECONCILE_DELAYS_MS[index] ?? 60 * MINUTE;
}

/** Ya no se puede pagar en Flow: pasó el plazo más el margen. */
export function flowWindowClosed(paymentDueAt: Date, now: Date): boolean {
  return now.getTime() >= paymentDueAt.getTime() + FLOW_GRACE_MS;
}

export function isPastDue(paymentDueAt: Date, now: Date): boolean {
  return now.getTime() >= paymentDueAt.getTime();
}

/**
 * Qué hacer después de asentar un estado que Flow sí respondió:
 * - `expire_payment`: Flow lo informa pendiente pero ya no se puede pagar: el
 *   intento vence y, si corresponde, el pedido también.
 * - `expire`: Flow confirmó que no hubo cobro (rechazo o anulación) y el pedido
 *   ya no se puede pagar (plazo vencido o en revisión): vence.
 * - `wait`: sigue pendiente dentro del plazo; se vuelve a consultar.
 * - `done`: settlePayment ya lo resolvió (pagado, o rechazo con plazo vigente:
 *   el comprador puede reintentar).
 */
export type AfterFlow = "expire_payment" | "expire" | "wait" | "done";

export function decideAfterFlow(input: {
  flowStatus: FlowStatus;
  orderStatus: OrderStatus;
  paymentDueAt: Date;
  now: Date;
}): AfterFlow {
  const { flowStatus, orderStatus, paymentDueAt, now } = input;
  if (flowStatus === "paid") return "done";
  if (flowStatus === "pending") {
    return flowWindowClosed(paymentDueAt, now) ? "expire_payment" : "wait";
  }
  const unpayable =
    orderStatus === "in_review" ||
    (orderStatus === "pending_payment" && isPastDue(paymentDueAt, now));
  return unpayable ? "expire" : "done";
}

/**
 * Tras una consulta incierta (Flow no responde, responde con error o algo que
 * no se entiende): a revisión con alerta si el plazo del pedido ya venció (no se
 * vence sin saber si hubo cobro, RN-04) o si se agotaron los intentos.
 */
export function decideUncertain(input: {
  attempts: number;
  orderStatus: OrderStatus;
  paymentDueAt: Date;
  now: Date;
}): "review" | "wait" {
  if (input.attempts >= RECONCILE_MAX_ATTEMPTS) return "review";
  if (input.orderStatus === "in_review") return "review";
  if (input.orderStatus === "pending_payment" && isPastDue(input.paymentDueAt, input.now)) {
    return "review";
  }
  return "wait";
}

// ── Resolución manual (RF-33, solo Administrador) ────────────────────────────

export const RESOLUTIONS = ["release", "refund_pending", "confirm"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  release: "Liberar: Flow no cobró",
  refund_pending: "Reembolso pendiente",
  confirm: "Confirmar con stock disponible",
};

export const RESOLUTION_MESSAGES = {
  notAllowed: "Este pago no admite esa resolución.",
  releasePaid: "Flow informó este pago como pagado: márcalo como reembolso pendiente.",
  noStock:
    "Aún no hay stock para todas las unidades: ajusta el inventario o márcalo como reembolso pendiente.",
  notReconcilable: "Solo se consulta en Flow el último intento pendiente o en revisión.",
  flowDisabled: "Flow no está configurado: no se puede consultar el pago.",
} as const;

/**
 * Resoluciones posibles de un intento:
 * - En revisión y Flow no lo informó pagado → `release` (no hubo cobro).
 * - En revisión y Flow lo informó pagado (doble cobro o datos distintos) →
 *   `refund_pending`: no se puede aplicar al pedido; se devuelve a mano.
 * - Pagado sobre un pedido en revisión (pago tardío sin stock, RN-05) →
 *   `confirm` si ahora hay stock, o `refund_pending` (se cancela el pedido y se
 *   registra la devolución con RF-32).
 */
export function availableResolutions(input: {
  paymentStatus: PaymentStatus;
  flowSaysPaid: boolean;
  orderStatus: OrderStatus;
}): Resolution[] {
  if (input.paymentStatus === "in_review") {
    return input.flowSaysPaid ? ["refund_pending"] : ["release"];
  }
  if (input.paymentStatus === "paid" && input.orderStatus === "in_review") {
    return ["confirm", "refund_pending"];
  }
  return [];
}

/** El último estado que Flow informó para el intento (`providerResponse.status`). */
export function flowSaidPaid(providerResponse: unknown): boolean {
  return (
    typeof providerResponse === "object" &&
    providerResponse !== null &&
    (providerResponse as { status?: unknown }).status === "paid"
  );
}

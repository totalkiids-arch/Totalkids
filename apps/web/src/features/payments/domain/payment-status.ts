/**
 * Estados de pago de un pedido (inventario de pantallas: "Estados de pago").
 * Dominio puro: sin React, Next.js ni acceso a red.
 */
export const PAYMENT_STATUSES = ["paid", "pending", "rejected", "in_review", "expired"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  rejected: "Rechazado",
  in_review: "En revisión",
  expired: "Vencido",
};

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Estados de un intento de pago en el panel: los de la API, que además anula
 * los intentos que un pago posterior dejó sin efecto ("voided") y marca como
 * "refund_pending" un cobro que no se pudo aplicar al pedido (doble cobro o
 * discrepancia, LN-15): no cuenta como cobrado y se devuelve a mano.
 */
export const ATTEMPT_STATUSES = [...PAYMENT_STATUSES, "voided", "refund_pending"] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  ...PAYMENT_STATUS_LABEL,
  voided: "Anulado",
  refund_pending: "Reembolso pendiente",
};

export function isAttemptStatus(value: unknown): value is AttemptStatus {
  return typeof value === "string" && (ATTEMPT_STATUSES as readonly string[]).includes(value);
}

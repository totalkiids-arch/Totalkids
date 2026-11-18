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

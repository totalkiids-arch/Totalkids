import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "../domain/payment-status";

const PAYMENT_TONE: Record<PaymentStatus, StatusTone> = {
  paid: "green",
  pending: "yellow",
  in_review: "red",
  rejected: "red",
  expired: "neutral",
};

/** Estado de un intento de pago en Flow (o del último intento de un pedido). */
export function PaymentStatusBadge({
  status,
  srPrefix = "",
}: {
  status: PaymentStatus | null;
  /** Texto solo para lectores de pantalla antes del estado (p. ej. "Pago: "). */
  srPrefix?: string;
}) {
  if (!status) return <StatusBadge tone="neutral">Sin intentos de pago</StatusBadge>;
  return (
    <StatusBadge tone={PAYMENT_TONE[status]}>
      {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
      {PAYMENT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import { ATTEMPT_STATUS_LABEL, type AttemptStatus } from "../domain/payment-status";

const PAYMENT_TONE: Record<AttemptStatus, StatusTone> = {
  paid: "green",
  pending: "yellow",
  in_review: "red",
  rejected: "red",
  expired: "neutral",
  voided: "neutral",
};

/** Estado de un intento de pago en Flow (o del último intento de un pedido). */
export function PaymentStatusBadge({
  status,
  srPrefix = "",
}: {
  status: AttemptStatus | null;
  /** Texto solo para lectores de pantalla antes del estado (p. ej. "Pago: "). */
  srPrefix?: string;
}) {
  if (!status) return <StatusBadge tone="neutral">Sin intentos de pago</StatusBadge>;
  return (
    <StatusBadge tone={PAYMENT_TONE[status]}>
      {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
      {ATTEMPT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

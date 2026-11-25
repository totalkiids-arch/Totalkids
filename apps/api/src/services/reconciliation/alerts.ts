import type { Prisma } from "../../generated/prisma/client.js";
import { enqueueEmail } from "../email/enqueue.js";
import { emailEventKey, type ReviewAlertReason } from "../email/events.js";

/**
 * Alerta al equipo por un pedido o pago en revisión (LN-15; RN-04, RN-05, A4).
 * Se encola en la MISMA transacción que deja el pago en revisión, y la clave
 * `payment_review_alert:<paymentId>:<motivo>` evita duplicarla: repetir el
 * callback, la conciliación o el job no manda otro correo.
 */

/** Acción de auditoría que deja cada motivo (la usa el resumen del panel). */
export const REVIEW_AUDIT_ACTION: Record<ReviewAlertReason, string> = {
  late_no_stock: "payment.late_review",
  double_charge: "payment.double_charge",
  mismatch: "payment.mismatch",
  flow_unreachable: "payment.flow_unreachable",
};

export function reviewReasonOf(action: string): ReviewAlertReason | null {
  const entry = Object.entries(REVIEW_AUDIT_ACTION).find(([, a]) => a === action);
  return entry ? (entry[0] as ReviewAlertReason) : null;
}

export async function enqueueReviewAlert(
  tx: Pick<Prisma.TransactionClient, "outboxJob" | "emailLog">,
  input: {
    reason: ReviewAlertReason;
    adminEmail: string;
    order: { id: string; number: number };
    payment: { id: string; attempt: number; amount: number };
  },
): Promise<void> {
  await enqueueEmail(tx, {
    event: "payment_review_alert",
    recipient: input.adminEmail,
    eventKey: emailEventKey("payment_review_alert", input.payment.id, input.reason),
    orderId: input.order.id,
    data: {
      orderNumber: input.order.number,
      reason: input.reason,
      attempt: input.payment.attempt,
      amount: input.payment.amount,
    },
  });
}

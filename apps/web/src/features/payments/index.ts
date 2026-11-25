// API pública de la feature "payments". app/ y otras features importan solo desde aquí.
export { PaymentsScreen } from "./ui/payments-screen";
export { PaymentStatusBadge } from "./ui/payment-status-badge";
export {
  isPaymentStatus,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  type AttemptStatus,
  type PaymentStatus,
} from "./domain/payment-status";
export {
  parsePaymentQuery,
  type PaymentAttemptRow,
  type PaymentQuery,
} from "./domain/payment-query";
export { ReconcileButton } from "./ui/reconcile-button";
export { ResolvePaymentForm } from "./ui/resolve-payment-form";
export {
  PAYMENT_RESOLUTIONS,
  RECONCILE_NOTICES,
  RESOLUTION_LABEL,
  REVIEW_REASON_LABEL,
  isPaymentResolution,
  type PaymentResolution,
  type ReviewReason,
} from "./domain/reconciliation";

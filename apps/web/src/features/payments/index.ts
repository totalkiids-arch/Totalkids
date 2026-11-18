// API pública de la feature "payments". app/ y otras features importan solo desde aquí.
export { PaymentsScreen } from "./ui/payments-screen";
export {
  isPaymentStatus,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "./domain/payment-status";

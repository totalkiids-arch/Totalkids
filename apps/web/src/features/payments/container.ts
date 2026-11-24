// Raíz de composición de "payments": conecta el puerto con su adaptador.
import type { AdminPayments } from "./application/ports";
import type { PaymentQuery } from "./domain/payment-query";
import { apiAdminPayments } from "./infrastructure/api-admin-payments";

const payments: AdminPayments = apiAdminPayments;

/** Caso de uso: intentos de pago del panel (RF-33), filtrados y paginados por la API. */
export function listPaymentAttempts(query: PaymentQuery) {
  return payments.list(query);
}

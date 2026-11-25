// Raíz de composición de "payments": conecta el puerto con su adaptador.
import type { AdminPayments } from "./application/ports";
import type { PaymentQuery } from "./domain/payment-query";
import type { PaymentResolution } from "./domain/reconciliation";
import { apiAdminPayments } from "./infrastructure/api-admin-payments";

const payments: AdminPayments = apiAdminPayments;

/** Caso de uso: intentos de pago del panel (RF-33), filtrados y paginados por la API. */
export function listPaymentAttempts(query: PaymentQuery) {
  return payments.list(query);
}

/** Caso de uso: «Consultar en Flow» un intento pendiente o en revisión (RF-33, LN-15). */
export function reconcilePaymentAttempt(id: string) {
  return payments.reconcile(id);
}

/** Caso de uso: resolución manual con motivo de un pago en revisión (solo Administrador). */
export function resolvePaymentAttempt(
  id: string,
  input: { action: PaymentResolution; reason: string },
) {
  return payments.resolve(id, input);
}

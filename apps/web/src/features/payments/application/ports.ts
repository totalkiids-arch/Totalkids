import type { PaymentPage, PaymentQuery } from "../domain/payment-query";

/**
 * Puerto: intentos de pago del panel (RF-33), de solo lectura. Lo implementa
 * la API (GET /admin/payments, Administrador y Operador). La conciliación con
 * Flow es de LN-15 y no está aquí.
 */
export interface AdminPayments {
  list(query: PaymentQuery): Promise<PaymentPage>;
}

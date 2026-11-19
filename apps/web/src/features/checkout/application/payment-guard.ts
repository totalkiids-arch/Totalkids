import type { CheckoutParseResult } from "../domain/checkout-details";
import { checkoutBlocker } from "./order-summary";
import type { CheckoutCart } from "./ports";

/** Adónde vuelve el comprador cuando no puede estar en el paso de pago. */
export type PaymentStepRedirect = "/carrito" | "/checkout";

/**
 * Guarda del paso "Pago" (RF-06, RF-15). Función pura:
 * - carrito vacío o con productos agotados → al carrito, donde se ve qué cambió;
 * - datos de "Datos y facturación" faltantes o inválidos → a completarlos;
 * - todo en orden → null (puede pagar).
 *
 * El carrito se revisa primero: sin productos pagables, completar datos no sirve.
 */
export function paymentStepRedirect(
  cart: CheckoutCart,
  details: CheckoutParseResult,
): PaymentStepRedirect | null {
  if (checkoutBlocker(cart)) return "/carrito";
  if (!details.ok) return "/checkout";
  return null;
}

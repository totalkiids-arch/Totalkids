import type { DeliveryMethod } from "../domain/checkout-details";
import { quoteShipping, type ShippingQuote } from "../domain/shipping";
import type { CheckoutCart } from "./ports";

export interface OrderSummary {
  lines: CheckoutCart["lines"];
  subtotal: number;
  shipping: ShippingQuote;
  /** Subtotal + despacho; null mientras el despacho esté por confirmar. */
  total: number | null;
  unpriced: string[];
}

/**
 * Resumen del pedido del checkout ("Tu pedido"): líneas, subtotal, despacho y
 * total. Función pura; el despacho depende del método de entrega elegido.
 */
export function summarizeOrder(
  cart: CheckoutCart,
  method: DeliveryMethod,
  freeShippingThreshold: number | null,
): OrderSummary {
  const shipping = quoteShipping(method, cart.subtotal, freeShippingThreshold);
  return {
    lines: cart.lines,
    subtotal: cart.subtotal,
    shipping,
    total: shipping.cost === null ? null : cart.subtotal + shipping.cost,
    unpriced: cart.unpriced,
  };
}

/** Por qué no se puede avanzar al pago, o null si se puede. */
export function checkoutBlocker(cart: CheckoutCart): "empty" | "blocked" | null {
  if (cart.lines.length === 0) return "empty";
  if (cart.blocked) return "blocked";
  return null;
}

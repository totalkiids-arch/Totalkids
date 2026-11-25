import type { DeliveryMethod } from "../domain/checkout-details";
import { previewShipping, type ShippingQuote } from "../domain/shipping";
import type { CheckoutCart, DeliveryQuote } from "./ports";

export interface OrderSummary {
  lines: CheckoutCart["lines"];
  /** Antes del descuento. */
  subtotal: number;
  discount: number;
  shipping: ShippingQuote;
  /** Lo que se cobra: subtotal − descuento + despacho (si ya tiene costo). */
  total: number;
  unpriced: string[];
}

/**
 * Resumen en "Datos y facturación", antes de cotizar la entrega: el despacho
 * aparece por confirmar hasta el paso de pago. Función pura.
 */
export function summarizeOrder(cart: CheckoutCart, method: DeliveryMethod): OrderSummary {
  const shipping = previewShipping(method);
  return {
    lines: cart.lines,
    subtotal: cart.subtotal,
    discount: cart.discount,
    shipping,
    total: cart.subtotal - cart.discount + (shipping.cost ?? 0),
    unpriced: cart.unpriced,
  };
}

/** Resumen del paso de pago con la cotización de la API: el total es el que se cobrará. */
export function summarizeQuotedOrder(cart: CheckoutCart, quote: DeliveryQuote): OrderSummary {
  return {
    lines: cart.lines,
    subtotal: quote.totals.subtotal,
    discount: quote.totals.discount,
    shipping: quote.shipping,
    total: quote.totals.total,
    unpriced: cart.unpriced,
  };
}

/** Por qué no se puede avanzar al pago, o null si se puede. */
export function checkoutBlocker(cart: CheckoutCart): "empty" | "blocked" | null {
  if (cart.lines.length === 0) return "empty";
  if (cart.blocked) return "blocked";
  return null;
}

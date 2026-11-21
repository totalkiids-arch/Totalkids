import type { DeliveryMethod } from "./checkout-details";

/**
 * Costo de entrega (RF-08, RF-11). Dominio puro.
 *
 * - Retiro en taller: sin costo.
 * - Despacho a coordinar: gratis desde el umbral configurado. Bajo el umbral,
 *   la tarifa depende de la zona y la define el cliente en el panel
 *   (admin/despacho); mientras no exista, el costo es null ("por confirmar")
 *   y no se suma al total.
 */
export type ShippingQuote =
  { kind: "free"; cost: 0; reason: "pickup" | "threshold" } | { kind: "pending"; cost: null };

export function quoteShipping(
  method: DeliveryMethod,
  subtotal: number,
  freeShippingThreshold: number | null,
): ShippingQuote {
  if (method === "retiro") return { kind: "free", cost: 0, reason: "pickup" };
  if (freeShippingThreshold !== null && freeShippingThreshold > 0) {
    if (subtotal >= freeShippingThreshold) return { kind: "free", cost: 0, reason: "threshold" };
  }
  return { kind: "pending", cost: null };
}

/** Texto para el resumen del pedido. */
export function shippingLabel(quote: ShippingQuote): string {
  return quote.kind === "free" ? "Gratis" : "Por confirmar";
}

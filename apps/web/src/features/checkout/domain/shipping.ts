import type { DeliveryMethod } from "./checkout-details";

/**
 * Costo de entrega (RF-08, RF-11). Dominio puro.
 *
 * El costo real lo cotiza la API (GET /shipping/quote, LN-11) con la comuna:
 * retiro gratis, tarifa de la zona, despacho gratis por umbral, o "a coordinar"
 * (costo null: no se suma al total ni se cobra en Flow).
 */
export type ShippingQuote =
  | { kind: "free"; cost: 0; reason: "pickup" | "threshold" | "zone" }
  | { kind: "rate"; cost: number; leadTime: string | null }
  | { kind: "pending"; cost: null; message: string | null };

/** Motivo de la cotización de la API (ver QuoteReason en apps/api). */
export type ApiQuoteReason = "pickup" | "threshold" | "zone" | "pending_rate" | "coordinate";

/** Cotización de la API → lo que muestra el checkout. */
export function fromApiQuote(quote: {
  cost: number | null;
  reason: ApiQuoteReason;
  leadTime: string | null;
  message: string | null;
}): ShippingQuote {
  if (quote.cost === null) return { kind: "pending", cost: null, message: quote.message };
  if (quote.reason === "pickup") return { kind: "free", cost: 0, reason: "pickup" };
  if (quote.reason === "threshold") return { kind: "free", cost: 0, reason: "threshold" };
  if (quote.cost === 0) return { kind: "free", cost: 0, reason: "zone" };
  return { kind: "rate", cost: quote.cost, leadTime: quote.leadTime };
}

/**
 * Vista previa en "Datos y facturación", antes de cotizar: el retiro es gratis;
 * el despacho se calcula con la comuna en el paso de pago.
 */
export function previewShipping(method: DeliveryMethod): ShippingQuote {
  if (method === "retiro") return { kind: "free", cost: 0, reason: "pickup" };
  return {
    kind: "pending",
    cost: null,
    message: "El despacho se calcula con tu comuna en el paso de pago.",
  };
}

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** Texto para el resumen del pedido. */
export function shippingLabel(quote: ShippingQuote): string {
  if (quote.kind === "free") return "Gratis";
  if (quote.kind === "rate") return CLP.format(quote.cost);
  return "Por confirmar";
}

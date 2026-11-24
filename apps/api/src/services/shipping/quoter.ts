/**
 * Puerto de cotización de entrega (RF-08, RF-11). El carrito y la ruta
 * `/shipping/quote` solo conocen esta interfaz: hoy la implementa
 * `ZoneShippingQuoter` (zonas y tarifas del panel). Un courier (p. ej. Blue
 * Express) se agregaría como otro adaptador, sin cambiar el carrito.
 */

export type DeliveryOption = "retiro" | "despacho";

export interface QuoteRequest {
  method: DeliveryOption;
  /** Código de región ("RM"); solo despacho. */
  region?: string | undefined;
  commune?: string | undefined;
  /** Subtotal elegible − descuento del carrito: base del despacho gratis (RF-08). */
  amountAfterDiscount: number;
}

/**
 * - `pickup`: retiro en taller, siempre gratis.
 * - `threshold`: despacho gratis por alcanzar el umbral en una zona elegible.
 * - `zone`: tarifa de la zona (puede ser 0).
 * - `pending_rate`: la zona existe pero su tarifa está por confirmar (`cost: null`).
 * - `coordinate`: la comuna no tiene zona habilitada; se coordina con el cliente (`cost: null`).
 */
export type QuoteReason = "pickup" | "threshold" | "zone" | "pending_rate" | "coordinate";

export interface ShippingQuote {
  method: DeliveryOption;
  /** CLP; null = por confirmar (no se suma al total ni se cobra en Flow). */
  cost: number | null;
  reason: QuoteReason;
  /** Plazo que ve el comprador (despacho con zona). */
  leadTime: string | null;
  /** Dirección y horario de retiro (solo retiro). */
  pickupDetails: string | null;
  zone: { region: string; commune: string } | null;
  /** Avance hacia el despacho gratis; solo en zonas habilitadas y elegibles con umbral. */
  freeShipping: { threshold: number; remaining: number; reached: boolean } | null;
  /** Texto para el comprador cuando no hay una tarifa simple. */
  message: string | null;
}

export interface ShippingQuoter {
  /** Cotiza la entrega; null si el método no está disponible (retiro deshabilitado). */
  quote(request: QuoteRequest): Promise<ShippingQuote | null>;
}

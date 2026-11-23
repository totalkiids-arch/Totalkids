/**
 * Costo de entrega del carrito (LN-06, RF-08, RF-11). Función pura.
 *
 * Cambio del cliente (UI-13): no hay despacho a todo Chile.
 * - `retiro` en taller: siempre gratis.
 * - `despacho` (a coordinar): gratis desde el umbral si la zona lo admite; si
 *   no, la tarifa de la zona. Sin zona habilitada o con tarifa sin definir, el
 *   costo queda por confirmar (null) y no se suma al total.
 */

export type DeliveryMethod = "despacho" | "retiro";

export interface ShippingZoneRow {
  /** Tarifa en CLP; null = a coordinar. */
  price: number | null;
  active: boolean;
  freeShippingEligible: boolean;
  leadTime: string;
}

export interface ShippingQuote {
  method: DeliveryMethod;
  /** CLP; null = por confirmar. */
  cost: number | null;
  reason: "pickup" | "threshold" | "zone";
  /** Plazo de la zona, cuando hay una habilitada. */
  leadTime: string | null;
}

/**
 * @param zone Zona de la comuna elegida (null si no se indicó o no existe).
 * @param freeShippingThreshold Umbral de despacho gratis en CLP; null = sin umbral.
 */
export function quoteShipping(
  method: DeliveryMethod,
  subtotal: number,
  zone: ShippingZoneRow | null,
  freeShippingThreshold: number | null,
): ShippingQuote {
  if (method === "retiro") return { method, cost: 0, reason: "pickup", leadTime: null };

  const activeZone = zone?.active ? zone : null;
  const thresholdMet =
    freeShippingThreshold !== null &&
    freeShippingThreshold > 0 &&
    subtotal >= freeShippingThreshold;
  // Sin zona conocida, el umbral igual aplica: la dirección se coordina después.
  if (thresholdMet && (activeZone === null || activeZone.freeShippingEligible)) {
    return { method, cost: 0, reason: "threshold", leadTime: activeZone?.leadTime ?? null };
  }
  return {
    method,
    cost: activeZone ? activeZone.price : null,
    reason: "zone",
    leadTime: activeZone?.leadTime ?? null,
  };
}

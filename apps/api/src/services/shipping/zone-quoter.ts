import type { PrismaClient } from "../../lib/prisma.js";
import type { QuoteRequest, ShippingQuote, ShippingQuoter } from "./quoter.js";

type Db = Pick<PrismaClient, "setting" | "shippingZone">;

/** Comuna comparable: sin tildes, sin mayúsculas y con espacios simples («Ñuñoa» = «nunoa»). */
export function foldCommune(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export const SHIPPING_MESSAGES = {
  pickup: "Retiro gratis en el taller.",
  threshold: "¡Tu compra tiene despacho gratis!",
  pendingRate: "Tarifa por confirmar: te contactaremos para coordinar el despacho.",
  coordinate: "Coordinaremos contigo el despacho a tu comuna.",
};

/**
 * Adaptador actual: zonas de despacho y configuración del panel (RF-28). El
 * despacho se coordina con el cliente (UI-13): una zona sin tarifa queda «por
 * confirmar», y una comuna sin zona, «a coordinar».
 */
export class ZoneShippingQuoter implements ShippingQuoter {
  constructor(private readonly db: Db) {}

  async quote(request: QuoteRequest): Promise<ShippingQuote | null> {
    const setting = await this.db.setting.findUnique({ where: { id: 1 } });
    const base = { leadTime: null, pickupDetails: null, zone: null, freeShipping: null };

    if (request.method === "retiro") {
      if (!setting?.pickupEnabled) return null;
      return {
        ...base,
        method: "retiro",
        cost: 0,
        reason: "pickup",
        pickupDetails: setting.pickupDetails,
        message: SHIPPING_MESSAGES.pickup,
      };
    }

    const region = (request.region ?? "").trim().toUpperCase();
    const commune = foldCommune(request.commune ?? "");
    const zones = await this.db.shippingZone.findMany({ where: { region, active: true } });
    const zone = zones.find((z) => foldCommune(z.commune) === commune);
    if (!zone) {
      return {
        ...base,
        method: "despacho",
        cost: null,
        reason: "coordinate",
        message: SHIPPING_MESSAGES.coordinate,
      };
    }

    const threshold = setting?.freeShippingThreshold ?? null;
    const freeShipping =
      zone.freeShippingEligible && threshold !== null && threshold > 0
        ? {
            threshold,
            remaining: Math.max(0, threshold - request.amountAfterDiscount),
            reached: request.amountAfterDiscount >= threshold,
          }
        : null;
    const common = {
      ...base,
      method: "despacho" as const,
      leadTime: zone.leadTime,
      zone: { region: zone.region, commune: zone.commune },
      freeShipping,
    };
    if (freeShipping?.reached) {
      return { ...common, cost: 0, reason: "threshold", message: SHIPPING_MESSAGES.threshold };
    }
    if (zone.price === null) {
      return {
        ...common,
        cost: null,
        reason: "pending_rate",
        message: SHIPPING_MESSAGES.pendingRate,
      };
    }
    return { ...common, cost: zone.price, reason: "zone", message: null };
  }
}

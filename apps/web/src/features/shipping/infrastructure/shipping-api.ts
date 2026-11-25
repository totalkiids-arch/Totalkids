import { z } from "zod";

import { isRegionCode, type RegionCode } from "@/shared/config/regions";
import { unavailableError } from "@/shared/lib/panel-errors";

import type { ShippingSettings, ShippingZone, ZoneDraft } from "../domain/shipping-zone";

/*
 * Traducción de /admin/shipping-zones y /admin/shipping-settings
 * (apps/api/openapi.yaml) al panel. Puro (sin server-only ni Next.js) para
 * poder probarlo. Un cuerpo inesperado cuenta como API no disponible.
 */

const ApiZone = z.object({
  id: z.string(),
  region: z.string().refine(isRegionCode),
  commune: z.string(),
  price: z.number().int().nullable(),
  leadTime: z.string(),
  freeShippingEligible: z.boolean(),
  active: z.boolean(),
});

const ApiZoneList = z.object({ items: z.array(ApiZone) });

const ApiSettings = z.object({
  pickupEnabled: z.boolean(),
  pickupDetails: z.string(),
  freeShippingThreshold: z.number().int().nullable(),
  reservationMinutes: z.number().int(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const toZone = (z: z.infer<typeof ApiZone>): ShippingZone => ({
  ...z,
  region: z.region as RegionCode,
});

export const toZoneList = (body: unknown): ShippingZone[] =>
  parse(ApiZoneList, body).items.map(toZone);

export const toShippingZone = (body: unknown): ShippingZone => toZone(parse(ApiZone, body));

export function toShippingSettings(body: unknown): ShippingSettings {
  const s = parse(ApiSettings, body);
  return {
    pickupEnabled: s.pickupEnabled,
    pickup: s.pickupDetails,
    freeShippingThreshold: s.freeShippingThreshold,
    reservationMinutes: s.reservationMinutes,
  };
}

export const toApiZoneBody = (draft: ZoneDraft) => ({ ...draft });

export const toApiSettingsBody = (settings: ShippingSettings) => ({
  pickupEnabled: settings.pickupEnabled,
  pickupDetails: settings.pickup,
  freeShippingThreshold: settings.freeShippingThreshold,
  reservationMinutes: settings.reservationMinutes,
});

/** La API nombra la dirección de retiro `pickupDetails`; el formulario, `pickup`. */
export function toSettingsFormErrors(errors: Record<string, string>): Record<string, string> {
  const { pickupDetails, ...rest } = errors;
  return pickupDetails ? { ...rest, pickup: pickupDetails } : rest;
}

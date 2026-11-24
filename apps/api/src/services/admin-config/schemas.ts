import { z } from "zod";

import { isCalendarDate } from "../admin-orders/schemas.js";

/**
 * Esquemas de entrada de la configuración del panel (LN-16): cupones, banners,
 * zonas de despacho, condiciones de retiro y plantilla de la tienda.
 *
 * zod valida la forma (tipos, enteros, fechas reales); las reglas con los
 * textos del panel (largos, rangos, únicos, bloqueos) viven en cada servicio,
 * porque en un PATCH se revisan contra el registro ya guardado.
 */

export const idParams = z.object({ id: z.uuid("Identificador inválido") });

const whole = (message: string) =>
  z.number({ error: message }).int(message).min(-1_000_000_000).max(1_000_000_000);

const day = (message: string) => z.string({ error: message }).refine(isCalendarDate, message);

/** Al menos un campo en los PATCH. */
const nonEmpty = (body: object) => Object.keys(body).length > 0;
const NON_EMPTY = "Envía al menos un campo para modificar.";

// ── Cupones (RF-07, RF-28) ───────────────────────────────────────────────────

const couponFields = {
  code: z.string({ error: "Escribe el código del cupón." }).max(200),
  kind: z.enum(["percent", "amount"], "Elige el tipo de descuento."),
  /** Porcentaje entero (1–100) o monto en CLP entero (> 0); el rango lo revisa el servicio. */
  value: whole("El valor debe ser un número entero."),
  startsOn: day("Elige la fecha de inicio."),
  endsOn: day("Elige la fecha de término."),
  maxUses: whole("El máximo de usos debe ser un número entero de al menos 1."),
  active: z.boolean("Indica si el cupón queda activo.").optional(),
};

export const createCouponBody = z.strictObject(couponFields);
export type CreateCouponInput = z.output<typeof createCouponBody>;

export const updateCouponBody = z.strictObject(couponFields).partial().refine(nonEmpty, NON_EMPTY);
export type UpdateCouponInput = z.output<typeof updateCouponBody>;

// ── Banners (RF-28) ──────────────────────────────────────────────────────────

/** Fecha y hora ISO con zona ("2026-12-01T00:00:00-03:00"); null = sin límite. */
const instant = (message: string) =>
  z.iso.datetime({ offset: true, message }).nullable().optional();

const bannerFields = {
  title: z.string({ error: "Escribe el título del banner." }).max(400),
  text: z.string({ error: "Escribe el texto de apoyo." }).max(400),
  href: z.string({ error: "Escribe el destino, por ejemplo /catalogo." }).max(400),
  sortOrder: whole("El orden debe ser un número entero entre 1 y 99."),
  active: z.boolean("Indica si el banner queda activo.").optional(),
  startsAt: instant("Fecha de inicio inválida."),
  endsAt: instant("Fecha de término inválida."),
};

export const createBannerBody = z.strictObject(bannerFields);
export type CreateBannerInput = z.output<typeof createBannerBody>;

export const updateBannerBody = z.strictObject(bannerFields).partial().refine(nonEmpty, NON_EMPTY);
export type UpdateBannerInput = z.output<typeof updateBannerBody>;

// ── Zonas de despacho (RF-08, RF-11, RF-28) ──────────────────────────────────

const zoneFields = {
  region: z.string({ error: "Elige una región." }).max(10),
  commune: z.string({ error: "Escribe la comuna." }).max(400),
  /** CLP entero ≥ 0; null = tarifa por confirmar (despacho a coordinar, UI-13). */
  price: whole("Escribe la tarifa en pesos, sin decimales (p. ej. 4990).").nullable(),
  leadTime: z.string({ error: "Escribe el plazo que verá el comprador." }).max(400),
  freeShippingEligible: z.boolean("Indica si cuenta para el despacho gratis.").optional(),
  active: z.boolean("Indica si la zona queda activa.").optional(),
};

export const createZoneBody = z.strictObject(zoneFields);
export type CreateZoneInput = z.output<typeof createZoneBody>;

export const updateZoneBody = z.strictObject(zoneFields).partial().refine(nonEmpty, NON_EMPTY);
export type UpdateZoneInput = z.output<typeof updateZoneBody>;

// ── Condiciones de retiro y despacho ─────────────────────────────────────────

export const shippingSettingsBody = z.strictObject({
  pickupEnabled: z.boolean("Indica si el retiro en taller está habilitado."),
  pickupDetails: z.string({ error: "Escribe la dirección y el horario de retiro." }).max(1000),
  /** null = sin despacho gratis. */
  freeShippingThreshold: whole(
    "Escribe un monto en pesos, o déjalo vacío si no hay despacho gratis.",
  ).nullable(),
  reservationMinutes: whole("Escribe un número de minutos entre 1 y 120."),
});
export type ShippingSettingsInput = z.output<typeof shippingSettingsBody>;

// ── Plantilla de la tienda (UI-13) ───────────────────────────────────────────

/** Las mismas de apps/web/src/features/themes y del CHECK settings_active_theme_known. */
export const STORE_THEMES = [
  "clasica",
  "navidad",
  "pascua",
  "ano-nuevo",
  "fiestas-patrias",
  "invierno",
  "primavera",
] as const;
export type StoreThemeId = (typeof STORE_THEMES)[number];
export const DEFAULT_STORE_THEME: StoreThemeId = "clasica";

export const storeThemeBody = z.strictObject({
  theme: z.enum(STORE_THEMES, "Elige una plantilla de la lista."),
});

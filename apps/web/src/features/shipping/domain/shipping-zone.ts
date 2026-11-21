/**
 * Zonas de despacho y condiciones de retiro (RF-08, RF-11, RF-27). Dominio puro.
 *
 * Una zona es una comuna con tarifa y plazo. Solo las zonas activas se ofrecen
 * en nuevas compras; desactivar no cambia los pedidos ya hechos, que guardan
 * su propio costo de despacho.
 */
import { isRegionCode, type RegionCode } from "@/shared/config/regions";

export interface ShippingZone {
  id: string;
  region: RegionCode;
  commune: string;
  /** Tarifa en CLP. 0 = despacho sin costo en esa comuna. */
  price: number;
  /** Plazo que ve el comprador ("3 a 5 días hábiles"). */
  leadTime: string;
  active: boolean;
}

export type ZoneDraft = Omit<ShippingZone, "id">;

export interface ShippingSettings {
  /** Dirección y horario de retiro en taller (el retiro es gratis). */
  pickup: string;
  /** Despacho gratis desde este subtotal en CLP; null = no hay umbral. */
  freeShippingThreshold: number | null;
  /** Minutos que el stock queda reservado mientras se paga. */
  reservationMinutes: number;
}

export type FieldErrors = Partial<Record<string, string>>;

export const COMMUNE_MAX = 80;
export const LEAD_TIME_MAX = 60;
export const PICKUP_MAX = 200;
export const PRICE_MAX = 1_000_000;
export const THRESHOLD_MAX = 100_000_000;
export const RESERVATION_MIN = 1;
export const RESERVATION_MAX = 120;

/** Sin tildes, mayúsculas ni espacios extra, para detectar "Ñuñoa" repetida como "nunoa". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Lee un monto en pesos escrito a mano: "4990", "4.990" o "$4.990".
 * null si no es un entero no negativo.
 */
export function parseClp(text: string): number | null {
  const cleaned = text.replace(/[\s$.]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/** Valida una zona contra las reglas y contra las demás zonas (comuna única por región). */
export function validateZone(
  input: { region: string; commune: string; price: string; leadTime: string; active: boolean },
  others: readonly ShippingZone[],
): { ok: true; draft: ZoneDraft } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const commune = input.commune.replace(/\s+/g, " ").trim();
  const leadTime = input.leadTime.replace(/\s+/g, " ").trim();
  const price = parseClp(input.price);

  if (!isRegionCode(input.region)) errors.region = "Elige una región.";
  if (commune === "") errors.commune = "Escribe la comuna.";
  else if (commune.length > COMMUNE_MAX) errors.commune = `Usa ${COMMUNE_MAX} caracteres o menos.`;
  else if (
    isRegionCode(input.region) &&
    others.some((z) => z.region === input.region && fold(z.commune) === fold(commune))
  ) {
    errors.commune = "Esa comuna ya tiene una zona en esta región. Edita la existente.";
  }
  if (price === null) errors.price = "Escribe la tarifa en pesos, sin decimales (p. ej. 4990).";
  else if (price > PRICE_MAX) errors.price = "La tarifa parece demasiado alta. Revísala.";
  if (leadTime === "") errors.leadTime = "Escribe el plazo que verá el comprador.";
  else if (leadTime.length > LEAD_TIME_MAX) {
    errors.leadTime = `Usa ${LEAD_TIME_MAX} caracteres o menos.`;
  }

  if (Object.keys(errors).length > 0 || price === null || !isRegionCode(input.region)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    draft: { region: input.region, commune, price, leadTime, active: input.active },
  };
}

/** Valida las condiciones generales. El umbral vacío significa "sin despacho gratis". */
export function validateSettings(input: {
  pickup: string;
  freeShippingThreshold: string;
  reservationMinutes: string;
}): { ok: true; settings: ShippingSettings } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const pickup = input.pickup.replace(/\s+/g, " ").trim();
  const thresholdText = input.freeShippingThreshold.trim();
  const threshold = thresholdText === "" ? null : parseClp(thresholdText);
  const minutes = /^\d+$/.test(input.reservationMinutes.trim())
    ? Number(input.reservationMinutes.trim())
    : null;

  if (pickup === "") errors.pickup = "Escribe la dirección y el horario de retiro.";
  else if (pickup.length > PICKUP_MAX) errors.pickup = `Usa ${PICKUP_MAX} caracteres o menos.`;
  if (thresholdText !== "" && threshold === null) {
    errors.freeShippingThreshold =
      "Escribe un monto en pesos, o déjalo vacío si no hay despacho gratis.";
  } else if (threshold !== null && threshold > THRESHOLD_MAX) {
    errors.freeShippingThreshold = "El monto parece demasiado alto. Revísalo.";
  }
  if (minutes === null || minutes < RESERVATION_MIN || minutes > RESERVATION_MAX) {
    errors.reservationMinutes = `Escribe un número de minutos entre ${RESERVATION_MIN} y ${RESERVATION_MAX}.`;
  }

  if (Object.keys(errors).length > 0 || minutes === null) return { ok: false, errors };
  return {
    ok: true,
    settings: { pickup, freeShippingThreshold: threshold, reservationMinutes: minutes },
  };
}

/** Por región (de norte a sur, en el orden recibido) y luego por comuna. */
export function sortZones(
  zones: readonly ShippingZone[],
  regionOrder: readonly RegionCode[],
): ShippingZone[] {
  const rank = (code: RegionCode) => regionOrder.indexOf(code);
  return [...zones].sort(
    (a, b) => rank(a.region) - rank(b.region) || a.commune.localeCompare(b.commune, "es"),
  );
}

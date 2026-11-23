/**
 * Datos del comprador para el pedido (LN-09, RF-09 a RF-11). Funciones puras,
 * con las mismas reglas que el checkout de la web
 * (apps/web/src/features/checkout/domain).
 */

/** Códigos de región de Chile (los mismos de shared/config/regions.ts de la web). */
export const REGION_CODES = [
  "AP",
  "TA",
  "AN",
  "AT",
  "CO",
  "VS",
  "RM",
  "LI",
  "ML",
  "NB",
  "BI",
  "AR",
  "LR",
  "LL",
  "AI",
  "MA",
] as const;

export type RegionCode = (typeof REGION_CODES)[number];

export function isRegionCode(value: string): value is RegionCode {
  return (REGION_CODES as readonly string[]).includes(value);
}

/** Deja solo dígitos y K mayúscula. */
export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Dígito verificador (módulo 11; 10 = K). */
export function rutCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const digit = 11 - (sum % 11);
  return digit === 11 ? "0" : digit === 10 ? "K" : String(digit);
}

/** RUT válido: cuerpo de 7 u 8 dígitos sin ceros a la izquierda y verificador correcto. */
export function isValidRut(value: string): boolean {
  const match = /^([1-9]\d{6,7})([0-9K])$/.exec(cleanRut(value));
  if (!match) return false;
  const [, body = "", dv] = match;
  return rutCheckDigit(body) === dv;
}

/** "12.345.678-5" (el RUT debe ser válido). */
export function formatRut(value: string): string {
  const clean = cleanRut(value);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${clean.slice(-1)}`;
}

/** Teléfono chileno de 9 dígitos, con o sin +56, a "+56XXXXXXXXX"; null si no calza. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s().-]/g, "");
  return /^(?:\+?56)?\d{9}$/.test(digits) ? `+56${digits.slice(-9)}` : null;
}

/** Número visible del pedido: TK-1001. */
export function formatOrderNumber(number: number): string {
  return `TK-${number}`;
}

/** "TK-1048", "tk-1048", "#TK-1048" o "1048" → 1048; null si no tiene esa forma. */
export function parseOrderNumber(value: string): number | null {
  const match = /^#?\s*(?:tk\s*-?\s*)?(\d{1,9})$/i.exec(value.trim());
  return match ? Number(match[1]) : null;
}

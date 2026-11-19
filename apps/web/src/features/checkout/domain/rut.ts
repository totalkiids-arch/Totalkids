/**
 * RUT chileno (Rol Único Tributario). Dominio puro.
 *
 * Se acepta con o sin puntos y guion ("12.345.678-5", "12345678-5", "123456785").
 * El dígito verificador se calcula con módulo 11; "K" equivale a 10.
 */

/** Deja solo dígitos y K mayúscula. */
export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Dígito verificador del cuerpo numérico del RUT. */
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

/** RUT válido: cuerpo de 7 u 8 dígitos (sin ceros a la izquierda) y verificador correcto. */
export function isValidRut(value: string): boolean {
  const clean = cleanRut(value);
  const match = /^([1-9]\d{6,7})([0-9K])$/.exec(clean);
  if (!match) return false;
  const [, body = "", dv] = match;
  return rutCheckDigit(body) === dv;
}

/** Formato de presentación "12.345.678-5". Devuelve el texto tal cual si no es un RUT válido. */
export function formatRut(value: string): string {
  if (!isValidRut(value)) return value.trim();
  const clean = cleanRut(value);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${clean.slice(-1)}`;
}

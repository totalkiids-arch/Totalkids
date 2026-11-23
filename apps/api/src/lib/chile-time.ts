/**
 * Fechas de negocio en hora de Chile (SRS 4.5: la base guarda UTC; la interfaz
 * y las reglas de vigencia usan America/Santiago), sin depender de la zona
 * horaria del servidor.
 */
const CHILE_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario en Chile (AAAA-MM-DD) de un instante. */
export function chileDay(at: Date): string {
  return CHILE_DAY.format(at);
}

/** Día calendario en Chile (AAAA-MM-DD) de una columna DATE (sin zona horaria). */
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

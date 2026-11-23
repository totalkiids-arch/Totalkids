const CHILE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario de Chile ("2026-11-23") del instante dado. */
export function chileDate(now = new Date()): string {
  return CHILE_DATE.format(now);
}

/** Una columna DATE de Prisma (medianoche UTC) como "YYYY-MM-DD". */
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

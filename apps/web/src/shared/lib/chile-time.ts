/**
 * Fechas mostradas en hora de Chile (SRS 4.4.3: fechas en America/Santiago),
 * sin depender de la zona horaria del servidor. Sin conocimiento de negocio.
 */
const ZONE = "America/Santiago";

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONE,
});

// sv-SE da "AAAA-MM-DD HH:mm": ordenable y legible en una hoja de cálculo.
const SORTABLE = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONE,
});

/** "19 nov 2026, 16:20" (texto de pantalla). */
export const formatChileDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

/** "2026-11-19 16:20" (para CSV). */
export const chileDateTimeForCsv = (iso: string) => SORTABLE.format(new Date(iso));

const PARTS = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONE,
});

/** Diferencia (ms) entre la hora de Chile y UTC en ese instante. */
function chileOffsetAt(ms: number): number {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const n = (key: string) => Number(p[key]);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/** "2026-11-19T16:20" (valor de un input datetime-local) en hora de Chile. */
export const chileLocalInput = (iso: string) => SORTABLE.format(new Date(iso)).replace(" ", "T");

/**
 * "2026-11-19T16:20" leído como hora de Chile → ISO en UTC. null si no es una
 * fecha y hora válida. Considera el horario de verano de Chile.
 */
export function chileLocalToIso(text: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number) as [number, number, number, number, number];
  const local = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(local);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const guess = local - chileOffsetAt(local);
  return new Date(local - chileOffsetAt(guess)).toISOString();
}

const DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONE,
});

/** Día calendario en Chile ("AAAA-MM-DD") de una fecha y hora ISO. */
export const chileDay = (iso: string) => DAY.format(new Date(iso));

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

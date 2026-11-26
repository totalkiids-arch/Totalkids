import { Prisma } from "../../generated/prisma/client.js";
import type { EmailEvent } from "../../generated/prisma/enums.js";
import { CRITICAL_EMAIL_EVENTS, EMAIL_JOB_PREFIX, emailJobType } from "./events.js";

/**
 * Límite diario de envíos (plan gratis de Brevo: 300 al día). Sin tabla nueva:
 * la cuenta del día sale de `email_attempts` (los intentos de cada `email_log`)
 * más los trabajos que están enviándose en este momento.
 *
 * - Bajo `limit − reserve`: se envía todo.
 * - En la reserva: solo los correos críticos (`CRITICAL_EMAIL_EVENTS`); los
 *   demás quedan `pending` sin reclamarse, así no gastan intentos ni se marcan
 *   fallidos, y salen solos al día siguiente.
 * - Al llegar al límite: pausa todo hasta el día siguiente. El último envío del
 *   día queda para la alerta al equipo (`email_quota_alert`, una vez por día).
 *
 * El día es el de Chile (America/Santiago).
 */

export const CHILE_TIME_ZONE = "America/Santiago";

export interface DailyQuota {
  limit: number;
  reserve: number;
}

export type QuotaMode = "normal" | "reserve" | "paused";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHILE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día de Chile de un instante: "2026-11-26". */
export function chileDay(at: Date): string {
  return dayFormat.format(at);
}

const HOUR = 3_600_000;

/** Primer instante (ms) en [lo, hi] cuyo día de Chile es >= `day`. */
function firstInstantOf(day: string, lo: number, hi: number): number {
  let low = lo;
  let high = hi;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (chileDay(new Date(mid)) >= day) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * Inicio y fin del día de Chile que contiene `at`. Se busca el instante exacto
 * (búsqueda binaria) para no depender del offset: en Chile el cambio de hora
 * ocurre justo a medianoche, y ese día empieza a la 01:00.
 */
export function chileDayRange(at: Date): { day: string; start: Date; end: Date } {
  const day = chileDay(at);
  const t = at.getTime();
  const start = firstInstantOf(day, t - 30 * HOUR, t);
  // El día siguiente empieza entre 22 y 26 horas después (cambios de hora incluidos).
  const nextDay = chileDay(new Date(start + 26 * HOUR));
  const end = firstInstantOf(nextDay, start + 22 * HOUR, start + 26 * HOUR);
  return { day, start: new Date(start), end: new Date(end) };
}

export interface QuotaDecision {
  mode: QuotaMode;
  day: string;
  /** Envíos contados en el día (intentos que salieron o pudieron salir + en curso). */
  used: number;
  /** Cuántos trabajos se pueden reclamar ahora (0 = ninguno). */
  allowance: number;
  /** Tipos de trabajo permitidos (null = todos los de correo). */
  types: string[] | null;
}

export const CRITICAL_JOB_TYPES = CRITICAL_EMAIL_EVENTS.map((event) => emailJobType(event));
export const QUOTA_ALERT_JOB_TYPE = emailJobType("email_quota_alert" satisfies EmailEvent);

/** Decide qué se puede enviar según lo usado en el día. Puro (fácil de probar). */
export function decideQuota(used: number, quota: DailyQuota, day: string): QuotaDecision {
  const { limit, reserve } = quota;
  // El último envío del día queda para la alerta de límite.
  const lastSlot = limit - 1;
  if (used >= lastSlot) {
    return {
      mode: "paused",
      day,
      used,
      allowance: Math.max(0, limit - used),
      types: [QUOTA_ALERT_JOB_TYPE],
    };
  }
  const reserveStart = Math.min(limit - reserve, lastSlot);
  if (used >= reserveStart) {
    return { mode: "reserve", day, used, allowance: lastSlot - used, types: CRITICAL_JOB_TYPES };
  }
  return { mode: "normal", day, used, allowance: reserveStart - used, types: null };
}

type RawClient = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Envíos del día de Chile: intentos `sent` y `timeout` (pudo haber salido) más
 * los trabajos de correo en `processing` (reclamados por otra instancia y aún
 * sin intento). Un intento manual también se copia al correo original
 * (`recordAttempt`): se cuenta una sola vez, en el registro del reenvío.
 * `scope` limita a las `event_key` que lo contienen (tests); por defecto "%".
 */
export async function countSentToday(
  db: RawClient,
  at: Date,
  scope = "%",
): Promise<{ day: string; used: number }> {
  const { day, start, end } = chileDayRange(at);
  const jobPattern = `${EMAIL_JOB_PREFIX}%`;
  const [row] = await db.$queryRaw<{ sent: number; inflight: number }[]>`
    SELECT
      (SELECT count(*) FROM email_attempts a
         JOIN email_log l ON l.id = a.email_id
        WHERE a.created_at >= ${start} AND a.created_at < ${end}
          AND a.result IN ('sent', 'timeout')
          AND (a.kind = 'automatic' OR l.resend_of_id IS NOT NULL)
          AND l.event_key LIKE ${scope})::int AS sent,
      (SELECT count(*) FROM outbox_jobs
        WHERE status = 'processing' AND type LIKE ${jobPattern}
          AND event_key LIKE ${scope})::int AS inflight`;
  return { day, used: (row?.sent ?? 0) + (row?.inflight ?? 0) };
}

/** Candado de transacción para contar y reclamar sin que dos instancias pasen del límite. */
export const QUOTA_LOCK_KEY = 7_014_201;

export async function lockQuota(db: RawClient): Promise<void> {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(${QUOTA_LOCK_KEY}::bigint)::text`;
}

/** Filtro SQL de tipos de trabajo (vacío = todos los de correo). */
export function typeFilter(types: readonly string[] | null): Prisma.Sql {
  return types ? Prisma.sql`AND type IN (${Prisma.join(types)})` : Prisma.empty;
}

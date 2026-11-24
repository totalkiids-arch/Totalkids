import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { z } from "zod";

import type {
  EmailAttemptKind,
  EmailAttemptResult,
  EmailStatus,
} from "../../generated/prisma/enums.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { issuePasswordResetToken } from "../auth.js";
import { issueUnsubscribeToken } from "../newsletter.js";
import { EMAIL_JOB_PREFIX, eventFromJobType, parseEmailData } from "./events.js";
import type { EmailSender, SendResult } from "./sender.js";
import {
  newsletterUnsubscribeUrl,
  passwordResetUrl,
  renderEmail,
  type RenderContext,
  type RenderedEmail,
} from "./templates/index.js";

/**
 * Worker durable de correos (LN-14, SRS 4.4.3). Corre en un proceso aparte
 * (`src/worker.ts`) y puede haber varias instancias:
 *
 * 1. Libera los bloqueos vencidos (un worker que murió a mitad de un envío):
 *    no se sabe si el correo salió, así que queda INCIERTO; nunca se reenvía a ciegas.
 * 2. Reclama un lote de trabajos `pending` vencidos con `FOR UPDATE SKIP LOCKED`
 *    (dos instancias nunca toman el mismo trabajo) y suma el intento.
 * 3. Envía cada uno y registra en una transacción el `EmailAttempt`, el estado
 *    del correo y el del trabajo: enviado; fallo definitivo; reintento a 1, 5 y
 *    15 minutos y luego `dead`; o timeout → incierto.
 */

/** Reintentos automáticos tras el envío inicial (SRS 4.4.3). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

export interface EmailWorkerConfig {
  /** PUBLIC_SITE_URL, para los enlaces absolutos. */
  siteUrl: string;
  batchSize: number;
  pollIntervalMs: number;
  /** Un `processing` más viejo que esto es de un worker caído. Mayor que el timeout de envío. */
  lockTimeoutMs: number;
  retryDelaysMs?: readonly number[];
  /**
   * Solo trabajos cuya `event_key` contiene este texto. Para tests y tareas
   * puntuales; en operación normal no se usa.
   */
  scope?: string;
}

export interface EmailWorkerDeps {
  prisma: PrismaClient;
  sender: EmailSender;
  logger: Logger;
  config: EmailWorkerConfig;
  workerId?: string;
  /** Reloj inyectable (tests de reintentos). */
  now?: () => Date;
}

export interface RunResult {
  /** Trabajos reclamados y procesados en esta vuelta. */
  processed: number;
  /** Bloqueos vencidos liberados (resueltos como inciertos). */
  released: number;
}

export interface EmailWorker {
  readonly workerId: string;
  runOnce(): Promise<RunResult>;
  /** Bucle de sondeo hasta `stop()`. */
  start(): void;
  /** Termina el lote en curso, no toma más y resuelve cuando el bucle se detuvo. */
  stop(): Promise<void>;
}

interface ClaimedJob {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
}

/** Actor de un reenvío manual (lo agrega `requestEmailResend` al payload). */
const resendSchema = z.object({
  resend: z.object({ actorUserId: z.uuid(), actorLabel: z.string().min(1).max(120) }),
});

type Actor = z.output<typeof resendSchema>["resend"];

function resendActor(payload: Prisma.JsonValue): Actor | null {
  const parsed = resendSchema.safeParse(payload);
  return parsed.success ? parsed.data.resend : null;
}

const STALE_DETAIL = "Worker interrumpido durante el envío: resultado incierto";
const INTERNAL_DETAIL = "Error interno al preparar el correo";

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Escapa % y _ para usar un texto literal dentro de LIKE. */
function likeContains(text: string | undefined): string {
  return text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : "%";
}

/** Resultado del intento y estado del correo para cada desenlace. */
const ATTEMPT_RESULT: Record<SendResult["outcome"], EmailAttemptResult> = {
  accepted: "sent",
  rejected: "failed",
  retryable: "failed",
  timeout: "timeout",
};

export function createEmailWorker(deps: EmailWorkerDeps): EmailWorker {
  const { prisma, sender, logger, config } = deps;
  const workerId = clip(
    deps.workerId ?? `${hostname()}:${String(process.pid)}:${randomUUID().slice(0, 8)}`,
    80,
  );
  const now = deps.now ?? (() => new Date());
  const delays = config.retryDelaysMs ?? RETRY_DELAYS_MS;
  const scope = likeContains(config.scope);
  const jobPattern = `${EMAIL_JOB_PREFIX}%`;

  // ── 1. Bloqueos vencidos ─────────────────────────────────────────────────────

  async function releaseStaleLocks(): Promise<number> {
    const cutoff = new Date(now().getTime() - config.lockTimeoutMs);
    const stale = await prisma.$queryRaw<{ id: string; payload: Prisma.JsonValue }[]>`
      SELECT id, payload FROM outbox_jobs
      WHERE status = 'processing' AND locked_at < ${cutoff}
        AND type LIKE ${jobPattern} AND event_key LIKE ${scope}
      ORDER BY locked_at
      LIMIT ${config.batchSize}`;
    let released = 0;
    for (const job of stale) {
      const at = now();
      const done = await prisma.$transaction(async (tx) => {
        // Condicional: si otro worker ya lo resolvió, no se toca.
        const updated = await tx.outboxJob.updateMany({
          where: { id: job.id, status: "processing", lockedAt: { lt: cutoff } },
          data: {
            status: "failed",
            lockedAt: null,
            lockedBy: null,
            lastError: STALE_DETAIL,
            processedAt: at,
          },
        });
        if (updated.count !== 1) return false;
        await recordAttempt(tx, job.id, job.payload, "timeout", STALE_DETAIL, null, at);
        return true;
      });
      if (done) {
        released += 1;
        logger.error(
          { jobId: job.id },
          "Correo con resultado incierto: el worker se interrumpió durante el envío",
        );
      }
    }
    return released;
  }

  // ── 2. Reclamo seguro para varias instancias ─────────────────────────────────

  async function claim(): Promise<ClaimedJob[]> {
    const at = now();
    return prisma.$queryRaw<ClaimedJob[]>`
      UPDATE outbox_jobs AS j
      SET status = 'processing', locked_at = ${at}, locked_by = ${workerId},
          attempts = j.attempts + 1, updated_at = ${at}
      WHERE j.id IN (
        SELECT id FROM outbox_jobs
        WHERE status = 'pending' AND next_run_at <= ${at} AND attempts < max_attempts
          AND type LIKE ${jobPattern} AND event_key LIKE ${scope}
        ORDER BY next_run_at, id
        LIMIT ${config.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING j.id, j.type, j.payload, j.attempts, j.max_attempts AS "maxAttempts"`;
  }

  // ── 3. Envío y registro ──────────────────────────────────────────────────────

  /**
   * Registra el intento en el correo del trabajo y su estado. En un reenvío
   * manual, el intento (con actor) también se suma al registro original, cuyo
   * estado pasa a reflejar el resultado (como en el panel).
   */
  async function recordAttempt(
    tx: Prisma.TransactionClient,
    jobId: string,
    payload: Prisma.JsonValue,
    result: EmailAttemptResult,
    detail: string | null,
    emailStatus: EmailStatus | null,
    at: Date,
    providerMessageId?: string | null,
  ): Promise<void> {
    const log = await tx.emailLog.findFirst({ where: { outboxJobId: jobId } });
    if (!log) return;
    const actor = resendActor(payload);
    const kind: EmailAttemptKind = actor ? "manual" : "automatic";
    const status: EmailStatus = emailStatus ?? (result === "timeout" ? "uncertain" : "failed");
    const attempt = {
      kind,
      result,
      actorUserId: actor?.actorUserId ?? null,
      actorLabel: actor?.actorLabel ?? null,
      detail: detail === null ? null : clip(detail, 500),
      createdAt: at,
    };
    await tx.emailAttempt.create({ data: { ...attempt, emailId: log.id } });
    await tx.emailLog.update({
      where: { id: log.id },
      data: { status, ...(providerMessageId ? { providerMessageId } : {}) },
    });
    if (actor && log.resendOfId) {
      await tx.emailAttempt.create({ data: { ...attempt, emailId: log.resendOfId } });
      await tx.emailLog.update({ where: { id: log.resendOfId }, data: { status } });
    }
  }

  type Prepared =
    | { kind: "skip"; reason: string; done: boolean }
    | { kind: "rejected"; detail: string }
    | { kind: "send"; event: string; recipient: string; rendered: RenderedEmail };

  async function prepare(job: ClaimedJob, at: Date): Promise<Prepared> {
    const event = eventFromJobType(job.type);
    const log = await prisma.emailLog.findFirst({ where: { outboxJobId: job.id } });
    if (!event || !log)
      return { kind: "skip", reason: "Trabajo sin registro de correo", done: false };
    if (log.status === "sent")
      return { kind: "skip", reason: "El correo ya figuraba enviado", done: true };

    const ctx: RenderContext = { siteUrl: config.siteUrl };
    const data = parseEmailData(event, job.payload);
    if (event === "password_recovery") {
      const { userId } = data as { userId: string };
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== "active") {
        return { kind: "rejected", detail: "La cuenta no existe o no está activa" };
      }
      // El token se emite justo antes de enviar y solo vive en el correo.
      const reset = await issuePasswordResetToken(prisma, userId, at);
      ctx.passwordReset = {
        url: passwordResetUrl(config.siteUrl, reset.token),
        expiresAt: reset.expiresAt,
      };
    }
    if (event === "newsletter_unsubscribe") {
      const { subscriberId } = data as { subscriberId: string };
      // Solo a una suscripción activa; el token se emite justo antes de enviar.
      const token = await issueUnsubscribeToken(prisma, subscriberId);
      if (!token) return { kind: "rejected", detail: "La suscripción ya no está activa" };
      ctx.unsubscribeUrl = newsletterUnsubscribeUrl(config.siteUrl, token);
    }
    return {
      kind: "send",
      event,
      recipient: log.recipient,
      rendered: renderEmail(event, data, ctx),
    };
  }

  async function finish(job: ClaimedJob, result: SendResult, at: Date): Promise<void> {
    const detail = result.outcome === "accepted" ? null : result.detail;
    const retry = result.outcome === "retryable" && job.attempts < job.maxAttempts;
    const jobData: Prisma.OutboxJobUpdateManyMutationInput = {
      lockedAt: null,
      lockedBy: null,
      lastError: detail === null ? null : clip(detail, 1000),
    };
    let emailStatus: EmailStatus;
    if (result.outcome === "accepted") {
      Object.assign(jobData, { status: "done", processedAt: at });
      emailStatus = "sent";
    } else if (retry) {
      const delay = delays[Math.min(job.attempts - 1, delays.length - 1)] ?? 0;
      Object.assign(jobData, { status: "pending", nextRunAt: new Date(at.getTime() + delay) });
      emailStatus = "pending";
    } else if (result.outcome === "retryable") {
      Object.assign(jobData, { status: "dead", processedAt: at });
      emailStatus = "failed";
    } else {
      Object.assign(jobData, { status: "failed", processedAt: at });
      emailStatus = result.outcome === "timeout" ? "uncertain" : "failed";
    }

    const owned = await prisma.$transaction(async (tx) => {
      const updated = await tx.outboxJob.updateMany({
        where: { id: job.id, status: "processing", lockedBy: workerId },
        data: jobData,
      });
      // El intento ocurrió: se registra aunque otro worker haya liberado el bloqueo.
      await recordAttempt(
        tx,
        job.id,
        job.payload,
        ATTEMPT_RESULT[result.outcome],
        detail,
        emailStatus,
        at,
        result.outcome === "accepted" ? result.messageId : null,
      );
      return updated.count === 1;
    });

    const fields = { jobId: job.id, type: job.type, attempt: job.attempts };
    if (!owned) logger.warn(fields, "El bloqueo del trabajo se liberó antes de terminar");
    if (result.outcome === "accepted") logger.info(fields, "Correo enviado");
    else if (retry) logger.warn({ ...fields, detail }, "Envío fallido: se reintentará");
    else if (result.outcome === "timeout")
      logger.error({ ...fields, detail }, "Correo con resultado incierto");
    else logger.error({ ...fields, detail }, "Correo fallido: requiere revisión o reenvío manual");
  }

  /** Cierra un trabajo que no se puede enviar (sin intento posible). */
  async function skip(job: ClaimedJob, reason: string, at: Date, done: boolean): Promise<void> {
    await prisma.outboxJob.updateMany({
      where: { id: job.id, status: "processing", lockedBy: workerId },
      data: {
        status: done ? "done" : "failed",
        lockedAt: null,
        lockedBy: null,
        lastError: done ? null : reason,
        processedAt: at,
      },
    });
    if (!done) logger.error({ jobId: job.id, type: job.type }, reason);
  }

  async function processJob(job: ClaimedJob): Promise<void> {
    const at = now();
    let prepared: Prepared;
    try {
      prepared = await prepare(job, at);
    } catch (error) {
      // Antes de enviar: seguro reintentar. Solo nombre/código del error (sin datos).
      const name = error instanceof Error ? error.name : "Error";
      logger.error({ jobId: job.id, err: { name } }, INTERNAL_DETAIL);
      await finish(job, { outcome: "retryable", detail: INTERNAL_DETAIL }, at);
      return;
    }
    if (prepared.kind === "skip") {
      await skip(job, prepared.reason, at, prepared.done);
      return;
    }
    if (prepared.kind === "rejected") {
      await finish(job, { outcome: "rejected", detail: prepared.detail }, at);
      return;
    }
    const result = await sender.send({
      to: prepared.recipient,
      subject: prepared.rendered.subject,
      html: prepared.rendered.html,
      text: prepared.rendered.text,
      tag: prepared.event,
    });
    await finish(job, result, now());
  }

  async function runOnce(): Promise<RunResult> {
    const released = await releaseStaleLocks();
    const jobs = await claim();
    for (const job of jobs) {
      await processJob(job);
    }
    return { processed: jobs.length, released };
  }

  // ── Bucle y apagado limpio ───────────────────────────────────────────────────

  let loop: Promise<void> | null = null;
  let stopping = false;
  let wake: (() => void) | null = null;

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  return {
    workerId,
    runOnce,
    start() {
      if (loop) return;
      stopping = false;
      loop = (async () => {
        logger.info({ workerId, sender: sender.name }, "Worker de correos iniciado");
        while (!stopping) {
          let busy = false;
          try {
            const { processed } = await runOnce();
            busy = processed === config.batchSize;
          } catch (error) {
            const name = error instanceof Error ? error.name : "Error";
            logger.error({ err: { name } }, "Error en la vuelta del worker de correos");
          }
          // Con un lote lleno sigue de inmediato; si no, espera la próxima vuelta.
          if (!stopping && !busy) await pause(config.pollIntervalMs);
        }
        logger.info({ workerId }, "Worker de correos detenido");
      })();
    },
    async stop() {
      stopping = true;
      wake?.();
      await loop;
      loop = null;
    },
  };
}

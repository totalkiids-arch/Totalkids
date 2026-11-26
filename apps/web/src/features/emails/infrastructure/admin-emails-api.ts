import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import {
  ATTEMPT_RESULTS,
  EMAIL_EVENTS,
  EMAIL_STATUSES,
  type EmailDetail,
  type EmailPage,
  type EmailSummary,
} from "../domain/email-log";

/*
 * Traducción de /admin/emails (apps/api/openapi.yaml) al panel. Puro (sin
 * server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta como
 * API no disponible.
 */

const ApiSummary = z.object({
  id: z.string(),
  event: z.enum(EMAIL_EVENTS),
  recipient: z.string(),
  status: z.enum(EMAIL_STATUSES),
  reference: z
    .object({ kind: z.enum(["order", "request", "sample"]), id: z.string(), label: z.string() })
    .nullable(),
  attemptsCount: z.number().int(),
  lastAttemptAt: z.string().nullable(),
  resendOfId: z.string().nullable(),
  canResend: z.boolean(),
  createdAt: z.string(),
});

const ApiPage = z.object({
  items: z.array(ApiSummary),
  meta: z.object({ page: z.number().int(), total: z.number().int(), totalPages: z.number().int() }),
  counts: z.object({
    pending: z.number().int(),
    sent: z.number().int(),
    failed: z.number().int(),
    uncertain: z.number().int(),
  }),
});

const ApiDetail = ApiSummary.extend({
  eventKey: z.string(),
  attempts: z.array(
    z.object({
      at: z.string(),
      kind: z.enum(["automatic", "manual"]),
      result: z.enum(ATTEMPT_RESULTS),
      resultLabel: z.string(),
      actorLabel: z.string().nullable(),
      actorName: z.string().nullable(),
      detail: z.string().nullable(),
    }),
  ),
  resends: z.array(
    z.object({ id: z.string(), status: z.enum(EMAIL_STATUSES), createdAt: z.string() }),
  ),
});

const ApiResend = z.object({ id: z.string() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const toSummary = (e: z.infer<typeof ApiSummary>): EmailSummary => ({
  id: e.id,
  event: e.event,
  recipient: e.recipient,
  status: e.status,
  reference: e.reference,
  attemptsCount: e.attemptsCount,
  lastAttemptAt: e.lastAttemptAt,
  resendOf: e.resendOfId,
  canResend: e.canResend,
  createdAt: e.createdAt,
});

export function toEmailPage(body: unknown): EmailPage {
  const data = parse(ApiPage, body);
  return {
    rows: data.items.map(toSummary),
    counts: data.counts,
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

export function toEmailDetail(body: unknown): EmailDetail {
  const e = parse(ApiDetail, body);
  return {
    ...toSummary(e),
    eventKey: e.eventKey,
    attempts: e.attempts.map((a) => ({
      at: a.at,
      kind: a.kind,
      result: a.result,
      resultLabel: a.resultLabel,
      actorLabel: a.actorLabel,
      actorName: a.actorName,
      detail: a.detail,
    })),
    resends: e.resends,
  };
}

/** Id del registro nuevo creado por el reenvío (202). */
export const toResendId = (body: unknown): string => parse(ApiResend, body).id;

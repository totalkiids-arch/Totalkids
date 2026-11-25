import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import {
  REQUEST_STATUSES,
  type AdminRequestDetail,
  type AdminRequestSummary,
  type RequestPage,
} from "../domain/service-request-admin";
import { isServiceId } from "../domain/services";

/*
 * Traducción de /admin/service-requests (apps/api/openapi.yaml) al panel. Puro
 * (sin server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta
 * como API no disponible.
 */

const ApiSummary = z.object({
  reference: z.string(),
  service: z.string().refine(isServiceId),
  serviceLabel: z.string(),
  name: z.string(),
  email: z.string(),
  commune: z.string().nullable(),
  preferredDate: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  hasNote: z.boolean(),
  createdAt: z.string(),
});

const ApiPage = z.object({
  items: z.array(ApiSummary),
  meta: z.object({ page: z.number().int(), total: z.number().int(), totalPages: z.number().int() }),
  counts: z.object({
    new: z.number().int(),
    in_progress: z.number().int(),
    resolved: z.number().int(),
  }),
});

const ApiDetail = ApiSummary.extend({
  phone: z.string().nullable(),
  childrenAges: z.string().nullable(),
  message: z.string(),
  note: z.string(),
  statusOptions: z.array(z.enum(REQUEST_STATUSES)),
  history: z.array(
    z.object({
      at: z.string(),
      actor: z.string(),
      actorName: z.string().nullable(),
      change: z.string(),
    }),
  ),
  emails: z.array(
    z.object({
      id: z.string(),
      event: z.string(),
      recipient: z.string(),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const toSummary = (r: z.infer<typeof ApiSummary>): AdminRequestSummary => ({
  reference: r.reference,
  service: r.service as AdminRequestSummary["service"],
  serviceLabel: r.serviceLabel,
  name: r.name,
  email: r.email,
  commune: r.commune,
  preferredDate: r.preferredDate,
  status: r.status,
  hasNote: r.hasNote,
  createdAt: r.createdAt,
});

export function toRequestPage(body: unknown): RequestPage {
  const data = parse(ApiPage, body);
  return {
    rows: data.items.map(toSummary),
    counts: data.counts,
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

export function toRequestDetail(body: unknown): AdminRequestDetail {
  const r = parse(ApiDetail, body);
  return {
    ...toSummary(r),
    phone: r.phone,
    ages: r.childrenAges,
    message: r.message,
    note: r.note,
    statusOptions: r.statusOptions,
    history: r.history,
    emails: r.emails.map(({ id, event, recipient, status, createdAt }) => ({
      id,
      event,
      recipient,
      status,
      createdAt,
    })),
  };
}

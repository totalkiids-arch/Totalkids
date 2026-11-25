import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import { SUBSCRIBER_STATUSES, type SubscriberPage } from "../domain/subscriber";

/*
 * Traducción de GET /admin/newsletter (apps/api/openapi.yaml) al panel. Puro
 * (sin server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta
 * como API no disponible.
 */

const ApiSubscriber = z.object({
  id: z.string(),
  email: z.string(),
  status: z.enum(SUBSCRIBER_STATUSES),
  consentedAt: z.string(),
  consentVersion: z.string(),
  unsubscribedAt: z.string().nullable(),
  unsubscribedBy: z.string().nullable(),
});

const ApiPage = z.object({
  items: z.array(ApiSubscriber),
  meta: z.object({ page: z.number().int(), total: z.number().int(), totalPages: z.number().int() }),
  counts: z.object({ active: z.number().int(), unsubscribed: z.number().int() }),
});

export function toSubscriberPage(body: unknown): SubscriberPage {
  const parsed = ApiPage.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  const data = parsed.data;
  return {
    rows: data.items.map((s) => ({
      id: s.id,
      email: s.email,
      consentedAt: s.consentedAt,
      consentVersion: s.consentVersion,
      status: s.status,
      unsubscribedAt: s.unsubscribedAt,
      unsubscribedBy: s.unsubscribedBy,
    })),
    counts: data.counts,
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

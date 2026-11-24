import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import type { PaymentPage } from "../domain/payment-query";
import { ATTEMPT_STATUSES, type AttemptStatus } from "../domain/payment-status";

/*
 * Traducción de GET /admin/payments (apps/api/openapi.yaml) al panel. Puro
 * (sin server-only ni Next.js) para poder probarlo. Un cuerpo inesperado
 * cuenta como API no disponible.
 */

const ApiPayment = z.object({
  orderRef: z.string(),
  buyerName: z.string(),
  commerceOrder: z.string(),
  amount: z.number().int(),
  status: z.enum(ATTEMPT_STATUSES),
  createdAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  current: z.boolean(),
  reconcilable: z.boolean(),
});

const ApiPaymentPage = z.object({
  items: z.array(ApiPayment),
  meta: z.object({ page: z.number().int(), total: z.number().int(), totalPages: z.number().int() }),
  counts: z.record(z.string(), z.number().int()),
});

export function toPaymentPage(body: unknown): PaymentPage {
  const parsed = ApiPaymentPage.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  const data = parsed.data;
  const counts = Object.fromEntries(
    ATTEMPT_STATUSES.map((status) => [status, data.counts[status] ?? 0]),
  ) as Record<AttemptStatus, number>;
  return {
    rows: data.items.map((p) => ({
      orderId: p.orderRef,
      buyerName: p.buyerName,
      commerceOrder: p.commerceOrder,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      lastCheckedAt: p.lastCheckedAt,
      current: p.current,
      reconcilable: p.reconcilable,
    })),
    counts,
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

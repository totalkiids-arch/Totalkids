import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import type { PaymentPage } from "../domain/payment-query";
import { ATTEMPT_STATUSES, type AttemptStatus } from "../domain/payment-status";
import {
  isPaymentResolution,
  RECONCILE_OUTCOMES,
  type ReconcileOutcome,
} from "../domain/reconciliation";

/*
 * Traducción de GET /admin/payments y de la conciliación (POST
 * /admin/payments/{id}/reconcile, LN-15; apps/api/openapi.yaml) al panel. Puro
 * (sin server-only ni Next.js) para poder probarlo. Un cuerpo inesperado
 * cuenta como API no disponible.
 */

const ApiPayment = z.object({
  id: z.string(),
  orderRef: z.string(),
  buyerName: z.string(),
  commerceOrder: z.string(),
  amount: z.number().int(),
  status: z.enum(ATTEMPT_STATUSES),
  createdAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  current: z.boolean(),
  reconcilable: z.boolean(),
  reconcileAttempts: z.number().int().optional(),
  nextCheckAt: z.string().nullable().optional(),
  resolutions: z.array(z.string()).optional(),
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
      id: p.id,
      orderId: p.orderRef,
      buyerName: p.buyerName,
      commerceOrder: p.commerceOrder,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      lastCheckedAt: p.lastCheckedAt,
      current: p.current,
      reconcilable: p.reconcilable,
      reconcileAttempts: p.reconcileAttempts ?? 0,
      nextCheckAt: p.nextCheckAt ?? null,
      // Una resolución desconocida (API más nueva) no se ofrece.
      resolutions: (p.resolutions ?? []).filter(isPaymentResolution),
    })),
    counts,
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

const ApiReconcileResult = z.object({ outcome: z.enum(RECONCILE_OUTCOMES) });

/** Resultado de «Consultar en Flow». Un cuerpo inesperado cuenta como API no disponible. */
export function toReconcileOutcome(body: unknown): ReconcileOutcome {
  const parsed = ApiReconcileResult.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data.outcome;
}

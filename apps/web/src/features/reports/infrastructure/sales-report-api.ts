import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import type { SalesReport } from "../domain/sales-report";

/*
 * Traducción de GET /admin/reports/sales (apps/api/openapi.yaml) al panel. Puro
 * (sin server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta
 * como API no disponible.
 */

const int = z.number().int();

const ApiSalesReport = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  criteria: z.string(),
  charged: int,
  refunded: int,
  net: int,
  paidOrders: int,
  averageTicket: int,
  refundsCount: int,
  sales: z.array(
    z.object({
      orderRef: z.string(),
      buyerName: z.string(),
      method: z.string(),
      paidAt: z.string(),
      charged: int,
      refundedInPeriod: int,
    }),
  ),
  byProduct: z.array(z.object({ name: z.string(), sku: z.string(), units: int, amount: int })),
  byMethod: z.array(z.object({ method: z.string(), orders: int, charged: int, refunded: int })),
  refunds: z.array(
    z.object({
      id: z.string(),
      orderRef: z.string(),
      date: z.string(),
      amount: int,
      method: z.string(),
      reference: z.string(),
    }),
  ),
});

export function toSalesReport(body: unknown): SalesReport {
  const parsed = ApiSalesReport.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  const r = parsed.data;
  return {
    period: r.period,
    criteria: r.criteria,
    charged: r.charged,
    refunded: r.refunded,
    net: r.net,
    paidOrders: r.paidOrders,
    averageTicket: r.averageTicket,
    refundsCount: r.refundsCount,
    sales: r.sales,
    byProduct: r.byProduct,
    byMethod: r.byMethod,
    refunds: r.refunds,
  };
}

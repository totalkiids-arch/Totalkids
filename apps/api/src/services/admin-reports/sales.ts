import { z } from "zod";

import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { isCalendarDate } from "../admin-orders/schemas.js";
import { orderRef } from "../admin-orders/rules.js";
import { chileDate } from "../cart/chile-date.js";

/**
 * Reporte de ventas del panel (LN-16, RF-30). Solo Administrador. Mismo
 * criterio que `apps/web/src/features/reports/domain/sales-report.ts` (UI-14):
 *
 * - Una venta es un cobro confirmado (`payments.status = paid`). Pendientes,
 *   rechazados, en revisión y vencidos no entran. Un pedido pagado y luego
 *   cancelado sigue siendo una venta: la devolución se informa aparte.
 * - La venta cae en el período según la fecha del cobro, en días de Chile.
 * - Los reembolsos van APARTE (RF-30): cuentan los procesados cuya fecha cae en
 *   el período, aunque el cobro sea de un período anterior.
 * - Neto = cobros − reembolsos procesados del período. Todo en CLP enteros.
 * - Por producto: unidades y monto de las líneas al precio de compra (productos
 *   y extras), antes del descuento del cupón y sin despacho.
 * - Por medio de pago: el que informa Flow (`payment_method`) o «Flow».
 */

export const MAX_PERIOD_DAYS = 366;
export const DEFAULT_METHOD = "Flow";

export const PERIOD_MESSAGES = {
  invalid: "Elige fechas válidas para el período.",
  order: "La fecha inicial debe ser anterior o igual a la final.",
  tooLong: "Elige un período de hasta un año.",
} as const;

export const DATE_CRITERIA =
  "Las ventas se cuentan por la fecha del cobro confirmado y los reembolsos procesados por su propia fecha, aunque el cobro sea de otro período (días de Chile, America/Santiago). Montos en CLP. Las ventas por producto van al precio de compra, antes del descuento y sin despacho.";

/** `?from=&to=` en días de Chile. Sin fechas: el mes en curso hasta hoy. */
export const periodQuery = z.object({
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
});

export interface ReportPeriod {
  from: string;
  to: string;
}

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/** Valida el período (422 con los textos del panel). */
export function resolvePeriod(query: z.output<typeof periodQuery>, now = new Date()): ReportPeriod {
  const today = chileDate(now);
  const period = { from: query.from || `${today.slice(0, 7)}-01`, to: query.to || today };
  const fail = (path: "from" | "to", message: string) =>
    errors.validation("Los datos enviados no son válidos", {
      issues: [{ location: "query", path, message }],
    });
  if (!isCalendarDate(period.from)) throw fail("from", PERIOD_MESSAGES.invalid);
  if (!isCalendarDate(period.to)) throw fail("to", PERIOD_MESSAGES.invalid);
  if (period.from > period.to) throw fail("to", PERIOD_MESSAGES.order);
  if (daysBetween(period.from, period.to) >= MAX_PERIOD_DAYS) {
    throw fail("to", PERIOD_MESSAGES.tooLong);
  }
  return period;
}

export interface SaleRow {
  orderId: string;
  /** "TK-1048". */
  orderRef: string;
  buyerName: string;
  method: string;
  /** Fecha y hora ISO del cobro confirmado. */
  paidAt: string;
  charged: number;
  /** Reembolsos procesados de este pedido con fecha dentro del período. */
  refundedInPeriod: number;
}

export interface SalesReport {
  period: ReportPeriod;
  currency: "CLP";
  timeZone: "America/Santiago";
  criteria: string;
  charged: number;
  refunded: number;
  net: number;
  paidOrders: number;
  /** Cobro promedio por pedido; 0 sin ventas. */
  averageTicket: number;
  refundsCount: number;
  /** De la más reciente a la más antigua. */
  sales: SaleRow[];
  /** De mayor a menor monto. */
  byProduct: { name: string; sku: string; units: number; amount: number }[];
  byMethod: { method: string; orders: number; charged: number; refunded: number }[];
  /** Reembolsos procesados del período (aparte de los cobros). */
  refunds: {
    id: string;
    orderId: string;
    orderRef: string;
    date: string;
    amount: number;
    method: string;
    reference: string;
  }[];
}

interface SaleSql {
  order_id: string;
  number: number;
  buyer_name: string;
  method: string | null;
  paid_at: Date;
  amount: number;
}

interface RefundSql {
  id: string;
  order_id: string;
  number: number;
  refund_date: Date;
  amount: number;
  method: string | null;
  reference: string;
}

interface ProductSql {
  name: string;
  sku: string;
  units: number;
  amount: number;
}

export async function buildSalesReport(
  db: Pick<PrismaClient, "$queryRaw">,
  period: ReportPeriod,
): Promise<SalesReport> {
  const [sales, refunds, products] = await Promise.all([
    db.$queryRaw<SaleSql[]>`
      SELECT o."id" AS "order_id", o."number", o."buyer_name", p."payment_method" AS "method",
             COALESCE(p."paid_at", o."paid_at", p."updated_at") AS "paid_at", p."amount"
      FROM "payments" p JOIN "orders" o ON o."id" = p."order_id"
      WHERE p."status" = 'paid'
        AND (COALESCE(p."paid_at", o."paid_at", p."updated_at") AT TIME ZONE 'America/Santiago')::date
            BETWEEN ${period.from}::date AND ${period.to}::date
      ORDER BY 5 DESC, o."number" DESC`,
    db.$queryRaw<RefundSql[]>`
      SELECT r."id", r."order_id", o."number", r."refund_date", r."amount",
             p."payment_method" AS "method", r."reference"
      FROM "refund_records" r
      JOIN "orders" o ON o."id" = r."order_id"
      JOIN "payments" p ON p."id" = r."payment_id"
      WHERE r."status" = 'processed'
        AND r."refund_date" BETWEEN ${period.from}::date AND ${period.to}::date
      ORDER BY r."refund_date" DESC, r."created_at" DESC`,
    db.$queryRaw<ProductSql[]>`
      SELECT i."product_name" AS "name", i."sku",
             SUM(i."quantity")::int AS "units", SUM(i."line_total")::int AS "amount"
      FROM "order_items" i
      WHERE i."order_id" IN (
        SELECT p."order_id" FROM "payments" p JOIN "orders" o ON o."id" = p."order_id"
        WHERE p."status" = 'paid'
          AND (COALESCE(p."paid_at", o."paid_at", p."updated_at") AT TIME ZONE 'America/Santiago')::date
              BETWEEN ${period.from}::date AND ${period.to}::date
      )
      GROUP BY i."sku", i."product_name"
      ORDER BY 4 DESC, 3 DESC, i."sku"`,
  ]);

  const refundedByOrder = new Map<string, number>();
  for (const r of refunds) {
    refundedByOrder.set(r.order_id, (refundedByOrder.get(r.order_id) ?? 0) + r.amount);
  }

  const methods = new Map<string, SalesReport["byMethod"][number]>();
  const methodRow = (method: string) => {
    const row = methods.get(method) ?? { method, orders: 0, charged: 0, refunded: 0 };
    methods.set(method, row);
    return row;
  };
  for (const s of sales) {
    const row = methodRow(s.method ?? DEFAULT_METHOD);
    row.orders += 1;
    row.charged += s.amount;
  }
  for (const r of refunds) methodRow(r.method ?? DEFAULT_METHOD).refunded += r.amount;

  const charged = sales.reduce((sum, s) => sum + s.amount, 0);
  const refunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  return {
    period,
    currency: "CLP",
    timeZone: "America/Santiago",
    criteria: DATE_CRITERIA,
    charged,
    refunded,
    net: charged - refunded,
    paidOrders: sales.length,
    averageTicket: sales.length === 0 ? 0 : Math.round(charged / sales.length),
    refundsCount: refunds.length,
    sales: sales.map((s) => ({
      orderId: s.order_id,
      orderRef: orderRef(s.number),
      buyerName: s.buyer_name,
      method: s.method ?? DEFAULT_METHOD,
      paidAt: s.paid_at.toISOString(),
      charged: s.amount,
      refundedInPeriod: refundedByOrder.get(s.order_id) ?? 0,
    })),
    byProduct: products.map((p) => ({
      name: p.name,
      sku: p.sku,
      units: p.units,
      amount: p.amount,
    })),
    byMethod: [...methods.values()].sort(
      (a, b) => b.charged - a.charged || b.refunded - a.refunded,
    ),
    refunds: refunds.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      orderRef: orderRef(r.number),
      date: r.refund_date.toISOString().slice(0, 10),
      amount: r.amount,
      method: r.method ?? DEFAULT_METHOD,
      reference: r.reference,
    })),
  };
}

import type { OrderStatus, UserRole } from "../../generated/prisma/enums.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { listAdminOrders, type AdminOrderSummary } from "../admin-orders/query.js";
import { buildSalesReport, type ReportPeriod } from "../admin-reports/sales.js";
import { chileDate } from "../cart/chile-date.js";

/**
 * Resumen del panel (LN-16, UI-14). Administrador y Operador, solo lectura.
 * Los montos (cobros y reembolsos del mes) y el stock bajo son del
 * Administrador: el Operador no consulta reportes ni inventario (tabla de la
 * API de la SRS, RF-31), así que para él llegan en null.
 */

/** Umbral de «últimas unidades», el mismo de la ficha pública y del inventario (UI-11). */
export const LOW_STOCK_THRESHOLD = 3;

const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending_payment",
  "in_review",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
];

export interface PanelSummary {
  /** Pedidos por estado. */
  byStatus: Record<OrderStatus, number>;
  /** Pedidos cuyo último intento de pago está en revisión (resultado incierto). */
  paymentsInReview: number;
  /** Pedidos cuyo último intento de pago sigue pendiente. */
  paymentsPending: number;
  recentOrders: AdminOrderSummary[];
  /** Solo Administrador: cobros y reembolsos procesados del mes en curso (RF-30). */
  sales: { period: ReportPeriod; charged: number; refunded: number; net: number } | null;
  /** Solo Administrador: variantes activas con 1 a 3 unidades disponibles (0 = a pedido, no alerta). */
  lowStockVariants: number | null;
}

export async function panelSummary(
  db: Pick<PrismaClient, "$queryRaw" | "order">,
  role: UserRole,
  now = new Date(),
): Promise<PanelSummary> {
  const today = chileDate(now);
  const [grouped, payments, recent] = await Promise.all([
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.$queryRaw<{ status: string; total: number }[]>`
      SELECT lp."status"::text AS "status", count(*)::int AS "total"
      FROM "orders" o
      JOIN LATERAL (
        SELECT p."status" FROM "payments" p WHERE p."order_id" = o."id"
        ORDER BY p."attempt" DESC LIMIT 1
      ) lp ON TRUE
      WHERE lp."status" IN ('pending', 'in_review')
      GROUP BY lp."status"`,
    listAdminOrders(db, { page: 1, pageSize: 5 }),
  ]);
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const g of grouped) byStatus[g.status] = g._count._all;

  let sales: PanelSummary["sales"] = null;
  let lowStockVariants: number | null = null;
  if (role === "admin") {
    const period = { from: `${today.slice(0, 7)}-01`, to: today };
    const report = await buildSalesReport(db, period);
    sales = { period, charged: report.charged, refunded: report.refunded, net: report.net };
    const [low] = await db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS "total"
      FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id"
      WHERE v."active" AND p."status" <> 'inactive'
        AND v."stock_physical" - v."stock_reserved" BETWEEN 1 AND ${LOW_STOCK_THRESHOLD}`;
    lowStockVariants = low?.total ?? 0;
  }

  return {
    byStatus,
    paymentsInReview: payments.find((p) => p.status === "in_review")?.total ?? 0,
    paymentsPending: payments.find((p) => p.status === "pending")?.total ?? 0,
    recentOrders: recent.items,
    sales,
    lowStockVariants,
  };
}

import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import type { PaymentStatus } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { paginationQuery, pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { orderRef, PAYMENT_STATUS_LABEL } from "../admin-orders/rules.js";
import { parseOrderRef } from "../admin-orders/schemas.js";
import {
  availableResolutions,
  flowSaidPaid,
  isOpenPayment,
  type Resolution,
} from "../reconciliation/rules.js";

/**
 * Pagos del panel (LN-16, RF-33): intentos de cobro en Flow para la pantalla
 * «Pagos y conciliación». Administrador y Operador. `reconcilable` marca el
 * intento que se consulta en Flow y `resolutions`, cómo lo puede resolver a mano
 * el Administrador (LN-15, `services/reconciliation`).
 */

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "rejected",
  "voided",
  "in_review",
  "expired",
  "refund_pending",
] as const;

export const paymentListQuery = paginationQuery.extend({
  status: z.enum(PAYMENT_STATUSES, "Estado de pago inválido").optional(),
  /** Pedido: "TK-1048", "1048" o su uuid. */
  order: z
    .string()
    .transform((value, ctx) => {
      const ref = parseOrderRef(value);
      if (!ref) {
        ctx.addIssue({ code: "custom", message: "Pedido inválido" });
        return z.NEVER;
      }
      return ref;
    })
    .optional(),
});
export type PaymentListQuery = z.output<typeof paymentListQuery>;

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  orderRef: string;
  buyerName: string;
  attempt: number;
  commerceOrder: string;
  flowOrder: string | null;
  amount: number;
  status: PaymentStatus;
  statusLabel: string;
  paymentMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  lastCheckedAt: string | null;
  /** Es el último intento del pedido (el único que se concilia). */
  current: boolean;
  /** Último intento y sigue pendiente o en revisión: «Consultar en Flow» (LN-15). */
  reconcilable: boolean;
  /** Consultas inciertas seguidas a Flow. */
  reconcileAttempts: number;
  /** Próxima consulta automática, si está agendada. */
  nextCheckAt: string | null;
  /** Estado del pedido (para el panel). */
  orderStatus: string;
  /** Resoluciones manuales permitidas (solo Administrador). */
  resolutions: Resolution[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const rowOrderSelect = {
  number: true,
  buyerName: true,
  status: true,
  payments: { select: { attempt: true }, orderBy: { attempt: "desc" }, take: 1 },
} satisfies Prisma.OrderSelect;

type PaymentRowSource = Prisma.PaymentGetPayload<{
  include: { order: { select: typeof rowOrderSelect } };
}>;

function toRow(p: PaymentRowSource): AdminPaymentRow {
  const current = p.order.payments[0]?.attempt === p.attempt;
  return {
    id: p.id,
    orderId: p.orderId,
    orderRef: orderRef(p.order.number),
    buyerName: p.order.buyerName,
    attempt: p.attempt,
    commerceOrder: p.commerceOrder,
    flowOrder: p.flowOrder === null ? null : p.flowOrder.toString(),
    amount: p.amount,
    status: p.status,
    statusLabel: PAYMENT_STATUS_LABEL[p.status],
    paymentMethod: p.paymentMethod,
    createdAt: p.createdAt.toISOString(),
    paidAt: iso(p.paidAt),
    lastCheckedAt: iso(p.lastCheckedAt),
    current,
    reconcilable: current && isOpenPayment(p.status),
    reconcileAttempts: p.reconcileAttempts,
    nextCheckAt: iso(p.nextCheckAt),
    orderStatus: p.order.status,
    resolutions: availableResolutions({
      paymentStatus: p.status,
      flowSaysPaid: flowSaidPaid(p.providerResponse),
      orderStatus: p.order.status,
    }),
  };
}

/** Un intento con los mismos campos que el listado; 404 si no existe. */
export async function getAdminPayment(
  db: Pick<PrismaClient, "payment">,
  id: string,
): Promise<AdminPaymentRow> {
  const p = await db.payment.findUnique({
    where: { id },
    include: { order: { select: rowOrderSelect } },
  });
  if (!p) throw errors.notFound("Pago no encontrado");
  return toRow(p);
}

export async function listAdminPayments(
  db: Pick<PrismaClient, "payment">,
  query: PaymentListQuery,
): Promise<{ items: AdminPaymentRow[]; meta: PageMeta; counts: Record<PaymentStatus, number> }> {
  const base: Prisma.PaymentWhereInput = query.order
    ? "id" in query.order
      ? { orderId: query.order.id }
      : { order: { number: query.order.number } }
    : {};
  const where = { ...base, ...(query.status ? { status: query.status } : {}) };
  const [total, rows, grouped] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      include: {
        order: { select: rowOrderSelect },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageWindow(query),
    }),
    db.payment.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, 0])) as Record<
    PaymentStatus,
    number
  >;
  for (const g of grouped) counts[g.status] = g._count._all;
  return {
    items: rows.map(toRow),
    meta: pageMeta(total, query),
    counts,
  };
}

import { Prisma } from "../../generated/prisma/client.js";
import type {
  DeliveryMethod,
  EmailEvent,
  EmailStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  TaxDocument,
} from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { dateOnly } from "../cart/chile-date.js";
import {
  availableResolutions,
  flowSaidPaid,
  isOpenPayment,
  type Resolution,
} from "../reconciliation/rules.js";
import {
  availableTransitions,
  blockedByUnresolvedPayment,
  canRecordRestock,
  chargedAmount,
  committedRefunds,
  invoicePending,
  ORDER_STATUS_LABEL,
  orderPaymentStatus,
  orderRef,
  PAID_STATUSES,
  PAYMENT_STATUS_LABEL,
  processedRefunds,
  REFUND_STATUS_LABEL,
  refundableAmount,
  refundState,
  type OrderPaymentStatus,
  type OrderRefundState,
  type WorkflowOrder,
} from "./rules.js";
import type { AdminOrdersQuery, OrderRef } from "./schemas.js";

/**
 * Lecturas del panel de pedidos (LN-13, RF-27). El listado arma un solo WHERE
 * parametrizado (RNF-04); el detalle reúne todo lo que muestra la ficha del
 * pedido, con las transiciones ya calculadas para que el panel no repita reglas.
 */

// ── Listado ──────────────────────────────────────────────────────────────────

export interface AdminOrderSummary {
  id: string;
  number: number;
  /** "TK-1048". */
  ref: string;
  createdAt: string;
  buyerName: string;
  buyerEmail: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: OrderPaymentStatus;
  paymentLabel: string;
  deliveryMethod: DeliveryMethod;
  taxDocument: TaxDocument;
  invoicePending: boolean;
  /** null = despacho a coordinar. */
  shippingCost: number | null;
  total: number;
}

interface SummaryRow {
  id: string;
  number: number;
  created_at: Date;
  buyer_name: string;
  buyer_email: string;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  tax_document: TaxDocument;
  invoice_folio: string | null;
  shipping_cost: number | null;
  total: number;
  payment_status: PaymentStatus | null;
}

/** Escapa los comodines de LIKE en lo que escribe el equipo. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const paidStatusesSql = Prisma.join(PAID_STATUSES.map((s) => Prisma.sql`${s}::order_status`));

function listWhere(query: AdminOrdersQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.q) {
    // Número ("TK-1048", "1048"), nombre o correo, sin tildes ni mayúsculas.
    conditions.push(Prisma.sql`tk_search_normalize(
        'TK-' || o."number"::text || ' ' || o."buyer_name" || ' ' || o."buyer_email"
      ) LIKE tk_search_normalize(${likePattern(query.q)}) ESCAPE '\\'`);
  }
  if (query.status?.length) {
    conditions.push(Prisma.sql`o."status"::text = ANY(${query.status}::text[])`);
  }
  if (query.paymentStatus?.length) {
    const statuses = query.paymentStatus.filter((s) => s !== "none");
    const parts: Prisma.Sql[] = [];
    if (statuses.length) parts.push(Prisma.sql`lp."status"::text = ANY(${statuses}::text[])`);
    if (query.paymentStatus.includes("none")) parts.push(Prisma.sql`lp."status" IS NULL`);
    conditions.push(Prisma.sql`(${Prisma.join(parts, " OR ")})`);
  }
  if (query.deliveryMethod) {
    conditions.push(Prisma.sql`o."delivery_method"::text = ${query.deliveryMethod}`);
  }
  if (query.invoicePending !== undefined) {
    const pending = Prisma.sql`(o."tax_document" = 'factura' AND o."invoice_folio" IS NULL
      AND o."status" IN (${paidStatusesSql}))`;
    conditions.push(query.invoicePending ? pending : Prisma.sql`NOT ${pending}`);
  }
  if (query.from) {
    conditions.push(
      Prisma.sql`(o."created_at" AT TIME ZONE 'America/Santiago')::date >= ${query.from}::date`,
    );
  }
  if (query.to) {
    conditions.push(
      Prisma.sql`(o."created_at" AT TIME ZONE 'America/Santiago')::date <= ${query.to}::date`,
    );
  }
  return Prisma.sql`
    FROM "orders" o
    LEFT JOIN LATERAL (
      SELECT p."status" FROM "payments" p
      WHERE p."order_id" = o."id"
      ORDER BY p."attempt" DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE ${Prisma.join(conditions, " AND ")}`;
}

export async function listAdminOrders(
  prisma: Pick<PrismaClient, "$queryRaw">,
  query: AdminOrdersQuery,
): Promise<{ items: AdminOrderSummary[]; meta: PageMeta }> {
  const from = listWhere(query);
  const { skip, take } = pageWindow(query);
  const [[count], rows] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS "total" ${from}`,
    prisma.$queryRaw<SummaryRow[]>`
      SELECT o."id", o."number", o."created_at", o."buyer_name", o."buyer_email", o."status",
             o."delivery_method", o."tax_document", o."invoice_folio", o."shipping_cost",
             o."total", lp."status" AS "payment_status"
      ${from}
      ORDER BY o."created_at" DESC, o."number" DESC
      LIMIT ${take} OFFSET ${skip}`,
  ]);
  const items = rows.map((row): AdminOrderSummary => {
    const paymentStatus: OrderPaymentStatus = row.payment_status ?? "none";
    return {
      id: row.id,
      number: row.number,
      ref: orderRef(row.number),
      createdAt: row.created_at.toISOString(),
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      status: row.status,
      statusLabel: ORDER_STATUS_LABEL[row.status],
      paymentStatus,
      paymentLabel: PAYMENT_STATUS_LABEL[paymentStatus],
      deliveryMethod: row.delivery_method,
      taxDocument: row.tax_document,
      invoicePending: invoicePending({
        taxDocument: row.tax_document,
        invoiceFolio: row.invoice_folio,
        status: row.status,
      }),
      shippingCost: row.shipping_cost,
      total: row.total,
    };
  });
  return { items, meta: pageMeta(count?.total ?? 0, query) };
}

// ── Detalle ──────────────────────────────────────────────────────────────────

export function orderWhere(ref: OrderRef): Prisma.OrderWhereUniqueInput {
  return "id" in ref ? { id: ref.id } : { number: ref.number };
}

/**
 * Bloquea la fila del pedido (SELECT … FOR UPDATE) hasta el fin de la
 * transacción: dos cambios simultáneos sobre el mismo pedido se aplican uno
 * tras otro y el segundo valida contra el estado ya confirmado. 404 si no existe.
 */
export async function lockOrder(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  ref: OrderRef,
): Promise<string> {
  const rows =
    "id" in ref
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "orders" WHERE "id" = ${ref.id}::uuid FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "orders" WHERE "number" = ${ref.number} FOR UPDATE`;
  const [row] = rows;
  if (!row) throw errors.notFound("Pedido no encontrado");
  return row.id;
}

const detailInclude = {
  invoiceIssuedBy: { select: { name: true } },
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { extras: { orderBy: { extraCode: "asc" } } },
  },
  payments: { orderBy: { attempt: "asc" } },
  refunds: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { registeredBy: { select: { name: true } }, resolvedBy: { select: { name: true } } },
  },
  statusHistory: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { actor: { select: { name: true } } },
  },
  emails: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  reservations: { select: { status: true } },
  redemption: { select: { status: true } },
} satisfies Prisma.OrderInclude;

type DetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

export interface AdminOrderDetail {
  id: string;
  number: number;
  ref: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  statusLabel: string;
  buyer: { name: string; rut: string; email: string; phone: string };
  delivery: {
    method: DeliveryMethod;
    region: string | null;
    commune: string | null;
    street: string | null;
    unit: string | null;
    notes: string | null;
    leadTime: string | null;
    pickupDetails: string | null;
    carrier: string | null;
    trackingCode: string | null;
  };
  billing: {
    document: TaxDocument;
    rut: string | null;
    businessName: string | null;
    activity: string | null;
    email: string | null;
    address: string | null;
    commune: string | null;
    purchaseOrderRequired: boolean;
    invoice: {
      number: string;
      issuedAt: string;
      issuedBy: string;
      issuedByName: string | null;
    } | null;
    invoicePending: boolean;
  };
  items: {
    id: string;
    variantId: string | null;
    productName: string;
    sku: string;
    optionLabel: string | null;
    quantity: number;
    unitPrice: number;
    extrasUnitPrice: number;
    lineTotal: number;
    madeToOrder: boolean;
    leadTime: string | null;
    extras: { code: string; name: string; unitPrice: number | null; text: string | null }[];
  }[];
  amounts: {
    currency: string;
    subtotal: number;
    discount: number;
    /** null = despacho a coordinar (no suma al total). */
    shippingCost: number | null;
    total: number;
    couponCode: string | null;
  };
  payment: {
    status: OrderPaymentStatus;
    label: string;
    paymentDueAt: string;
    paidAt: string | null;
  };
  payments: {
    id: string;
    attempt: number;
    commerceOrder: string;
    flowOrder: string | null;
    status: PaymentStatus;
    label: string;
    amount: number;
    paymentMethod: string | null;
    paidAt: string | null;
    lastCheckedAt: string | null;
    createdAt: string;
    /** Último intento, pendiente o en revisión: «Consultar en Flow» (LN-15). */
    reconcilable: boolean;
    /** Resoluciones manuales permitidas (solo Administrador, LN-15). */
    resolutions: Resolution[];
  }[];
  refunds: AdminRefundRecord[];
  refundTotals: RefundTotals;
  statusHistory: {
    id: string;
    from: OrderStatus | null;
    to: OrderStatus;
    toLabel: string;
    actorLabel: string;
    actorName: string | null;
    reason: string | null;
    at: string;
  }[];
  /** audit_log del pedido: estados, reposición, reembolsos y factura. */
  activity: {
    id: string;
    action: string;
    actorLabel: string;
    actorName: string | null;
    reason: string | null;
    details: Prisma.JsonValue;
    at: string;
  }[];
  emails: {
    id: string;
    event: EmailEvent;
    recipient: string;
    status: EmailStatus;
    resendOfId: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  cancelledAt: string | null;
  restockRecordedAt: string | null;
  /** Al cancelar ahora se puede registrar la reposición (una sola vez, RN-06). */
  canRecordRestock: boolean;
  availableTransitions: OrderStatus[];
  blockedByUnresolvedPayment: boolean;
}

export interface RefundTotals {
  charged: number;
  /** Solicitados + procesados: cuentan para el tope. */
  committed: number;
  processed: number;
  refundable: number;
  state: OrderRefundState;
}

/** Totales de reembolso del pedido (RF-32): lo cobrado, lo comprometido y lo que queda. */
export function refundTotalsOf(flow: WorkflowOrder): RefundTotals {
  const refunds = flow.refunds ?? [];
  return {
    charged: chargedAmount(flow),
    committed: committedRefunds(refunds),
    processed: processedRefunds(refunds),
    refundable: refundableAmount(flow),
    state: refundState(refunds),
  };
}

export interface AdminRefundRecord {
  id: string;
  paymentId: string;
  amount: number;
  /** AAAA-MM-DD. */
  date: string;
  reference: string;
  status: RefundStatus;
  statusLabel: string;
  registeredBy: string;
  registeredByName: string | null;
  registeredAt: string;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type RefundRow = DetailRow["refunds"][number];

export function refundDto(r: RefundRow): AdminRefundRecord {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amount: r.amount,
    date: dateOnly(r.refundDate),
    reference: r.reference,
    status: r.status,
    statusLabel: REFUND_STATUS_LABEL[r.status],
    registeredBy: r.registeredByLabel,
    registeredByName: r.registeredBy?.name ?? null,
    registeredAt: r.createdAt.toISOString(),
    resolvedBy: r.resolvedByLabel,
    resolvedByName: r.resolvedBy?.name ?? null,
    resolvedAt: iso(r.resolvedAt),
  };
}

export const refundInclude = detailInclude.refunds.include;

/** Lo que necesitan las reglas, a partir de la fila del pedido. */
export function workflowOf(row: {
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  taxDocument: TaxDocument;
  invoiceFolio: string | null;
  restockRecordedAt: Date | null;
  payments: WorkflowOrder["payments"];
  refunds?: WorkflowOrder["refunds"];
  reservations?: { status: string }[];
  redemption?: { status: string } | null;
}): WorkflowOrder {
  return {
    status: row.status,
    deliveryMethod: row.deliveryMethod,
    taxDocument: row.taxDocument,
    invoiceFolio: row.invoiceFolio,
    restockRecordedAt: row.restockRecordedAt,
    payments: row.payments,
    refunds: row.refunds ?? [],
    // "released": el stock se liberó sin venderse (pago tardío sin stock, RN-05):
    // confirmar a mano no lo descontaría; se resuelve en Pagos (LN-15).
    unsettled:
      (row.reservations ?? []).some(
        (r) => r.status === "active" || r.status === "in_review" || r.status === "released",
      ) || row.redemption?.status === "reserved",
  };
}

type DetailClient = Pick<Prisma.TransactionClient, "order" | "auditLog">;

/** Ficha completa del pedido para el panel; 404 si no existe. */
export async function getAdminOrder(db: DetailClient, ref: OrderRef): Promise<AdminOrderDetail> {
  const o = await db.order.findUnique({ where: orderWhere(ref), include: detailInclude });
  if (!o) throw errors.notFound("Pedido no encontrado");
  const audit = await db.auditLog.findMany({
    where: { resourceType: "order", resourceId: o.id },
    include: { actor: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const flow = workflowOf(o);
  const paymentStatus = orderPaymentStatus(flow);
  const lastAttempt = Math.max(0, ...o.payments.map((p) => p.attempt));
  const refunds = o.refunds;
  return {
    id: o.id,
    number: o.number,
    ref: orderRef(o.number),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    status: o.status,
    statusLabel: ORDER_STATUS_LABEL[o.status],
    buyer: { name: o.buyerName, rut: o.buyerRut, email: o.buyerEmail, phone: o.buyerPhone },
    delivery: {
      method: o.deliveryMethod,
      region: o.shippingRegion,
      commune: o.shippingCommune,
      street: o.shippingStreet,
      unit: o.shippingUnit,
      notes: o.shippingNotes,
      leadTime: o.shippingLeadTime,
      pickupDetails: o.pickupDetails,
      carrier: o.carrier,
      trackingCode: o.trackingCode,
    },
    billing: {
      document: o.taxDocument,
      rut: o.invoiceRut,
      businessName: o.invoiceBusinessName,
      activity: o.invoiceActivity,
      email: o.invoiceEmail,
      address: o.invoiceAddress,
      commune: o.invoiceCommune,
      purchaseOrderRequired: o.purchaseOrderRequired,
      invoice:
        o.invoiceFolio && o.invoiceIssuedAt
          ? {
              number: o.invoiceFolio,
              issuedAt: o.invoiceIssuedAt.toISOString(),
              issuedBy: o.invoiceIssuedByLabel ?? "",
              issuedByName: o.invoiceIssuedBy?.name ?? null,
            }
          : null,
      invoicePending: invoicePending(flow),
    },
    items: o.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productName: i.productName,
      sku: i.sku,
      optionLabel: i.optionLabel,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      extrasUnitPrice: i.extrasUnitPrice,
      lineTotal: i.lineTotal,
      madeToOrder: i.madeToOrder,
      leadTime: i.leadTime,
      extras: i.extras.map((e) => ({
        code: e.extraCode,
        name: e.extraName,
        unitPrice: e.unitPrice,
        text: e.text,
      })),
    })),
    amounts: {
      currency: o.currency,
      subtotal: o.subtotal,
      discount: o.discount,
      shippingCost: o.shippingCost,
      total: o.total,
      couponCode: o.couponCode,
    },
    payment: {
      status: paymentStatus,
      label: PAYMENT_STATUS_LABEL[paymentStatus],
      paymentDueAt: o.paymentDueAt.toISOString(),
      paidAt: iso(o.paidAt),
    },
    payments: o.payments.map((p) => ({
      id: p.id,
      attempt: p.attempt,
      commerceOrder: p.commerceOrder,
      flowOrder: p.flowOrder === null ? null : p.flowOrder.toString(),
      status: p.status,
      label: PAYMENT_STATUS_LABEL[p.status],
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      paidAt: iso(p.paidAt),
      lastCheckedAt: iso(p.lastCheckedAt),
      createdAt: p.createdAt.toISOString(),
      reconcilable: p.attempt === lastAttempt && isOpenPayment(p.status),
      resolutions: availableResolutions({
        paymentStatus: p.status,
        flowSaysPaid: flowSaidPaid(p.providerResponse),
        orderStatus: o.status,
      }),
    })),
    refunds: refunds.map(refundDto),
    refundTotals: refundTotalsOf(flow),
    statusHistory: o.statusHistory.map((h) => ({
      id: h.id,
      from: h.fromStatus,
      to: h.toStatus,
      toLabel: ORDER_STATUS_LABEL[h.toStatus],
      actorLabel: h.actorLabel,
      actorName: h.actor?.name ?? null,
      reason: h.reason,
      at: h.createdAt.toISOString(),
    })),
    activity: audit.map((a) => ({
      id: a.id,
      action: a.action,
      actorLabel: a.actorLabel,
      actorName: a.actor?.name ?? null,
      reason: a.reason,
      details: a.details,
      at: a.createdAt.toISOString(),
    })),
    emails: o.emails.map((e) => ({
      id: e.id,
      event: e.event,
      recipient: e.recipient,
      status: e.status,
      resendOfId: e.resendOfId,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    cancelledAt: iso(o.cancelledAt),
    restockRecordedAt: iso(o.restockRecordedAt),
    canRecordRestock: canRecordRestock(flow, "cancelled"),
    availableTransitions: availableTransitions(flow),
    blockedByUnresolvedPayment: blockedByUnresolvedPayment(flow),
  };
}

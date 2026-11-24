import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import {
  ORDER_PAYMENT_STATES,
  REFUND_STATUSES,
  type AdminOrderDetail,
  type HistoryEntry,
} from "../domain/admin-order";
import type { AdminOrderListPage } from "../domain/admin-order-query";
import { ORDER_STATUS_LABEL, ORDER_STATUSES } from "../domain/order";

/*
 * Traducción de la API de pedidos del panel (LN-13, apps/api/openapi.yaml) al
 * dominio del panel. Puro (sin server-only ni Next.js) para poder probarlo.
 * Un cuerpo inesperado cuenta como API no disponible: nunca se inventan datos.
 */

const Status = z.enum(ORDER_STATUSES);
const PaymentState = z.enum(ORDER_PAYMENT_STATES);
const text = z.string().nullable().optional();
const int = z.number().int();

const ApiOrderSummary = z.object({
  ref: z.string(),
  createdAt: z.string(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  status: Status,
  paymentStatus: PaymentState,
  paymentLabel: z.string(),
  deliveryMethod: z.enum(["shipping", "pickup"]),
  invoicePending: z.boolean(),
  total: int,
});

const PageMeta = z.object({ page: int, total: int, totalPages: int });

const ApiRefund = z.object({
  id: z.string(),
  amount: int,
  date: z.string(),
  reference: z.string(),
  status: z.enum(REFUND_STATUSES),
  registeredBy: z.string(),
  registeredByName: z.string().nullable(),
});

const ApiRefundTotals = z.object({
  charged: int,
  committed: int,
  processed: int,
  refundable: int,
  state: z.enum(["not_requested", ...REFUND_STATUSES]),
});

const ApiOrderDetail = z.object({
  id: z.string(),
  ref: z.string(),
  createdAt: z.string(),
  status: Status,
  buyer: z.object({ name: z.string(), rut: z.string(), email: z.string(), phone: z.string() }),
  delivery: z.object({
    method: z.enum(["shipping", "pickup"]),
    region: text,
    commune: text,
    street: text,
    unit: text,
    notes: text,
    leadTime: text,
    pickupDetails: text,
    carrier: text,
    trackingCode: text,
  }),
  billing: z.object({
    document: z.enum(["boleta", "factura"]),
    rut: text,
    businessName: text,
    activity: text,
    email: text,
    address: text,
    commune: text,
    invoice: z
      .object({
        number: z.string(),
        issuedAt: z.string(),
        issuedBy: z.string(),
        issuedByName: z.string().nullable(),
      })
      .nullable(),
    invoicePending: z.boolean(),
  }),
  items: z.array(
    z.object({
      productName: z.string(),
      sku: z.string(),
      optionLabel: text,
      quantity: int,
      unitPrice: int,
      extrasUnitPrice: int,
      lineTotal: int,
      madeToOrder: z.boolean(),
      extras: z.array(z.object({ name: z.string(), text: text })),
    }),
  ),
  amounts: z.object({
    subtotal: int,
    discount: int,
    shippingCost: int.nullable(),
    total: int,
    couponCode: text,
  }),
  payment: z.object({
    status: PaymentState,
    label: z.string(),
    paidAt: z.string().nullable().optional(),
  }),
  payments: z.array(
    z.object({
      commerceOrder: z.string(),
      status: z.string(),
      label: z.string(),
      amount: int,
      createdAt: z.string(),
      lastCheckedAt: z.string().nullable(),
    }),
  ),
  refunds: z.array(ApiRefund),
  refundTotals: ApiRefundTotals,
  statusHistory: z.array(
    z.object({
      to: Status,
      actorLabel: z.string(),
      actorName: z.string().nullable(),
      reason: z.string().nullable(),
      at: z.string(),
    }),
  ),
  activity: z.array(
    z.object({
      action: z.string(),
      actorLabel: z.string(),
      actorName: z.string().nullable(),
      reason: z.string().nullable(),
      details: z.record(z.string(), z.unknown()).nullable().optional(),
      at: z.string(),
    }),
  ),
  canRecordRestock: z.boolean(),
  availableTransitions: z.array(Status),
  blockedByUnresolvedPayment: z.boolean(),
});

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const clp = (value: unknown) =>
  typeof value === "number" ? `$${value.toLocaleString("es-CL")}` : "";
const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Eventos del audit_log del pedido que no son cambios de estado (esos vienen en statusHistory). */
function activityTitle(action: string, details: Record<string, unknown>): HistoryEntry | null {
  const base = { at: "", actor: "", reason: null };
  switch (action) {
    case "order.refund_recorded":
      return { ...base, kind: "refund", title: `Reembolso registrado por ${clp(details.amount)}` };
    case "order.refund_resolved":
      return {
        ...base,
        kind: "refund",
        title: `Reembolso de ${clp(details.amount)} marcado como ${
          details.to === "processed" ? "procesado" : "fallido"
        }`,
      };
    case "order.invoice_registered":
      return {
        ...base,
        kind: "invoice",
        title: `Factura registrada (folio ${str(details.folio)})`,
      };
    case "order.invoice_replaced":
      return {
        ...base,
        kind: "invoice",
        title: `Folio de factura corregido: ${str(details.from)} → ${str(details.to)}`,
      };
    case "order.restock_recorded":
      return { ...base, kind: "restock", title: "Reposición de stock registrada" };
    default:
      return null;
  }
}

const actorOf = (entry: { actorName: string | null; actorLabel: string }) =>
  entry.actorName ? `${entry.actorName} (${entry.actorLabel})` : entry.actorLabel;

export function toOrderListPage(body: unknown): AdminOrderListPage {
  const data = parse(z.object({ items: z.array(ApiOrderSummary), meta: PageMeta }), body);
  return {
    items: data.items.map((o) => ({
      ref: o.ref,
      createdAt: o.createdAt,
      buyerName: o.buyerName,
      email: o.buyerEmail,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentLabel: o.paymentLabel,
      deliveryMethod: o.deliveryMethod,
      invoicePending: o.invoicePending,
      total: o.total,
    })),
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

export function toAdminOrderDetail(body: unknown): AdminOrderDetail {
  const o = parse(ApiOrderDetail, body);
  const d = o.delivery;
  const address =
    d.method === "shipping"
      ? [[d.street, d.unit].filter(Boolean).join(" "), d.commune, d.region]
          .filter(Boolean)
          .join(", ") || null
      : null;

  const history: HistoryEntry[] = [
    ...o.statusHistory.map((h) => ({
      at: h.at,
      actor: actorOf(h),
      kind: "status" as const,
      title: ORDER_STATUS_LABEL[h.to],
      reason: h.reason,
    })),
    ...o.activity.flatMap((a) => {
      const entry = activityTitle(a.action, a.details ?? {});
      return entry ? [{ ...entry, at: a.at, actor: actorOf(a), reason: a.reason }] : [];
    }),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    id: o.id,
    ref: o.ref,
    createdAt: o.createdAt,
    status: o.status,
    buyer: o.buyer,
    delivery: {
      method: d.method,
      address,
      notes: d.notes ?? null,
      leadTime: d.leadTime ?? null,
      pickupDetails: d.pickupDetails ?? null,
      carrier: d.carrier ?? null,
      trackingCode: d.trackingCode ?? null,
    },
    billing: {
      document: o.billing.document,
      rut: o.billing.rut ?? null,
      businessName: o.billing.businessName ?? null,
      activity: o.billing.activity ?? null,
      email: o.billing.email ?? null,
      address: [o.billing.address, o.billing.commune].filter(Boolean).join(", ") || null,
      invoice: o.billing.invoice
        ? {
            number: o.billing.invoice.number,
            issuedAt: o.billing.invoice.issuedAt,
            issuedBy: o.billing.invoice.issuedByName ?? o.billing.invoice.issuedBy,
          }
        : null,
      invoicePending: o.billing.invoicePending,
    },
    lines: o.items.map((item) => ({
      name: item.productName,
      sku: item.sku,
      option: item.optionLabel ?? null,
      extras: item.extras.map((e) => (e.text ? `${e.name}: «${e.text}»` : e.name)),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      extrasUnitPrice: item.extrasUnitPrice,
      lineTotal: item.lineTotal,
      madeToOrder: item.madeToOrder,
    })),
    amounts: {
      subtotal: o.amounts.subtotal,
      discount: o.amounts.discount,
      shippingCost: o.amounts.shippingCost,
      total: o.amounts.total,
      couponCode: o.amounts.couponCode ?? null,
    },
    payment: { status: o.payment.status, label: o.payment.label, paidAt: o.payment.paidAt ?? null },
    attempts: o.payments.map((p) => ({
      commerceOrder: p.commerceOrder,
      status: p.status,
      label: p.label,
      amount: p.amount,
      createdAt: p.createdAt,
      lastCheckedAt: p.lastCheckedAt,
    })),
    refunds: o.refunds.map((r) => ({
      id: r.id,
      amount: r.amount,
      date: r.date,
      reference: r.reference,
      status: r.status,
      registeredBy: r.registeredByName ?? r.registeredBy,
    })),
    refundTotals: o.refundTotals,
    history,
    transitions: o.availableTransitions,
    canRecordRestock: o.canRecordRestock,
    blockedByUnresolvedPayment: o.blockedByUnresolvedPayment,
  };
}

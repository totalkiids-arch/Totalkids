import type { Prisma } from "../generated/prisma/client.js";
import { formatOrderNumber, parseOrderNumber } from "../domain/checkout.js";
import { errors } from "../lib/errors.js";
import { issueOrderAccess, verifyOrderAccess } from "../lib/order-access.js";
import type { Db } from "./orders.js";

/**
 * Consulta del pedido por el comprador invitado (LN-09, RF-23, RF-36). No hay
 * cuentas: se entra con número + correo (POST /orders/lookup) o con la
 * credencial del pedido (X-Order-Access). Cualquier dato que no calce responde
 * el mismo 404, para no revelar qué pedidos existen ni de quién son.
 */

const NOT_FOUND = "No encontramos un pedido con esos datos. Revisa el correo de tu compra.";

/** Etiquetas de estado para el comprador (las mismas de la web). */
export const ORDER_STATUS_LABEL = {
  pending_payment: "Pendiente de pago",
  in_review: "Pago en revisión",
  confirmed: "Confirmado",
  preparing: "En preparación",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
} as const;

type OrderStatus = keyof typeof ORDER_STATUS_LABEL;

const orderInclude = {
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { extras: { orderBy: { extraCode: "asc" } } },
  },
  statusHistory: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  payments: { orderBy: { attempt: "desc" }, take: 1, select: { status: true } },
} satisfies Prisma.OrderInclude;

type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface GuestOrderDto {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  createdAt: string;
  /** Plazo para pagar mientras está pendiente. */
  paymentDueAt: string;
  paidAt: string | null;
  buyer: { name: string; email: string };
  delivery:
    | { method: "retiro"; pickupDetails: string | null }
    | {
        method: "despacho";
        address: string;
        region: string | null;
        commune: string | null;
        notes: string | null;
        leadTime: string | null;
        /** Transportista y seguimiento, cuando el pedido se despachó. */
        tracking: { carrier: string; code: string } | null;
      };
  billing: {
    document: "boleta" | "factura";
    businessName: string | null;
    /** Factura emitida por Total Kids (folio), cuando ya existe. */
    invoice: { folio: string; issuedAt: string } | null;
  };
  items: {
    sku: string;
    productName: string;
    optionLabel: string | null;
    quantity: number;
    unitPrice: number;
    extrasUnitPrice: number;
    lineTotal: number;
    madeToOrder: boolean;
    leadTime: string | null;
    extras: { code: string; name: string; unitPrice: number | null; text: string | null }[];
  }[];
  totals: { subtotal: number; discount: number; shipping: number | null; total: number };
  couponCode: string | null;
  /** Estado del último intento de pago en Flow, si existe. */
  paymentStatus: string | null;
  /** Historial para el comprador: estados con su fecha (sin actores ni notas internas). */
  history: { status: OrderStatus; label: string; at: string }[];
}

function toDto(order: OrderWithDetail): GuestOrderDto {
  const status = order.status as OrderStatus;
  const address = [order.shippingStreet, order.shippingUnit, order.shippingCommune]
    .filter(Boolean)
    .join(", ");
  return {
    orderNumber: formatOrderNumber(order.number),
    status,
    statusLabel: ORDER_STATUS_LABEL[status],
    createdAt: order.createdAt.toISOString(),
    paymentDueAt: order.paymentDueAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    buyer: { name: order.buyerName, email: order.buyerEmail },
    delivery:
      order.deliveryMethod === "pickup"
        ? { method: "retiro", pickupDetails: order.pickupDetails }
        : {
            method: "despacho",
            address,
            region: order.shippingRegion,
            commune: order.shippingCommune,
            notes: order.shippingNotes,
            leadTime: order.shippingLeadTime,
            tracking:
              order.carrier && order.trackingCode
                ? { carrier: order.carrier, code: order.trackingCode }
                : null,
          },
    billing: {
      document: order.taxDocument,
      businessName: order.invoiceBusinessName,
      invoice:
        order.invoiceFolio && order.invoiceIssuedAt
          ? { folio: order.invoiceFolio, issuedAt: order.invoiceIssuedAt.toISOString() }
          : null,
    },
    items: order.items.map((item) => ({
      sku: item.sku,
      productName: item.productName,
      optionLabel: item.optionLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      extrasUnitPrice: item.extrasUnitPrice,
      lineTotal: item.lineTotal,
      madeToOrder: item.madeToOrder,
      leadTime: item.leadTime,
      extras: item.extras.map((e) => ({
        code: e.extraCode,
        name: e.extraName,
        unitPrice: e.unitPrice,
        text: e.text,
      })),
    })),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shippingCost,
      total: order.total,
    },
    couponCode: order.couponCode,
    paymentStatus: order.payments[0]?.status ?? null,
    history: order.statusHistory.map((h) => ({
      status: h.toStatus as OrderStatus,
      label: ORDER_STATUS_LABEL[h.toStatus as OrderStatus],
      at: h.createdAt.toISOString(),
    })),
  };
}

async function findByNumber(db: Db, orderNumber: string): Promise<OrderWithDetail | null> {
  const number = parseOrderNumber(orderNumber);
  if (number === null || number > 2_147_483_647) return null;
  return db.order.findUnique({ where: { number }, include: orderInclude });
}

/**
 * POST /orders/lookup: número + correo de la compra. Entrega el pedido y su
 * credencial; si algo no calza, el mismo 404 (RF-36).
 */
export async function lookupOrder(
  db: Db,
  input: { orderNumber: string; email: string },
  accessSecret: string,
): Promise<{ order: GuestOrderDto; accessToken: string }> {
  const order = await findByNumber(db, input.orderNumber);
  if (!order || order.buyerEmail !== input.email.trim().toLowerCase()) {
    throw errors.notFound(NOT_FOUND);
  }
  return { order: toDto(order), accessToken: issueOrderAccess(accessSecret, order.id) };
}

/**
 * GET /orders/{orderNumber}: solo con la credencial de ESE pedido. Sin
 * credencial, 401; con una que no corresponde (o pedido inexistente), 404.
 */
export async function getGuestOrder(
  db: Db,
  orderNumber: string,
  credential: string | undefined,
  accessSecret: string,
): Promise<GuestOrderDto> {
  if (!credential) throw errors.unauthorized("Falta la credencial del pedido (X-Order-Access)");
  const order = await findByNumber(db, orderNumber);
  if (!order || !verifyOrderAccess(accessSecret, order.id, credential)) {
    throw errors.notFound(NOT_FOUND);
  }
  return toDto(order);
}

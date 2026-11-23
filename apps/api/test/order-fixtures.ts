import { randomUUID } from "node:crypto";

import type {
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
} from "../src/generated/prisma/enums.js";
import type { PrismaClient } from "../src/lib/prisma.js";

/**
 * Pedidos de prueba del panel (LN-13). LN-09 aún no crea pedidos, así que se
 * arman directo en la base respetando sus CHECK: importes (RN-01), pago con
 * fecha en estados pagados, despacho con transportista, reservas solo en
 * líneas con stock (las líneas a pedido no reservan).
 */

const DAY = 24 * 60 * 60 * 1000;

/** Borrador con una variante en una categoría inactiva (nunca visible en la tienda). */
export async function createVariant(db: PrismaClient, physical: number, reserved = 0) {
  const tag = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: { slug: `pedidos-${tag}`, name: `Pedidos ${tag}`, active: false },
  });
  const product = await db.product.create({
    data: { categoryId: category.id, name: "Cama nido", slug: `cama-pedidos-${tag}` },
  });
  return db.productVariant.create({
    data: {
      productId: product.id,
      sku: `PED-${tag}`.toUpperCase(),
      price: 10_000,
      stockPhysical: physical,
      stockReserved: reserved,
    },
  });
}

export interface LineSpec {
  /** Sin variante: línea suelta (snapshot), p. ej. de un producto ya borrado. */
  variantId?: string;
  quantity?: number;
  /** A pedido (UI-11): no reserva ni descuenta stock. */
  madeToOrder?: boolean;
  /** Reserva de la línea (por variante); se omite en las líneas a pedido. */
  reservation?: ReservationStatus;
  extras?: { code: string; name: string; unitPrice?: number | null; text?: string | null }[];
}

export interface OrderSpec {
  status?: OrderStatus;
  delivery?: "shipping" | "pickup";
  document?: "boleta" | "factura";
  buyerName?: string;
  buyerEmail?: string;
  /** Intentos de pago, del primero al último. */
  payments?: PaymentStatus[];
  /** Importe sin líneas (por defecto 30.000). */
  amount?: number;
  lines?: LineSpec[];
  /** Cupón con su uso reservado por el pedido. */
  couponId?: string;
  createdAt?: Date;
  paidAt?: Date;
  restockRecordedAt?: Date;
  invoiceFolio?: string;
}

export async function createOrder(db: PrismaClient, spec: OrderSpec = {}) {
  const status = spec.status ?? "pending_payment";
  const delivery = spec.delivery ?? "pickup";
  const payments = spec.payments ?? [];
  const createdAt = spec.createdAt ?? new Date(Date.now() - 3 * DAY);
  const paidAt =
    spec.paidAt ?? (payments.includes("paid") ? new Date(createdAt.getTime() + DAY) : null);
  const lines = (spec.lines ?? []).map((l) => ({ ...l, quantity: l.quantity ?? 1 }));
  const subtotal = lines.length
    ? lines.reduce((sum, l) => sum + 10_000 * l.quantity, 0)
    : (spec.amount ?? 30_000);
  const shippingCost = delivery === "pickup" ? 0 : 5_000;
  const total = subtotal + shippingCost;
  const shipped = status === "shipped" || status === "delivered";

  const order = await db.order.create({
    data: {
      idempotencyKey: `ln13-${randomUUID()}`,
      status,
      buyerName: spec.buyerName ?? "Camila Pérez",
      buyerRut: "12.345.678-5",
      buyerEmail: spec.buyerEmail ?? `camila-${randomUUID().slice(0, 8)}@correo.cl`,
      buyerPhone: "+56912345678",
      deliveryMethod: delivery,
      ...(delivery === "shipping"
        ? {
            shippingRegion: "RM",
            shippingCommune: "Ñuñoa",
            shippingStreet: "Av. Irarrázaval 1234",
            shippingLeadTime: "5 a 7 días hábiles",
          }
        : { pickupDetails: "Taller Total Kids, Temuco. Lunes a viernes de 10 a 18 h." }),
      taxDocument: spec.document ?? "boleta",
      ...(spec.document === "factura"
        ? {
            invoiceRut: "76.123.456-7",
            invoiceBusinessName: "Jardín Infantil Los Robles SpA",
            invoiceActivity: "Educación parvularia",
            invoiceEmail: "facturas@losrobles.cl",
            invoiceAddress: "Los Robles 55",
            invoiceCommune: "Temuco",
          }
        : {}),
      subtotal,
      shippingCost,
      total,
      ...(spec.couponId ? { couponId: spec.couponId, couponCode: "KIDS" } : {}),
      carrier: shipped && delivery === "shipping" ? "Starken" : null,
      trackingCode: shipped && delivery === "shipping" ? "STK-123" : null,
      termsAcceptedAt: createdAt,
      termsVersion: "v1",
      paymentDueAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
      paidAt,
      cancelledAt: status === "cancelled" ? new Date() : null,
      restockRecordedAt: spec.restockRecordedAt ?? null,
      ...(spec.invoiceFolio
        ? {
            invoiceFolio: spec.invoiceFolio,
            invoiceIssuedAt: new Date(),
            invoiceIssuedByLabel: "Administrador",
          }
        : {}),
      createdAt,
    },
  });

  const reservations = new Map<string, { quantity: number; status: ReservationStatus }>();
  for (const line of lines) {
    const extrasUnitPrice = (line.extras ?? []).reduce((s, e) => s + (e.unitPrice ?? 0), 0);
    await db.orderItem.create({
      data: {
        orderId: order.id,
        variantId: line.variantId ?? null,
        productName: "Cama nido",
        sku: `SKU-${randomUUID().slice(0, 6)}`,
        quantity: line.quantity,
        unitPrice: 10_000 - extrasUnitPrice,
        extrasUnitPrice,
        lineTotal: 10_000 * line.quantity,
        madeToOrder: line.madeToOrder ?? false,
        leadTime: line.madeToOrder ? "15 a 20 días hábiles" : null,
        extras: {
          create: (line.extras ?? []).map((e) => ({
            extraCode: e.code,
            extraName: e.name,
            unitPrice: e.unitPrice ?? null,
            text: e.text ?? null,
          })),
        },
      },
    });
    if (line.variantId && line.reservation && !line.madeToOrder) {
      const prev = reservations.get(line.variantId);
      reservations.set(line.variantId, {
        quantity: (prev?.quantity ?? 0) + line.quantity,
        status: line.reservation,
      });
    }
  }
  for (const [variantId, r] of reservations) {
    const open = r.status === "active" || r.status === "in_review";
    await db.stockReservation.create({
      data: {
        orderId: order.id,
        variantId,
        quantity: r.quantity,
        status: r.status,
        expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
        resolvedAt: open ? null : (paidAt ?? new Date()),
      },
    });
  }

  for (const [i, paymentStatus] of payments.entries()) {
    await db.payment.create({
      data: {
        orderId: order.id,
        attempt: i + 1,
        commerceOrder: `TK-${String(order.number)}-${String(i + 1)}-${randomUUID().slice(0, 6)}`,
        status: paymentStatus,
        amount: total,
        paidAt: paymentStatus === "paid" ? paidAt : null,
        createdAt: new Date(createdAt.getTime() + i * 1000),
      },
    });
  }

  if (spec.couponId) {
    await db.couponRedemption.create({
      data: { couponId: spec.couponId, orderId: order.id, discount: 0 },
    });
  }
  return order;
}

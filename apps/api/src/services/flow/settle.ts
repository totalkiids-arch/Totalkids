import type { Order, Payment, Prisma } from "../../generated/prisma/client.js";
import type { OrderStatus } from "../../generated/prisma/enums.js";
import { formatOrderNumber } from "../../domain/checkout.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { hashToken } from "../../lib/secrets.js";
import { lockOrder } from "../admin-orders/query.js";
import { consumeCouponUse } from "../coupons.js";
import { enqueueEmail } from "../email/enqueue.js";
import { emailEventKey } from "../email/events.js";
import { DEFAULT_PICKUP } from "../orders.js";
import type { FlowPaymentStatus } from "./client.js";
import { consumeReservations, releaseReservations, SYSTEM_ACTOR } from "./stock.js";
import { flowMismatches } from "./verify.js";

/**
 * Aplica al pedido un estado YA consultado a Flow con credenciales del backend
 * (LN-10; RF-16 a RF-19, RN-04, RN-05). Una transacción con el pedido bloqueado:
 * pago, pedido, stock, cupón, historial y correos se confirman juntos.
 * Idempotente: repetirlo no duplica nada y un pago confirmado nunca se degrada.
 */

type Tx = Prisma.TransactionClient;

export type SettleOutcome =
  "unknown" | "unchanged" | "confirmed" | "late_review" | "rejected" | "mismatch" | "double_charge";

export interface SettleResult {
  outcome: SettleOutcome;
  orderNumber: string | null;
}

/** Largo máximo de cada extra en el correo (EMAIL_DATA_SCHEMAS: text(120)). */
const EMAIL_EXTRA_MAX = 120;
/** VARCHAR(40) de payments.payment_method. */
const METHOD_MAX = 40;

const isOpen = (p: Pick<Payment, "status">) => p.status === "pending" || p.status === "in_review";

export type ReviewReason = "mismatch" | "late_review" | "double_charge" | "uncertain";

/**
 * Deja el caso en la auditoría y avisa al equipo por correo (RN-04, RN-05). Una
 * sola vez por intento y causa; devuelve false si ya estaba registrado.
 */
export async function flagForReview(
  tx: Tx,
  order: Pick<Order, "id" | "number">,
  input: {
    reason: ReviewReason;
    paymentId: string;
    adminEmail: string;
    details?: Prisma.InputJsonObject;
  },
): Promise<boolean> {
  const { reason, paymentId } = input;
  const action = `payment.${reason}`;
  if (await wasAudited(tx, order.id, action, paymentId)) return false;
  await tx.auditLog.create({
    data: {
      actorLabel: SYSTEM_ACTOR,
      action,
      resourceType: "order",
      resourceId: order.id,
      details: { paymentId, number: order.number, ...input.details },
    },
  });
  await enqueueEmail(tx, {
    event: "payment_review",
    recipient: input.adminEmail,
    eventKey: emailEventKey("payment_review", paymentId, reason),
    orderId: order.id,
    data: { orderNumber: order.number, reason },
  });
  return true;
}

/** Un callback repetido no duplica la auditoría del mismo intento. */
async function wasAudited(tx: Tx, orderId: string, action: string, paymentId: string) {
  const count = await tx.auditLog.count({
    where: { action, resourceId: orderId, details: { path: ["paymentId"], equals: paymentId } },
  });
  return count > 0;
}

export async function moveOrder(
  tx: Tx,
  order: Order,
  to: OrderStatus,
  reason: string,
  paidAt?: Date,
) {
  await tx.order.update({
    where: { id: order.id },
    data: { status: to, ...(paidAt && !order.paidAt ? { paidAt } : {}) },
  });
  if (order.status === to) return;
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      actorLabel: SYSTEM_ACTOR,
      reason,
    },
  });
}

export async function settlePayment(
  prisma: Pick<PrismaClient, "$transaction" | "payment">,
  input: {
    status: FlowPaymentStatus;
    token?: string;
    /** Intento consultado, si quien llama ya lo conoce (conciliación). */
    paymentId?: string;
    adminEmail: string;
    now?: Date;
  },
): Promise<SettleResult> {
  const { status, adminEmail } = input;
  const now = input.now ?? new Date();
  // Por id o token; si el callback llegó antes de guardarlo, por commerceOrder.
  const found =
    (input.paymentId
      ? await prisma.payment.findUnique({ where: { id: input.paymentId } })
      : null) ??
    (input.token
      ? await prisma.payment.findUnique({ where: { tokenHash: hashToken(input.token) } })
      : null) ??
    (await prisma.payment.findUnique({ where: { commerceOrder: status.commerceOrder } }));
  if (!found) return { outcome: "unknown", orderNumber: null };

  return prisma.$transaction(
    async (tx) => {
      await lockOrder(tx, { id: found.orderId });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: found.id } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: found.orderId } });
      const orderNumber = formatOrderNumber(order.number);
      const done = (outcome: SettleOutcome): SettleResult => ({ outcome, orderNumber });

      // RF-19: un evento repetido o atrasado no degrada un pago confirmado.
      if (payment.status === "paid") return done("unchanged");

      const update = (data: Prisma.PaymentUpdateInput) =>
        tx.payment.update({
          where: { id: payment.id },
          data: {
            lastCheckedAt: now,
            paymentMethod: status.media?.slice(0, METHOD_MAX) ?? null,
            providerResponse: { ...status },
            ...data,
          },
        });

      const mismatches = flowMismatches(
        {
          commerceOrder: payment.commerceOrder,
          flowOrder: payment.flowOrder === null ? null : Number(payment.flowOrder),
          amount: payment.amount,
          currency: payment.currency,
        },
        status,
      );
      if (mismatches.length > 0) {
        // Se registra para revisión sin confirmar el pedido (RF-16, A4).
        await update(isOpen(payment) ? { status: "in_review" } : {});
        const flagged = await flagForReview(tx, order, {
          reason: "mismatch",
          paymentId: payment.id,
          adminEmail,
          details: { mismatches },
        });
        if (flagged && order.status === "pending_payment" && isOpen(payment)) {
          await tx.stockReservation.updateMany({
            where: { orderId: order.id, status: "active" },
            data: { status: "in_review" },
          });
          await moveOrder(tx, order, "in_review", "Los datos del pago no coinciden con Flow");
        }
        return done("mismatch");
      }

      if (status.status === "pending") {
        await update({});
        return done("unchanged");
      }

      if (status.status === "rejected" || status.status === "voided") {
        if (!isOpen(payment)) {
          await update({});
          return done("unchanged");
        }
        await update({ status: status.status });
        if (order.status === "pending_payment") {
          await releaseReservations(tx, order.id, `Pago no completado de ${orderNumber}`, now);
          await enqueueEmail(tx, {
            event: "payment_rejected",
            recipient: order.buyerEmail,
            eventKey: emailEventKey("payment_rejected", payment.id),
            orderId: order.id,
            data: {
              orderNumber: order.number,
              buyerName: order.buyerName,
              outcome: status.status === "voided" ? "cancelled" : "rejected",
            },
          });
        }
        return done("rejected");
      }

      // Pagado y verificado.
      const alreadyPaid = await tx.payment.count({ where: { orderId: order.id, status: "paid" } });
      if (alreadyPaid > 0) {
        // Doble cobro: a revisión, sin segunda entrega (SRS 4.4.1).
        await update(isOpen(payment) ? { status: "in_review" } : {});
        await flagForReview(tx, order, {
          reason: "double_charge",
          paymentId: payment.id,
          adminEmail,
        });
        return done("double_charge");
      }

      await update({ status: "paid", paidAt: now });
      const confirmable =
        order.status === "pending_payment" ||
        order.status === "in_review" ||
        order.status === "expired";
      const sold =
        confirmable &&
        (await consumeReservations(tx, order.id, `Venta del pedido ${orderNumber}`, now));
      if (!sold) {
        // RN-05: pago tardío sin stock, o sobre un pedido cancelado.
        await moveOrder(tx, order, "in_review", "Pago recibido sin poder confirmar el pedido", now);
        await flagForReview(tx, order, {
          reason: "late_review",
          paymentId: payment.id,
          adminEmail,
          details: { from: order.status },
        });
        return done("late_review");
      }
      await consumeCouponUse(tx, order.id);
      await moveOrder(tx, order, "confirmed", "Pago confirmado por Flow", now);
      await enqueueSaleEmails(tx, order, adminEmail);
      return done("confirmed");
    },
    { timeout: 15_000 },
  );
}

async function enqueueSaleEmails(tx: Tx, order: Order, adminEmail: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    include: { extras: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  await enqueueEmail(tx, {
    event: "purchase_confirmed",
    recipient: order.buyerEmail,
    eventKey: emailEventKey("purchase_confirmed", order.id),
    orderId: order.id,
    data: {
      orderNumber: order.number,
      buyerName: order.buyerName,
      items: items.map((i) => ({
        name: i.productName,
        variant: i.optionLabel,
        quantity: i.quantity,
        unitPrice: i.unitPrice + i.extrasUnitPrice,
        lineTotal: i.lineTotal,
        extras: i.extras.map((e) =>
          (e.text ? `${e.extraName}: ${e.text}` : e.extraName).slice(0, EMAIL_EXTRA_MAX),
        ),
        madeToOrder: i.madeToOrder,
        leadTime: i.leadTime,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      shippingCost: order.shippingCost,
      total: order.total,
      delivery:
        order.deliveryMethod === "pickup"
          ? {
              method: "pickup",
              pickupDetails: order.pickupDetails ?? DEFAULT_PICKUP,
              leadTime: order.shippingLeadTime,
            }
          : {
              method: "shipping",
              address: [order.shippingStreet, order.shippingUnit, order.shippingCommune]
                .filter(Boolean)
                .join(", "),
              leadTime: order.shippingLeadTime,
            },
      taxDocument: order.taxDocument,
    },
  });
  await enqueueEmail(tx, {
    event: "new_sale",
    recipient: adminEmail,
    eventKey: emailEventKey("new_sale", order.id),
    orderId: order.id,
    data: {
      orderNumber: order.number,
      total: order.total,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      deliveryMethod: order.deliveryMethod,
      taxDocument: order.taxDocument,
    },
  });
}

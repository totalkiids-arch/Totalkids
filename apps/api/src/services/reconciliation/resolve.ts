import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { releaseOrderReservations } from "../admin-orders/inventory.js";
import { lockOrder } from "../admin-orders/query.js";
import { MESSAGES, orderRef, REASON_MAX, REASON_MIN } from "../admin-orders/rules.js";
import { writeAudit, type Actor } from "../audit.js";
import { consumeCouponUse, releaseCouponUse } from "../coupons.js";
import { enqueueSaleEmails } from "../flow/settle.js";
import { consumeReservations } from "../flow/stock.js";
import { expireOrder } from "./expire.js";
import {
  availableResolutions,
  flowSaidPaid,
  RESOLUTION_MESSAGES,
  RESOLUTIONS,
  type Resolution,
} from "./rules.js";

/**
 * Resolución manual de un pago en revisión (LN-15; RF-33, RN-05, RN-06). Solo
 * el Administrador. Una transacción con el pedido bloqueado y auditoría
 * `payment.resolved` con el motivo:
 *
 * - `release`: Flow no cobró (revisado por el equipo). El intento queda
 *   anulado y el pedido vence, liberando reservas y cupón.
 * - `refund_pending`: hubo cobro que no se puede aplicar. Un doble cobro o una
 *   discrepancia queda `refund_pending`; un pago tardío sin stock sigue
 *   `paid` (la devolución se registra con RF-32). El pedido se cancela si no
 *   hay otro cobro que lo confirme.
 * - `confirm`: pago tardío y ahora hay stock: se descuenta, se consume el
 *   cupón, se confirma y se encolan los correos de la venta.
 */

export const resolvePaymentBody = z.object({
  action: z.enum(RESOLUTIONS, "Elige cómo resolver el pago."),
  reason: z
    .string(MESSAGES.reasonShort)
    .trim()
    .min(REASON_MIN, MESSAGES.reasonShort)
    .max(REASON_MAX, MESSAGES.reasonLong),
});
export type ResolvePaymentBody = z.output<typeof resolvePaymentBody>;

type Tx = Prisma.TransactionClient;

const conflict = (message: string) => errors.conflict(message, { field: "action" });

async function cancelUnpaid(
  tx: Tx,
  order: { id: string; number: number; status: string },
  actor: Actor,
  reason: string,
  now: Date,
) {
  const released = await releaseOrderReservations(
    tx,
    order.id,
    actor,
    `Pedido ${orderRef(order.number)} cancelado: ${reason}`.slice(0, 500),
    now,
  );
  const couponReleased = await releaseCouponUse(tx, order.id);
  await tx.order.update({
    where: { id: order.id },
    data: { status: "cancelled", cancelledAt: now },
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status as "in_review",
      toStatus: "cancelled",
      ...actor,
      reason,
      createdAt: now,
    },
  });
  return { released: released.map(({ sku, quantity }) => ({ sku, quantity })), couponReleased };
}

export async function resolvePayment(
  prisma: Pick<PrismaClient, "$transaction" | "payment">,
  paymentId: string,
  input: ResolvePaymentBody,
  ctx: { actor: Actor; adminEmail: string; requestId?: string; now?: Date },
): Promise<{ orderId: string; resolution: Resolution }> {
  const now = ctx.now ?? new Date();
  const found = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!found) throw errors.notFound("Pago no encontrado");

  return prisma.$transaction(
    async (tx) => {
      await lockOrder(tx, { id: found.orderId });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { payments: { select: { id: true, status: true } } },
      });
      const flowSaysPaid = flowSaidPaid(payment.providerResponse);
      const allowed = availableResolutions({
        paymentStatus: payment.status,
        flowSaysPaid,
        orderStatus: order.status,
      });
      if (!allowed.includes(input.action)) {
        throw conflict(
          input.action === "release" && flowSaysPaid
            ? RESOLUTION_MESSAGES.releasePaid
            : RESOLUTION_MESSAGES.notAllowed,
        );
      }
      const otherPaid = order.payments.some((p) => p.id !== payment.id && p.status === "paid");
      const details: Prisma.InputJsonObject = {
        number: order.number,
        paymentId: payment.id,
        resolution: input.action,
        from: { payment: payment.status, order: order.status },
      };
      let effects: Prisma.InputJsonObject = {};

      if (input.action === "release") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "voided", nextCheckAt: null },
        });
        if (!otherPaid) {
          const expired = await expireOrder(tx, order.id, {
            now,
            reason: `Pago liberado por el equipo: ${input.reason}`,
            actor: ctx.actor,
            ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
          });
          effects = { orderExpired: expired };
        }
      }

      if (input.action === "refund_pending") {
        if (payment.status === "in_review") {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "refund_pending", nextCheckAt: null },
          });
        }
        const pending = order.status === "pending_payment" || order.status === "in_review";
        // El pago tardío (RN-05) es el cobro del pedido, pero no se pudo entregar.
        const lateOwnCharge = payment.status === "paid";
        if (pending && (!otherPaid || lateOwnCharge)) {
          effects = {
            orderCancelled: true,
            ...(await cancelUnpaid(tx, order, ctx.actor, input.reason, now)),
            ...(lateOwnCharge ? { notice: MESSAGES.cancelPaidNotice } : {}),
          };
        }
      }

      if (input.action === "confirm") {
        const sold = await consumeReservations(
          tx,
          order.id,
          `Venta del pedido ${orderRef(order.number)} (resolución manual)`,
          now,
          ctx.actor,
        );
        if (!sold) throw conflict(RESOLUTION_MESSAGES.noStock);
        await consumeCouponUse(tx, order.id);
        const confirmed = await tx.order.update({
          where: { id: order.id },
          data: { status: "confirmed", ...(order.paidAt ? {} : { paidAt: payment.paidAt ?? now }) },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "confirmed",
            ...ctx.actor,
            reason: input.reason,
            createdAt: now,
          },
        });
        await enqueueSaleEmails(tx, confirmed, ctx.adminEmail);
        effects = { orderConfirmed: true };
      }

      await writeAudit(
        tx,
        ctx.actor,
        {
          action: "payment.resolved",
          resourceType: "order",
          resourceId: order.id,
          details: { ...details, ...effects },
          reason: input.reason,
        },
        ctx.requestId,
      );
      return { orderId: order.id, resolution: input.action };
    },
    { timeout: 15_000 },
  );
}

import type { Prisma } from "../../generated/prisma/client.js";
import { releaseOrderReservations, type MovementActor } from "../admin-orders/inventory.js";
import { orderRef } from "../admin-orders/rules.js";
import { releaseCouponUse } from "../coupons.js";
import { SYSTEM_ACTOR } from "../flow/stock.js";
import { isOpenPayment, isPastDue } from "./rules.js";

/**
 * Vencimiento seguro de un pedido sin pagar (LN-15; RF-18, RN-04). El llamador
 * ya bloqueó la fila del pedido en su transacción. Vuelve a comprobar todo con
 * el pedido bloqueado, así que es idempotente y seguro con varios workers: si
 * otro ya lo venció, si se pagó o si un intento sigue abierto, no hace nada.
 *
 * Libera las reservas (activas o en revisión) y el uso del cupón, deja el
 * pedido «Vencido» con historial y auditoría. `in_review → expired` es una
 * transición del sistema (fuera de la tabla del panel): solo ocurre cuando Flow
 * confirmó que no hubo cobro o el Administrador lo resolvió con motivo.
 */

type Tx = Prisma.TransactionClient;

export const SYSTEM: MovementActor = { actorUserId: null, actorLabel: SYSTEM_ACTOR };

export async function expireOrder(
  tx: Tx,
  orderId: string,
  input: { now: Date; reason: string; actor?: MovementActor; requestId?: string },
): Promise<boolean> {
  const { now, reason } = input;
  const actor = input.actor ?? SYSTEM;
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { select: { status: true } } },
  });
  if (order.status !== "pending_payment" && order.status !== "in_review") return false;
  // Con el plazo vigente, un pedido pendiente aún se puede pagar.
  if (order.status === "pending_payment" && !isPastDue(order.paymentDueAt, now)) return false;
  // RN-04: nunca con un cobro confirmado ni con un intento que Flow podría cobrar.
  if (order.payments.some((p) => p.status === "paid" || isOpenPayment(p.status))) return false;

  const visible = orderRef(order.number);
  const released = await releaseOrderReservations(
    tx,
    order.id,
    actor,
    `Pedido ${visible} vencido: ${reason}`.slice(0, 500),
    now,
  );
  const couponReleased = await releaseCouponUse(tx, order.id);
  await tx.order.update({ where: { id: order.id }, data: { status: "expired" } });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "expired",
      actorUserId: actor.actorUserId,
      actorLabel: actor.actorLabel,
      reason: reason.slice(0, 500),
      createdAt: now,
    },
  });
  await tx.auditLog.create({
    data: {
      actorUserId: actor.actorUserId,
      actorLabel: actor.actorLabel,
      action: "order.expired",
      resourceType: "order",
      resourceId: order.id,
      details: {
        number: order.number,
        from: order.status,
        releasedReservations: released.map(({ sku, quantity }) => ({ sku, quantity })),
        couponReleased,
      },
      reason: reason.slice(0, 500),
      requestId: input.requestId ?? null,
    },
  });
  return true;
}

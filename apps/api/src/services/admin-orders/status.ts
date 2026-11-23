import type { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { Issues } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import { releaseCouponUse } from "../coupons.js";
import { enqueueEmail } from "../email/enqueue.js";
import { emailEventKey } from "../email/events.js";
import { releaseOrderReservations, restockOrder, type MovedUnits } from "./inventory.js";
import { getAdminOrder, lockOrder, workflowOf, type AdminOrderDetail } from "./query.js";
import {
  canRecordRestock,
  MESSAGES,
  needsTracking,
  ORDER_STATUS_LABEL,
  orderRef,
  paidPayment,
  TRACKING_MAX,
  transitionBlock,
} from "./rules.js";
import type { OrderRef, StatusChangeInput } from "./schemas.js";

/**
 * Cambio de estado del pedido desde el panel (LN-13; RF-27, RF-34; RN-04 a
 * RN-06). Todo ocurre en una transacción con la fila del pedido bloqueada:
 * historial con actor y motivo, auditoría, inventario, cupón y correos se
 * confirman juntos o no se confirma nada.
 */

const MOVEMENT_REASON_MAX = 500;

function movementReason(prefix: string, reason: string): string {
  return `${prefix}: ${reason}`.slice(0, MOVEMENT_REASON_MAX);
}

const units = (moved: MovedUnits[]) => moved.map(({ sku, quantity }) => ({ sku, quantity }));

export async function changeOrderStatus(
  prisma: Pick<PrismaClient, "$transaction" | "order" | "auditLog">,
  ref: OrderRef,
  input: StatusChangeInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminOrderDetail> {
  const orderId = await prisma.$transaction(async (tx) => {
    const id = await lockOrder(tx, ref);
    const order = await tx.order.findUniqueOrThrow({
      where: { id },
      include: {
        payments: true,
        reservations: { select: { status: true } },
        redemption: { select: { status: true } },
      },
    });
    const flow = workflowOf(order);
    const from = order.status;
    const to = input.to;

    // 1. Transición y pago (409: el estado del pedido no lo permite).
    const block = transitionBlock(flow, to);
    if (block) throw errors.conflict(block.message, { field: block.field });

    // 2. Despacho a domicilio: transportista y código (422 por campo). En retiro
    //    en taller, "Despachado" es "listo para retiro" y no los lleva.
    const tracking = needsTracking(order, to);
    const carrier = tracking ? (input.carrier ?? "") : "";
    const code = tracking ? (input.code ?? "") : "";
    if (tracking) {
      const issues = new Issues();
      if (!carrier) issues.add("carrier", MESSAGES.carrierMissing);
      else if (carrier.length > TRACKING_MAX) issues.add("carrier", MESSAGES.carrierLong);
      if (!code) issues.add("code", MESSAGES.codeMissing);
      else if (code.length > TRACKING_MAX) issues.add("code", MESSAGES.codeLong);
      issues.throwIfAny();
    }

    // 3. Reposición: solo al cancelar un pedido pagado, una sola vez (RN-06).
    if (input.restock && !canRecordRestock(flow, to)) {
      throw errors.conflict(
        order.restockRecordedAt ? MESSAGES.restockDone : MESSAGES.restockNotAllowed,
        { field: "restock" },
      );
    }

    const now = new Date();
    const paid = paidPayment(flow);
    const visible = orderRef(order.number);
    const closing = to === "cancelled" || to === "expired";
    const data: Prisma.OrderUpdateInput = { status: to };
    if (tracking) Object.assign(data, { carrier, trackingCode: code });
    if (to === "cancelled") data.cancelledAt = now;
    if (to === "confirmed" && !order.paidAt) data.paidAt = paid?.paidAt ?? now;

    // 4. Inventario y cupón. Lo reservado y no vendido vuelve a estar disponible.
    let released: MovedUnits[] = [];
    let couponReleased = false;
    if (closing) {
      released = await releaseOrderReservations(
        tx,
        id,
        actor,
        movementReason(`Pedido ${visible} ${ORDER_STATUS_LABEL[to].toLowerCase()}`, input.reason),
        now,
      );
      // Sin venta, el uso de cupón reservado se devuelve. Uno consumido (pagado) no.
      if (!paid) couponReleased = await releaseCouponUse(tx, id);
    }
    let restocked: MovedUnits[] | null = null;
    if (input.restock) {
      restocked = await restockOrder(
        tx,
        id,
        actor,
        movementReason(`Reposición del pedido ${visible} cancelado`, input.reason),
      );
      data.restockRecordedAt = now;
    }

    await tx.order.update({ where: { id }, data });

    // 5. Historial (RF-27, RF-34) y auditoría.
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: from,
        toStatus: to,
        actorUserId: actor.actorUserId,
        actorLabel: actor.actorLabel,
        reason: input.reason,
        createdAt: now,
      },
    });
    const details: Prisma.InputJsonObject = {
      number: order.number,
      from,
      to,
      ...(tracking ? { carrier, trackingCode: code } : {}),
      ...(released.length ? { releasedReservations: units(released) } : {}),
      ...(couponReleased ? { couponReleased: true } : {}),
      ...(to === "cancelled" && paid ? { notice: MESSAGES.cancelPaidNotice } : {}),
    };
    await writeAudit(
      tx,
      actor,
      {
        action: "order.status_changed",
        resourceType: "order",
        resourceId: id,
        details,
        reason: input.reason,
      },
      requestId,
    );
    if (restocked) {
      await writeAudit(
        tx,
        actor,
        {
          action: "order.restock_recorded",
          resourceType: "order",
          resourceId: id,
          details: {
            number: order.number,
            units: units(restocked),
            movementIds: restocked.map((m) => m.movementId),
            // Todo era a pedido: no había stock descontado que reponer.
            ...(restocked.length === 0 ? { note: "Sin unidades con stock que reponer" } : {}),
          },
          reason: input.reason,
        },
        requestId,
      );
    }

    // 6. Correos al comprador, en la misma transacción y sin duplicar (clave única).
    if (to === "shipped") {
      await enqueueEmail(tx, {
        event: "order_shipped",
        recipient: order.buyerEmail,
        eventKey: emailEventKey("order_shipped", id),
        orderId: id,
        data:
          order.deliveryMethod === "pickup"
            ? {
                method: "pickup",
                orderNumber: order.number,
                buyerName: order.buyerName,
                pickupDetails: order.pickupDetails ?? "",
              }
            : {
                method: "shipping",
                orderNumber: order.number,
                buyerName: order.buyerName,
                carrier,
                trackingCode: code,
              },
      });
    }
    if (to === "delivered") {
      await enqueueEmail(tx, {
        event: "order_delivered",
        recipient: order.buyerEmail,
        eventKey: emailEventKey("order_delivered", id),
        orderId: id,
        data: { orderNumber: order.number, buyerName: order.buyerName },
      });
    }
    return id;
  });
  return getAdminOrder(prisma, { id: orderId });
}

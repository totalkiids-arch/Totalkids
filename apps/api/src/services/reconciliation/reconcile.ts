import type { Payment, Prisma } from "../../generated/prisma/client.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { lockOrder } from "../admin-orders/query.js";
import {
  FlowRejectedError,
  FlowUncertainError,
  type FlowClient,
  type FlowPaymentStatus,
  type FlowStatus,
} from "../flow/client.js";
import { settlePayment, type SettleOutcome } from "../flow/settle.js";
import { SYSTEM_ACTOR } from "../flow/stock.js";
import type { ReviewAlertReason } from "../email/events.js";
import { enqueueReviewAlert, REVIEW_AUDIT_ACTION } from "./alerts.js";
import { expireOrder } from "./expire.js";
import {
  decideAfterFlow,
  decideUncertain,
  isOpenPayment,
  nextCheckDelay,
  RECONCILE_DELAYS_MS,
} from "./rules.js";

/**
 * Conciliación de un intento de pago con Flow (LN-15; RF-33, RN-04 a RN-06,
 * UC-03 paso 8). La usan el job del worker y «Consultar en Flow» del panel.
 *
 * 1. Consulta a Flow FUERA de toda transacción, siempre por `commerceOrder`:
 *    solo se guarda el hash del token, y así también se concilia una creación
 *    incierta (start.ts) que no alcanzó a recibirlo.
 * 2. Si Flow responde, el estado lo asienta `settlePayment` (LN-10, sin
 *    cambios), y luego, con el pedido bloqueado, se decide si vence.
 * 3. Si no se sabe (red, 5xx, respuesta ilegible o CUALQUIER 4xx), nunca se
 *    asume un rechazo: se suma un intento (el único lugar donde se suma
 *    `reconcile_attempts`) y, si el plazo venció o se agotaron los intentos, el
 *    pago y el pedido quedan en revisión con alerta (RN-04).
 *
 * Flow no documenta un código para "orden no encontrada" en getStatus ni en
 * getStatusByCommerceId (solo «400 error del Api» y «401 error interno de
 * negocio»): por eso un 4xx se trata como incierto y jamás anula ni vence.
 */

export interface ReconcileDeps {
  prisma: PrismaClient;
  /** null: Flow sin configurar; toda consulta es incierta. */
  flow: FlowClient | null;
  adminEmail: string;
  logger?: Logger;
}

export type ReconcileOutcome =
  | SettleOutcome
  /** El intento ya no estaba pendiente ni en revisión: nada que consultar. */
  | "not_open"
  /** Sigue pendiente en Flow dentro del plazo: se vuelve a consultar. */
  | "waiting"
  /** Flow confirmó que no hubo cobro y el pedido venció. */
  | "expired"
  /** Sin respuesta segura de Flow: se reintentará. */
  | "uncertain"
  /** Sin respuesta segura y el pago quedó en revisión con alerta. */
  | "in_review";

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  /** Estado que informó Flow, o null si la consulta fue incierta. */
  flowStatus: FlowStatus | null;
}

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 15_000 };

async function queryFlow(
  flow: FlowClient | null,
  payment: Pick<Payment, "commerceOrder">,
): Promise<FlowPaymentStatus | null> {
  if (!flow) return null;
  try {
    return await flow.getStatusByCommerceOrder(payment.commerceOrder);
  } catch (error) {
    if (error instanceof FlowUncertainError || error instanceof FlowRejectedError) return null;
    throw error;
  }
}

export async function reconcilePayment(
  deps: ReconcileDeps,
  paymentId: string,
  options: { now?: Date } = {},
): Promise<ReconcileResult> {
  const now = options.now ?? new Date();
  const payment = await deps.prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !isOpenPayment(payment.status)) return { outcome: "not_open", flowStatus: null };

  const status = await queryFlow(deps.flow, payment);
  if (!status) return markUncertain(deps, payment, now);
  // Flow respondió por otro intento: no se asienta nada a ciegas (A4).
  if (status.commerceOrder !== payment.commerceOrder) {
    return markUncertain(deps, payment, now, "mismatch");
  }

  const settled = await settlePayment(deps.prisma, {
    status,
    adminEmail: deps.adminEmail,
    now,
  });

  const outcome = await deps.prisma.$transaction(async (tx) => {
    await lockOrder(tx, { id: payment.orderId });
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    const decision = decideAfterFlow({
      flowStatus: status.status,
      orderStatus: order.status,
      paymentDueAt: order.paymentDueAt,
      now,
    });

    let result: ReconcileOutcome = settled.outcome;
    // Flow ya no lo puede cobrar: el intento vence (si settle no lo dejó en revisión).
    if (
      decision === "expire_payment" &&
      settled.outcome === "unchanged" &&
      isOpenPayment(current.status)
    ) {
      await tx.payment.update({ where: { id: current.id }, data: { status: "expired" } });
      result = "unchanged";
    }
    if (decision === "expire" || decision === "expire_payment") {
      const reason =
        decision === "expire"
          ? "Flow confirmó que el pago no se completó"
          : "Plazo de pago vencido sin cobro en Flow";
      if (await expireOrder(tx, order.id, { now, reason })) result = "expired";
    }
    if (decision === "wait" && settled.outcome === "unchanged") result = "waiting";

    // Flow respondió: se reinician los intentos inciertos y se agenda lo que siga.
    const after = await tx.payment.findUniqueOrThrow({ where: { id: current.id } });
    await tx.payment.update({
      where: { id: current.id },
      data: {
        reconcileAttempts: 0,
        lastCheckedAt: now,
        // Pendiente dentro del plazo: pronto. En revisión (p. ej. discrepancia): cada hora.
        nextCheckAt: isOpenPayment(after.status)
          ? new Date(now.getTime() + (decision === "wait" ? firstDelay() : maxDelay()))
          : null,
      },
    });
    return result;
  }, TX_OPTIONS);

  return { outcome, flowStatus: status.status };
}

const firstDelay = () => RECONCILE_DELAYS_MS[0] ?? 120_000;
const maxDelay = () => RECONCILE_DELAYS_MS[RECONCILE_DELAYS_MS.length - 1] ?? 3_600_000;

/** Ya se auditó este motivo para este intento (no se repite la auditoría). */
async function wasAudited(tx: Tx, orderId: string, action: string, paymentId: string) {
  const count = await tx.auditLog.count({
    where: { action, resourceId: orderId, details: { path: ["paymentId"], equals: paymentId } },
  });
  return count > 0;
}

/**
 * Consulta incierta: suma un intento y agenda la próxima con backoff. Si
 * corresponde (plazo vencido o intentos agotados), el pago, sus reservas y el
 * pedido pendiente pasan a revisión, se audita y se alerta una sola vez.
 */
async function markUncertain(
  deps: ReconcileDeps,
  payment: Payment,
  now: Date,
  forcedReason?: ReviewAlertReason,
): Promise<ReconcileResult> {
  const outcome = await deps.prisma.$transaction(async (tx) => {
    await lockOrder(tx, { id: payment.orderId });
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (!isOpenPayment(current.status)) return "not_open" as const;
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

    const attempts = current.reconcileAttempts + 1;
    const decision = forcedReason
      ? "review"
      : decideUncertain({
          attempts,
          orderStatus: order.status,
          paymentDueAt: order.paymentDueAt,
          now,
        });
    await tx.payment.update({
      where: { id: current.id },
      data: {
        reconcileAttempts: attempts,
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + nextCheckDelay(attempts)),
        ...(decision === "review" ? { status: "in_review" } : {}),
      },
    });
    if (decision === "wait") return "uncertain" as const;

    const reason: ReviewAlertReason = forcedReason ?? "flow_unreachable";
    // RN-04: la reserva queda en revisión; no se asume rechazo ni se vence.
    if (order.status === "pending_payment") {
      await tx.stockReservation.updateMany({
        where: { orderId: order.id, status: "active" },
        data: { status: "in_review" },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: "in_review" } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "in_review",
          actorLabel: SYSTEM_ACTOR,
          reason:
            reason === "mismatch"
              ? "Flow respondió con datos de otro intento"
              : "Flow no confirmó el estado del pago",
          createdAt: now,
        },
      });
    }
    const action = REVIEW_AUDIT_ACTION[reason];
    if (!(await wasAudited(tx, order.id, action, current.id))) {
      await tx.auditLog.create({
        data: {
          actorLabel: SYSTEM_ACTOR,
          action,
          resourceType: "order",
          resourceId: order.id,
          details: { paymentId: current.id, attempts },
        },
      });
    }
    await enqueueReviewAlert(tx, {
      reason,
      adminEmail: deps.adminEmail,
      order,
      payment: current,
    });
    return "in_review" as const;
  }, TX_OPTIONS);

  if (outcome === "in_review") {
    deps.logger?.error(
      { paymentId: payment.id, orderId: payment.orderId },
      "Pago en revisión: Flow no confirmó su estado",
    );
  }
  return { outcome, flowStatus: null };
}

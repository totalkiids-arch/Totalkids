import type { Prisma } from "../../generated/prisma/client.js";
import { formatOrderNumber } from "../../domain/checkout.js";
import { errors } from "../../lib/errors.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { lockOrder } from "../admin-orders/query.js";
import { writeAudit, type Actor } from "../audit.js";
import { releaseCouponUse } from "../coupons.js";
import { queryAttempt } from "./attempt.js";
import { FlowRejectedError, FlowUncertainError } from "./client.js";
import { flagForReview, moveOrder, settlePayment, type SettleOutcome } from "./settle.js";
import type { FlowGateway } from "./start.js";
import { releaseReservations, SYSTEM_ACTOR } from "./stock.js";

/**
 * Conciliación y vencimientos (LN-15; RF-18, RF-33; RN-04 a RN-06). La corre el
 * worker cada 2 minutos (D-02) y el panel puede pedirla para un intento. Todo es
 * idempotente y bloquea el pedido: puede haber varias instancias del worker.
 */

type Tx = Prisma.TransactionClient;

type Gateway = Pick<FlowGateway, "client" | "sealSecret">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RECONCILE_INTERVAL_MS = 2 * MINUTE;
/** Un intento más nuevo puede estar creándose todavía en Flow. */
const MIN_AGE_MS = MINUTE;
/** Margen tras el plazo antes de vencer un intento: puede estar pagándose al filo. */
export const EXPIRY_GRACE_MS = 5 * MINUTE;
/** Pasado este tiempo, lo que sigue sin resolverse se consulta solo cada hora. */
const SLOW_AFTER_MS = 24 * HOUR;
/** Un intento ya vencido se vuelve a consultar cada 30 min durante 24 h (pago tardío). */
const LATE_CHECK_MS = 30 * MINUTE;
const BATCH = 50;

export type ReconcileOutcome =
  | Exclude<SettleOutcome, "unknown">
  /** Flow no respondió o no se puede descartar un cobro: no se asume rechazo. */
  | "uncertain"
  /** Seguía pendiente en Flow y terminó el plazo: intento y pedido vencidos. */
  | "expired"
  /** Nunca se llegó a crear en Flow: intento anulado. */
  | "not_found";

const isOpen = (status: string) => status === "pending" || status === "in_review";

/** Consulta un intento a Flow y aplica el resultado. */
export async function reconcilePayment(
  prisma: PrismaClient,
  flow: Gateway,
  paymentId: string,
  options: { adminEmail: string; now?: Date },
): Promise<ReconcileOutcome> {
  const { adminEmail } = options;
  const now = options.now ?? new Date();
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { order: { select: { paymentDueAt: true } } },
  });
  const due = payment.order.paymentDueAt.getTime();
  const overdue = due <= now.getTime();
  const pastGrace = due + EXPIRY_GRACE_MS <= now.getTime();

  let answer;
  try {
    answer = await queryAttempt(flow, payment);
  } catch (error) {
    if (!(error instanceof FlowRejectedError) && !(error instanceof FlowUncertainError)) {
      throw error;
    }
    // Sin token nadie recibió una URL para pagar; si además venció el plazo y Flow
    // no conoce la orden, se descarta el cobro. Un 401 o 403 no prueba nada.
    const unknownToFlow =
      error instanceof FlowRejectedError && (error.httpStatus === 400 || error.httpStatus === 404);
    if (unknownToFlow && pastGrace && !payment.tokenHash && isOpen(payment.status)) {
      return discard(prisma, payment, now);
    }
    return markUncertain(prisma, payment, { overdue, adminEmail, now });
  }

  const { outcome } = await settlePayment(prisma, {
    ...answer,
    // Es este intento aunque Flow informe otro número: así se detecta la diferencia.
    paymentId: payment.id,
    adminEmail,
    now,
  });
  if (outcome === "unchanged" && answer.status.status === "pending" && pastGrace) {
    return expireAttempt(prisma, payment, now);
  }
  return outcome === "unknown" ? "unchanged" : outcome;
}

interface Target {
  id: string;
  orderId: string;
}

/** Bloquea el pedido y relee el intento; null si ya no está abierto. */
async function lockOpen(tx: Tx, target: Target) {
  await lockOrder(tx, { id: target.orderId });
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: target.id } });
  if (!isOpen(payment.status)) return null;
  const order = await tx.order.findUniqueOrThrow({ where: { id: target.orderId } });
  return { payment, order };
}

async function discard(prisma: PrismaClient, target: Target, now: Date): Promise<ReconcileOutcome> {
  return prisma.$transaction(async (tx): Promise<ReconcileOutcome> => {
    const locked = await lockOpen(tx, target);
    if (!locked || locked.payment.tokenHash) return "unchanged";
    await tx.payment.update({
      where: { id: target.id },
      data: { status: "voided", lastCheckedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorLabel: SYSTEM_ACTOR,
        action: "payment.not_found",
        resourceType: "order",
        resourceId: target.orderId,
        details: { paymentId: target.id, number: locked.order.number },
      },
    });
    return "not_found";
  });
}

/** RN-04: con riesgo de cobro, la reserva queda en revisión y se avisa; no se libera. */
async function markUncertain(
  prisma: PrismaClient,
  target: Target,
  options: { overdue: boolean; adminEmail: string; now: Date },
): Promise<ReconcileOutcome> {
  return prisma.$transaction(async (tx): Promise<ReconcileOutcome> => {
    const locked = await lockOpen(tx, target);
    const review = locked !== null && options.overdue;
    await tx.payment.update({
      where: { id: target.id },
      data: { lastCheckedAt: options.now, ...(review ? { status: "in_review" } : {}) },
    });
    if (review && locked.order.status === "pending_payment") {
      await tx.stockReservation.updateMany({
        where: { orderId: target.orderId, status: "active" },
        data: { status: "in_review" },
      });
      await flagForReview(tx, locked.order, {
        reason: "uncertain",
        paymentId: target.id,
        adminEmail: options.adminEmail,
      });
    }
    return "uncertain";
  });
}

/** Flow la informa pendiente con el plazo terminado: ya no es pagable (timeout). */
async function expireAttempt(
  prisma: PrismaClient,
  target: Target,
  now: Date,
): Promise<ReconcileOutcome> {
  return prisma.$transaction(async (tx): Promise<ReconcileOutcome> => {
    if (!(await lockOpen(tx, target))) return "unchanged";
    await tx.payment.update({
      where: { id: target.id },
      data: { status: "expired", lastCheckedAt: now },
    });
    await expireLocked(tx, target.orderId, now);
    return "expired";
  });
}

/** Vence un pedido ya bloqueado, si sigue sin pagar y sin cobros por resolver. */
async function expireLocked(tx: Tx, orderId: string, now: Date): Promise<boolean> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { select: { status: true } } },
  });
  const blocked = order.payments.some((p) => isOpen(p.status) || p.status === "paid");
  if (order.status !== "pending_payment" || order.paymentDueAt > now || blocked) return false;
  const reason = "Venció el plazo de pago";
  await releaseReservations(tx, orderId, `${reason} de ${formatOrderNumber(order.number)}`, now);
  await releaseCouponUse(tx, orderId);
  await moveOrder(tx, order, "expired", reason);
  return true;
}

export interface ReconcileRun {
  reconciled: number;
  expired: number;
  failed: number;
}

/** Una vuelta del worker. Sin Flow configurado solo vence pedidos sin cobro abierto. */
export async function runReconciliation(
  prisma: PrismaClient,
  flow: Gateway | null,
  options: {
    adminEmail: string;
    logger: Logger;
    now?: Date;
    shouldStop?: () => boolean;
    /** Solo este pedido. Para tests; en operación normal no se usa. */
    orderId?: string;
  },
): Promise<ReconcileRun> {
  const { adminEmail, logger } = options;
  const now = options.now ?? new Date();
  const stop = options.shouldStop ?? (() => false);
  const run: ReconcileRun = { reconciled: 0, expired: 0, failed: 0 };
  const scope = options.orderId;
  const ago = (ms: number) => new Date(now.getTime() - ms);

  if (flow) {
    const notCheckedSince = (ms: number): Prisma.PaymentWhereInput => ({
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: ago(ms) } }],
    });
    const payments = await prisma.payment.findMany({
      where: {
        ...(scope ? { orderId: scope } : {}),
        OR: [
          {
            status: { in: ["pending", "in_review"] },
            createdAt: { lte: ago(MIN_AGE_MS), gt: ago(SLOW_AFTER_MS) },
            // Un poco menos que el intervalo, para no saltarse una vuelta.
            AND: [notCheckedSince(RECONCILE_INTERVAL_MS - MIN_AGE_MS)],
          },
          {
            status: { in: ["pending", "in_review"] },
            createdAt: { lte: ago(SLOW_AFTER_MS) },
            AND: [notCheckedSince(HOUR)],
          },
          {
            status: "expired",
            createdAt: { gt: ago(SLOW_AFTER_MS) },
            AND: [notCheckedSince(LATE_CHECK_MS)],
          },
        ],
      },
      select: { id: true },
      orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: BATCH,
    });
    for (const { id } of payments) {
      if (stop()) return run;
      try {
        const outcome = await reconcilePayment(prisma, flow, id, { adminEmail, now });
        run.reconciled += 1;
        if (outcome === "expired") run.expired += 1;
        const alert =
          outcome === "uncertain" ||
          outcome === "mismatch" ||
          outcome === "late_review" ||
          outcome === "double_charge";
        if (alert) logger.warn({ paymentId: id, outcome }, "Pago que requiere revisión");
      } catch (err) {
        run.failed += 1;
        logger.error({ err, paymentId: id }, "No se pudo conciliar el pago");
      }
    }
  }

  const overdue = await prisma.order.findMany({
    where: {
      ...(scope ? { id: scope } : {}),
      status: "pending_payment",
      paymentDueAt: { lte: now },
      payments: { none: { status: { in: ["pending", "in_review", "paid"] } } },
    },
    select: { id: true },
    orderBy: { paymentDueAt: "asc" },
    take: BATCH,
  });
  for (const { id } of overdue) {
    if (stop()) return run;
    try {
      const done = await prisma.$transaction(async (tx) => {
        await lockOrder(tx, { id });
        return expireLocked(tx, id, now);
      });
      if (done) run.expired += 1;
    } catch (err) {
      run.failed += 1;
      logger.error({ err, orderId: id }, "No se pudo vencer el pedido");
    }
  }
  return run;
}

const OUTCOME_TEXT: Record<ReconcileOutcome, string> = {
  unchanged: "Flow informa el pago pendiente: sin cambios.",
  confirmed: "Pago confirmado: el pedido quedó confirmado.",
  late_review: "Pago recibido sin poder confirmar el pedido: quedó en revisión.",
  rejected: "Flow informa el pago rechazado o anulado.",
  mismatch: "Los datos de Flow no coinciden con el pedido: quedó en revisión.",
  double_charge: "El pedido ya estaba pagado: posible doble cobro, en revisión.",
  uncertain: "Flow no dio una respuesta segura: no se asume rechazo.",
  expired: "El plazo terminó sin pago: el intento quedó vencido.",
  not_found: "Flow no conoce el intento: quedó anulado.",
};

/** Conciliación pedida desde el panel (RF-33), con actor y motivo en la auditoría. */
export async function reconcileFromPanel(
  prisma: PrismaClient,
  flow: Gateway | null,
  input: {
    paymentId: string;
    reason: string;
    actor: Actor;
    adminEmail: string;
    requestId?: string | undefined;
  },
): Promise<{ outcome: ReconcileOutcome; message: string }> {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: { order: { select: { number: true } } },
  });
  if (!payment) throw errors.notFound("Pago no encontrado");
  if (!isOpen(payment.status)) {
    throw errors.conflict("Este pago no está pendiente ni en revisión.", { field: "form" });
  }
  if (Date.now() - payment.createdAt.getTime() < MIN_AGE_MS) {
    throw errors.conflict("El pago se está iniciando: espera un minuto.", { field: "form" });
  }
  if (!flow) throw errors.conflict("Flow no está configurado.", { field: "form" });

  const outcome = await reconcilePayment(prisma, flow, payment.id, {
    adminEmail: input.adminEmail,
  });
  const message = OUTCOME_TEXT[outcome];
  await writeAudit(
    prisma,
    input.actor,
    {
      action: "payment.reconciled",
      resourceType: "order",
      resourceId: payment.orderId,
      details: { paymentId: payment.id, number: payment.order.number, outcome, summary: message },
      reason: input.reason,
    },
    input.requestId,
  );
  return { outcome, message };
}

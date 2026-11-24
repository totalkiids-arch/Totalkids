import { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { Issues } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import { chileDate } from "../cart/chile-date.js";
import {
  refundDto,
  refundInclude,
  refundTotalsOf,
  lockOrder,
  workflowOf,
  type AdminRefundRecord,
  type RefundTotals,
} from "./query.js";
import { MESSAGES, paidPayment, refundableAmount, refundOverMessage } from "./rules.js";
import type { OrderRef, RefundInput } from "./schemas.js";

/**
 * Reembolsos manuales del panel (LN-13, RF-32). Solo el Administrador. Registran
 * una devolución hecha fuera del sistema: nunca modifican el `Payment` (el cobro
 * sigue siendo un hecho) ni el estado del pedido. El pedido se bloquea (FOR
 * UPDATE) para que dos registros simultáneos validen el tope uno tras otro; el
 * trigger `refund_records_within_charge` es la última barrera.
 */

export interface RefundResult {
  refund: AdminRefundRecord;
  refundTotals: RefundTotals;
}

type Client = Pick<PrismaClient, "$transaction">;
type Tx = Prisma.TransactionClient;

/** Código SQLSTATE original detrás de un error de Prisma con adaptador (p. ej. "23514"). */
function sqlState(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const meta = error.meta as { driverAdapterError?: { cause?: { originalCode?: unknown } } };
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return typeof code === "string" ? code : null;
}

const CHECK_VIOLATION = "23514";

async function loadForRefund(tx: Tx, id: string) {
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: {
      payments: true,
      refunds: { select: { status: true, amount: true } },
    },
  });
}

async function totalsAfter(tx: Tx, id: string): Promise<RefundTotals> {
  return refundTotalsOf(workflowOf(await loadForRefund(tx, id)));
}

export async function recordRefund(
  prisma: Client,
  ref: OrderRef,
  input: RefundInput,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<RefundResult> {
  let orderId = "";
  try {
    return await prisma.$transaction(async (tx) => {
      const id = await lockOrder(tx, ref);
      orderId = id;
      const order = await loadForRefund(tx, id);
      const flow = workflowOf(order);
      const paid = order.payments.find((p) => p.status === "paid");
      if (!paidPayment(flow) || !paid) {
        throw errors.conflict(MESSAGES.refundUnpaid, { field: "form" });
      }

      // Validaciones que dependen del pedido (las de forma ya las hizo el esquema).
      const issues = new Issues();
      const remaining = refundableAmount(flow);
      if (input.amount > remaining) issues.add("amount", refundOverMessage(remaining));
      const today = chileDate(now);
      const chargedOn = chileDate(paid.paidAt ?? paid.createdAt);
      if (input.date > today) issues.add("date", MESSAGES.refundFuture);
      else if (input.date < chargedOn) issues.add("date", MESSAGES.refundBeforeCharge);
      issues.throwIfAny();

      const processed = input.status === "processed";
      const created = await tx.refundRecord.create({
        data: {
          orderId: id,
          paymentId: paid.id,
          amount: input.amount,
          refundDate: new Date(`${input.date}T00:00:00.000Z`),
          reference: input.reference,
          status: input.status,
          registeredByUserId: actor.actorUserId,
          registeredByLabel: actor.actorLabel,
          // Ya procesado por fuera: queda resuelto al registrarse.
          ...(processed
            ? {
                resolvedByUserId: actor.actorUserId,
                resolvedByLabel: actor.actorLabel,
                resolvedAt: now,
              }
            : {}),
          createdAt: now,
        },
        include: refundInclude,
      });

      await writeAudit(
        tx,
        actor,
        {
          action: "order.refund_recorded",
          resourceType: "order",
          resourceId: id,
          details: {
            number: order.number,
            refundId: created.id,
            paymentId: paid.id,
            amount: input.amount,
            date: input.date,
            reference: input.reference,
            status: input.status,
            note: "Reembolso manual: no mueve dinero ni cambia el cobro.",
          },
          reason: `Referencia ${input.reference}`,
        },
        requestId,
      );
      return { refund: refundDto(created), refundTotals: await totalsAfter(tx, id) };
    });
  } catch (error) {
    // El trigger rechazó el reembolso (tope o pago no confirmado). Con el pedido
    // bloqueado no debería pasar; si pasa, el estado cambió: 409, nunca 500.
    if (sqlState(error) !== CHECK_VIOLATION || !orderId) throw error;
    const id = orderId;
    const flow = await prisma.$transaction(async (tx) => workflowOf(await loadForRefund(tx, id)));
    if (!paidPayment(flow)) throw errors.conflict(MESSAGES.refundUnpaid, { field: "form" });
    const left = refundableAmount(flow);
    throw errors.conflict(refundOverMessage(left), { field: "amount", remaining: left });
  }
}

export async function resolveRefund(
  prisma: Client,
  ref: OrderRef,
  refundId: string,
  status: "processed" | "failed",
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<RefundResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const id = await lockOrder(tx, ref);
      const refund = await tx.refundRecord.findFirst({ where: { id: refundId, orderId: id } });
      if (!refund) throw errors.notFound(MESSAGES.refundMissing);
      if (refund.status !== "requested") {
        throw errors.conflict(MESSAGES.refundResolved, { field: "form" });
      }

      // Condicional: si otra resolución se adelantara, no se pisa.
      const { count } = await tx.refundRecord.updateMany({
        where: { id: refund.id, status: "requested" },
        data: {
          status,
          resolvedByUserId: actor.actorUserId,
          resolvedByLabel: actor.actorLabel,
          resolvedAt: now,
        },
      });
      if (count === 0) throw errors.conflict(MESSAGES.refundResolved, { field: "form" });

      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { number: true },
      });
      await writeAudit(
        tx,
        actor,
        {
          action: "order.refund_resolved",
          resourceType: "order",
          resourceId: id,
          details: {
            number: order.number,
            refundId: refund.id,
            amount: refund.amount,
            from: "requested",
            to: status,
          },
          reason: `Referencia ${refund.reference}`,
        },
        requestId,
      );
      const updated = await tx.refundRecord.findUniqueOrThrow({
        where: { id: refund.id },
        include: refundInclude,
      });
      return { refund: refundDto(updated), refundTotals: await totalsAfter(tx, id) };
    });
  } catch (error) {
    // Procesar uno solicitado vuelve a pasar por el trigger (pago anulado después, p. ej.).
    if (sqlState(error) === CHECK_VIOLATION) {
      throw errors.conflict(MESSAGES.refundUnpaid, { field: "form" });
    }
    throw error;
  }
}

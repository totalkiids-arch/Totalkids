import { randomBytes } from "node:crypto";

import { formatOrderNumber, parseOrderNumber } from "../../domain/checkout.js";
import type { OrderStatus } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { verifyOrderAccess } from "../../lib/order-access.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { hashToken } from "../../lib/secrets.js";
import { lockOrder } from "../admin-orders/query.js";
import { attemptUrl, queryAttempt } from "./attempt.js";
import { FlowRejectedError, FlowUncertainError, type FlowClient } from "./client.js";
import { seal } from "./seal.js";
import { settlePayment } from "./settle.js";
import { reserveAgain } from "./stock.js";

/** Lo que necesita la API para cobrar con Flow. */
export interface FlowGateway {
  client: FlowClient;
  /** Base pública de la API (…/api/v1) a la que Flow envía confirmación y retorno. */
  callbackBase: string;
  /** Secreto con el que se cifra la URL de pago guardada. */
  sealSecret: string;
}

const PG_INT_MAX = 2_147_483_647;
/** Con menos tiempo que esto no se abre un pago: vencería mientras se paga. */
const MIN_SECONDS_TO_PAY = 60;

const conflict = (message: string, reason: string) => errors.conflict(message, { reason });

const uncertain = () =>
  conflict(
    "Estamos verificando tu pago anterior. Espera antes de intentarlo otra vez.",
    "payment_uncertain",
  );

/** Segundos que quedan para pagar; 409 si el pedido ya no se puede pagar. */
function secondsToPay(order: { status: OrderStatus; paymentDueAt: Date }, now: Date): number {
  if (order.status !== "pending_payment") {
    throw conflict("Este pedido ya no se puede pagar.", "order_not_payable");
  }
  const seconds = Math.floor((order.paymentDueAt.getTime() - now.getTime()) / 1000);
  if (seconds < MIN_SECONDS_TO_PAY) {
    throw conflict("El plazo para pagar este pedido terminó.", "payment_expired");
  }
  return seconds;
}

/**
 * POST /payments/flow/create: crea el intento de cobro o reutiliza el vigente
 * (RF-15). Nunca abre un segundo intento mientras el anterior pueda cobrarse
 * (RN-06). La llamada a Flow va fuera de la transacción: el intento queda
 * registrado antes, y si el resultado es incierto queda en revisión.
 */
export async function startPayment(
  prisma: PrismaClient,
  flow: FlowGateway,
  input: {
    orderNumber: string;
    credential: string;
    accessSecret: string;
    adminEmail: string;
    now?: Date;
  },
): Promise<{ redirectUrl: string }> {
  const now = input.now ?? new Date();
  const number = parseOrderNumber(input.orderNumber);
  const target =
    number === null || number > PG_INT_MAX
      ? null
      : await prisma.order.findUnique({ where: { number }, select: { id: true } });
  if (!target || !verifyOrderAccess(input.accessSecret, target.id, input.credential)) {
    throw errors.notFound("No encontramos ese pedido.");
  }

  // 1. Si hay un intento abierto, primero se consulta su estado real.
  const open = await prisma.payment.findFirst({
    where: { orderId: target.id, status: { in: ["pending", "in_review"] } },
  });
  if (open) {
    const answer = await queryAttempt(flow, open).catch((error: unknown) => {
      // Un 4xx tampoco prueba que no exista: se concilia (LN-15), no se asume.
      if (error instanceof FlowUncertainError || error instanceof FlowRejectedError) return null;
      throw error;
    });
    if (!answer) throw uncertain();
    const { outcome } = await settlePayment(prisma, {
      ...answer,
      paymentId: open.id,
      adminEmail: input.adminEmail,
      now,
    });
    if (outcome === "unchanged" && answer.status.status === "pending") {
      secondsToPay(await prisma.order.findUniqueOrThrow({ where: { id: target.id } }), now);
      const url = attemptUrl(flow, open);
      if (!url) throw uncertain();
      return { redirectUrl: url };
    }
    // Rechazado: sigue con un intento nuevo. Cualquier otro caso lo responde el paso 2.
  }

  // 2. Intento nuevo, registrado antes de llamar a Flow.
  const { payment, orderNumber, email, timeoutSeconds } = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, { id: target.id });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: target.id },
      include: { payments: { orderBy: { attempt: "desc" } } },
    });
    if (order.payments.some((p) => p.status === "paid")) {
      throw conflict("Este pedido ya está pagado.", "already_paid");
    }
    if (order.payments.some((p) => p.status === "pending" || p.status === "in_review")) {
      throw uncertain();
    }
    const seconds = secondsToPay(order, now);
    if (order.total <= 0) {
      throw conflict("Este pedido no tiene un monto por cobrar.", "nothing_to_charge");
    }
    const visible = formatOrderNumber(order.number);
    const reason = `Reintento de pago de ${visible}`;
    if (!(await reserveAgain(tx, order.id, reason, order.paymentDueAt))) {
      throw conflict(
        "Ya no quedan unidades para este pedido. Vuelve al carrito.",
        "stock_unavailable",
      );
    }
    const attempt = (order.payments[0]?.attempt ?? 0) + 1;
    return {
      payment: await tx.payment.create({
        data: {
          orderId: order.id,
          attempt,
          // Sufijo aleatorio: no choca en Flow si la base se recrea (sandbox).
          commerceOrder: `${visible}-${String(attempt)}-${randomBytes(4).toString("hex")}`,
          amount: order.total,
        },
      }),
      orderNumber: visible,
      email: order.buyerEmail,
      timeoutSeconds: seconds,
    };
  });

  // 3. Flow. Un fallo claro anula el intento; uno incierto lo deja en revisión.
  const result = await flow.client
    .createPayment({
      commerceOrder: payment.commerceOrder,
      subject: `Pedido ${orderNumber} - Total Kids`,
      amount: payment.amount,
      email,
      urlConfirmation: `${flow.callbackBase}/payments/flow/confirm`,
      urlReturn: `${flow.callbackBase}/payments/flow/return`,
      timeoutSeconds,
    })
    .catch(async (error: unknown) => {
      const rejected = error instanceof FlowRejectedError;
      // Solo si sigue pendiente: una confirmación pudo llegar mientras tanto.
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "pending" },
        data: { status: rejected ? "voided" : "in_review", lastCheckedAt: now },
      });
      if (rejected) {
        throw conflict(
          "No pudimos iniciar el pago. Inténtalo en unos minutos.",
          "payment_unavailable",
        );
      }
      throw error instanceof FlowUncertainError ? uncertain() : error;
    });
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      flowOrder: BigInt(result.flowOrder),
      tokenHash: hashToken(result.token),
      redirectUrlEncrypted: seal(result.redirectUrl, flow.sealSecret),
    },
  });
  return { redirectUrl: result.redirectUrl };
}

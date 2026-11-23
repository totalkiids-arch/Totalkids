import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import type { EmailEvent } from "../../generated/prisma/enums.js";
import { EVENT_KEY_MAX, emailJobType, parseEmailData, type EmailDataInput } from "./events.js";

/**
 * Encolado transaccional de correos (SRS 4.4.3): el evento se persiste junto con
 * la operación de negocio, dentro de la MISMA transacción del llamador. Si la
 * operación hace rollback, el correo tampoco existe; si se confirma, el worker
 * lo enviará aunque la API se caiga justo después.
 */

/** Lo único que necesita el encolado de la transacción del llamador. */
export type EmailTx = Pick<Prisma.TransactionClient, "outboxJob" | "emailLog">;

export interface EnqueueEmailInput<E extends EmailEvent> {
  event: E;
  recipient: string;
  /** Clave única del hecho (ver `emailEventKey`). La misma clave no duplica. */
  eventKey: string;
  data: EmailDataInput<E>;
  orderId?: string | null;
  serviceRequestId?: string | null;
}

export interface EnqueueEmailResult {
  /** false si la clave ya existía: no se creó nada. */
  enqueued: boolean;
  /** Registro del correo (el nuevo o el que ya existía), si lo hay. */
  emailLogId: string | null;
}

const recipientSchema = z.email().max(254);

/** Actor de un reenvío manual: viaja en el payload para el intento manual. */
export interface ResendActor {
  actorUserId: string;
  actorLabel: string;
}

interface InsertEmailInput {
  event: EmailEvent;
  recipient: string;
  eventKey: string;
  payload: Prisma.InputJsonObject;
  orderId?: string | null | undefined;
  serviceRequestId?: string | null | undefined;
  resendOfId?: string | null | undefined;
  maxAttempts?: number | undefined;
}

/**
 * Inserta trabajo y registro con ON CONFLICT DO NOTHING (`skipDuplicates`): un
 * duplicado no lanza un error, que en PostgreSQL dejaría abortada la
 * transacción del llamador. Uso interno (encolado y reenvío).
 */
export async function insertEmail(
  tx: EmailTx,
  input: InsertEmailInput,
): Promise<EnqueueEmailResult> {
  if (input.eventKey.length === 0 || input.eventKey.length > EVENT_KEY_MAX) {
    throw new Error("La clave del evento de correo no es válida");
  }
  const recipient = input.recipient.trim().toLowerCase();
  if (!recipientSchema.safeParse(recipient).success) {
    throw new Error(`Destinatario inválido para el correo ${input.event}`);
  }

  const [job] = await tx.outboxJob.createManyAndReturn({
    data: [
      {
        type: emailJobType(input.event),
        eventKey: input.eventKey,
        payload: input.payload,
        ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  if (!job) return { enqueued: false, emailLogId: await existingLogId(tx, input.eventKey) };

  const [log] = await tx.emailLog.createManyAndReturn({
    data: [
      {
        event: input.event,
        recipient,
        eventKey: input.eventKey,
        orderId: input.orderId ?? null,
        serviceRequestId: input.serviceRequestId ?? null,
        outboxJobId: job.id,
        resendOfId: input.resendOfId ?? null,
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  return { enqueued: true, emailLogId: log?.id ?? (await existingLogId(tx, input.eventKey)) };
}

async function existingLogId(tx: EmailTx, eventKey: string): Promise<string | null> {
  const log = await tx.emailLog.findUnique({ where: { eventKey }, select: { id: true } });
  return log?.id ?? null;
}

/**
 * Encola un correo dentro de la transacción del llamador:
 *
 *   await prisma.$transaction(async (tx) => {
 *     const order = await tx.order.update({ … status: "confirmed" … });
 *     await enqueueEmail(tx, {
 *       event: "purchase_confirmed",
 *       recipient: order.buyerEmail,
 *       eventKey: emailEventKey("purchase_confirmed", order.id),
 *       orderId: order.id,
 *       data: { … },
 *     });
 *   });
 *
 * Valida los datos del evento (lanza si faltan campos: es un error de programación).
 */
export async function enqueueEmail<E extends EmailEvent>(
  tx: EmailTx,
  input: EnqueueEmailInput<E>,
): Promise<EnqueueEmailResult> {
  const data = parseEmailData(input.event, input.data);
  return insertEmail(tx, {
    event: input.event,
    recipient: input.recipient,
    eventKey: input.eventKey,
    payload: data as Prisma.InputJsonObject,
    orderId: input.orderId,
    serviceRequestId: input.serviceRequestId,
  });
}

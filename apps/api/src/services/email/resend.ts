import type { Prisma } from "../../generated/prisma/client.js";
import type { EmailStatus } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { insertEmail, type ResendActor } from "./enqueue.js";
import { parseEmailData } from "./events.js";

/**
 * Reenvío manual auditado (RF-21, SRS 4.4.3). Solo Administrador (lo exige la
 * ruta). En una transacción:
 *
 * - bloquea el registro original (`FOR UPDATE`) para que dos clics no creen dos reenvíos;
 * - exige que esté `failed` o `uncertain`, y que no haya otro reenvío pendiente;
 * - crea un registro nuevo vinculado (`resend_of_id`) con su trabajo en outbox
 *   (un solo intento) y el actor en el payload;
 * - deja la entrada en `audit_log`.
 *
 * El worker hace el envío y registra el intento manual con su actor, en el
 * registro nuevo y en el original. Nunca toca el pedido ni la solicitud.
 */

export const RESENDABLE: readonly EmailStatus[] = ["failed", "uncertain"];
export const RESEND_NOT_ALLOWED = "Solo se reenvía un correo fallido o con resultado incierto.";

export interface ResendResponse {
  /** Registro nuevo creado por el reenvío. */
  id: string;
  status: "pending";
  /** Registro original. */
  resendOf: string;
}

export async function requestEmailResend(
  prisma: Pick<PrismaClient, "$transaction">,
  emailId: string,
  actor: ResendActor,
  requestId?: string,
): Promise<ResendResponse> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM email_log WHERE id = ${emailId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw errors.notFound("Correo no encontrado");

    const original = await tx.emailLog.findUniqueOrThrow({
      where: { id: emailId },
      include: { outboxJob: { select: { payload: true } } },
    });
    if (original.event === "password_recovery") {
      throw errors.conflict(
        "La recuperación de contraseña no se reenvía: se pide de nuevo desde el ingreso al panel.",
      );
    }
    if (!RESENDABLE.includes(original.status)) throw errors.conflict(RESEND_NOT_ALLOWED);
    if (await tx.emailLog.count({ where: { resendOfId: emailId, status: "pending" } })) {
      throw errors.conflict("Ya hay un reenvío en curso para este correo.");
    }
    if (!original.outboxJob) {
      throw errors.conflict("No se encuentran los datos del correo original para reenviarlo.");
    }

    // Los datos del original, sin el actor de un reenvío anterior.
    const data = parseEmailData(original.event, original.outboxJob.payload);
    const number = (await tx.emailLog.count({ where: { resendOfId: emailId } })) + 1;
    const created = await insertEmail(tx, {
      event: original.event,
      recipient: original.recipient,
      eventKey: `reenvio:${emailId}:${String(number)}`,
      payload: { ...(data as Prisma.InputJsonObject), resend: { ...actor } },
      orderId: original.orderId,
      serviceRequestId: original.serviceRequestId,
      resendOfId: emailId,
      // Un reenvío manual es un solo intento: si falla, se decide de nuevo.
      maxAttempts: 1,
    });
    if (!created.enqueued || !created.emailLogId) {
      throw errors.conflict("Ya hay un reenvío en curso para este correo.");
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actor.actorUserId,
        actorLabel: actor.actorLabel,
        action: "email.resent",
        resourceType: "email",
        resourceId: emailId,
        details: {
          resendId: created.emailLogId,
          event: original.event,
          previousStatus: original.status,
        },
        requestId: requestId ?? null,
      },
    });

    return { id: created.emailLogId, status: "pending", resendOf: emailId };
  });
}

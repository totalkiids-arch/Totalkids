import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { createStaffUser, requestPasswordReset } from "../src/services/auth.js";
import { enqueueEmail } from "../src/services/email/enqueue.js";
import { emailEventKey } from "../src/services/email/events.js";

// Encolado transaccional de correos (LN-14, SRS 4.4.3) contra totalkids_test.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("encolado de correos (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const delivered = (orderNumber: number) => ({
    event: "order_delivered" as const,
    recipient: "  Compradora@Ejemplo.CL ",
    eventKey: emailEventKey("order_delivered", `enqueue-${randomUUID()}`),
    data: { orderNumber, buyerName: "Ana" },
  });

  it("crea el trabajo y el registro con la misma clave, en la transacción del llamador", async () => {
    const input = delivered(1001);
    const result = await prisma.$transaction((tx) => enqueueEmail(tx, input));

    expect(result.enqueued).toBe(true);
    const job = await prisma.outboxJob.findUniqueOrThrow({ where: { eventKey: input.eventKey } });
    const log = await prisma.emailLog.findUniqueOrThrow({ where: { eventKey: input.eventKey } });
    expect(log.id).toBe(result.emailLogId);
    expect(job.type).toBe("email.order_delivered");
    expect(job.status).toBe("pending");
    expect(job.maxAttempts).toBe(4);
    expect(job.payload).toEqual({ orderNumber: 1001, buyerName: "Ana" });
    expect(log).toMatchObject({
      event: "order_delivered",
      recipient: "compradora@ejemplo.cl",
      status: "pending",
      outboxJobId: job.id,
      resendOfId: null,
    });
  });

  it("la misma clave no duplica, ni en otra transacción ni dentro de la misma", async () => {
    const input = delivered(1002);
    const first = await prisma.$transaction((tx) => enqueueEmail(tx, input));
    const again = await prisma.$transaction(async (tx) => {
      const a = await enqueueEmail(tx, input);
      // El duplicado no aborta la transacción: se puede seguir usando.
      const b = await enqueueEmail(tx, input);
      await tx.outboxJob.count();
      return [a, b];
    });

    expect(again.map((r) => r.enqueued)).toEqual([false, false]);
    expect(again.map((r) => r.emailLogId)).toEqual([first.emailLogId, first.emailLogId]);
    expect(await prisma.outboxJob.count({ where: { eventKey: input.eventKey } })).toBe(1);
    expect(await prisma.emailLog.count({ where: { eventKey: input.eventKey } })).toBe(1);
  });

  it("si la operación del llamador hace rollback, no queda ningún correo", async () => {
    const input = delivered(1003);
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueEmail(tx, input);
        throw new Error("falla la operación de negocio");
      }),
    ).rejects.toThrow("falla la operación de negocio");

    expect(await prisma.outboxJob.count({ where: { eventKey: input.eventKey } })).toBe(0);
    expect(await prisma.emailLog.count({ where: { eventKey: input.eventKey } })).toBe(0);
  });

  it("guarda la referencia a la solicitud", async () => {
    const request = await prisma.serviceRequest.create({
      data: {
        service: "armado",
        name: "Ana",
        email: "ana@ejemplo.cl",
        message: "Necesito armar una cama casa.",
        privacyAcceptedAt: new Date(),
        privacyVersion: "v1",
      },
    });
    const eventKey = emailEventKey("service_request", request.id, "requester");
    await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "service_request",
        recipient: request.email,
        eventKey,
        serviceRequestId: request.id,
        data: {
          audience: "requester",
          requestNumber: request.number,
          service: "Armado",
          name: request.name,
          responseTime: "2 días hábiles",
        },
      }),
    );
    const log = await prisma.emailLog.findUniqueOrThrow({ where: { eventKey } });
    expect(log.serviceRequestId).toBe(request.id);
    expect(log.orderId).toBeNull();
  });

  it("rechaza datos incompletos sin revelar valores, y no deja nada", async () => {
    const eventKey = emailEventKey("order_shipped", `enqueue-${randomUUID()}`);
    const attempt = prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "order_shipped",
        recipient: "secreto@ejemplo.cl",
        eventKey,
        // @ts-expect-error falta el transportista
        data: { orderNumber: 7, buyerName: "Ana" },
      }),
    );
    await expect(attempt).rejects.toThrow(/order_shipped: carrier/);
    await expect(attempt).rejects.not.toThrow(/secreto/);
    expect(await prisma.outboxJob.count({ where: { eventKey } })).toBe(0);
  });

  it("la recuperación de contraseña de LN-04 encola trabajo y registro, sin token", async () => {
    const email = `recupera-${randomUUID()}@ejemplo.cl`;
    const user = await createStaffUser(prisma, {
      email,
      name: "Equipo",
      role: "admin",
      password: "contraseña-segura-del-taller",
    });

    await requestPasswordReset(prisma, email.toUpperCase());

    const log = await prisma.emailLog.findFirstOrThrow({
      where: { event: "password_recovery", recipient: email },
      include: { outboxJob: true },
    });
    expect(log.status).toBe("pending");
    expect(log.eventKey).toMatch(new RegExp(`^password_recovery:${user.id}:`));
    expect(log.outboxJob).toMatchObject({
      type: "email.password_recovery",
      payload: { userId: user.id },
    });
  });

  it("rechaza un destinatario inválido", async () => {
    const input = { ...delivered(1004), recipient: "no-es-correo" };
    await expect(prisma.$transaction((tx) => enqueueEmail(tx, input))).rejects.toThrow(
      /Destinatario inválido/,
    );
  });
});

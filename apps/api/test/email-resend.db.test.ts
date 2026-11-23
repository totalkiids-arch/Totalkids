import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailStatus } from "../src/generated/prisma/enums.js";
import { CSRF_COOKIE_DEV, issueCsrfToken } from "../src/lib/csrf.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { PANEL_COOKIE_DEV } from "../src/middleware/panel-auth.js";
import { createStaffUser, login } from "../src/services/auth.js";
import { enqueueEmail } from "../src/services/email/enqueue.js";
import { emailEventKey } from "../src/services/email/events.js";
import { FakeEmailSender } from "../src/services/email/fake-sender.js";
import { createEmailWorker } from "../src/services/email/worker.js";
import { buildTestApp, testEnv } from "./helpers.js";

// Reenvío manual auditado (LN-14, RF-21) contra totalkids_test.
const url = process.env.TEST_DATABASE_URL;
const PASSWORD = "contraseña-segura-del-taller";

describe.skipIf(!url)("POST /admin/emails/{id}/resend (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const app = buildTestApp({ prisma });
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function session(role: "admin" | "operator") {
    const email = `${role}-${randomUUID()}@ejemplo.cl`;
    const user = await createStaffUser(prisma, { email, name: "Equipo", role, password: PASSWORD });
    const { token } = await login(prisma, { email, password: PASSWORD });
    return { user, token };
  }

  function headers(panelToken?: string, csrf = true): Record<string, string> {
    const token = issueCsrfToken(
      testEnv.CSRF_SECRET ?? "",
      panelToken ? hashToken(panelToken) : "",
    );
    const cookies = csrf ? [`${CSRF_COOKIE_DEV}=${token}`] : [];
    if (panelToken) cookies.push(`${PANEL_COOKIE_DEV}=${panelToken}`);
    return { cookie: cookies.join("; "), ...(csrf ? { "x-csrf-token": token } : {}) };
  }

  const resend = (id: string, h: Record<string, string>) =>
    request(app).post(`/api/v1/admin/emails/${id}/resend`).set(h);

  async function order() {
    return prisma.order.create({
      data: {
        idempotencyKey: `k-${randomUUID()}`,
        buyerName: "María González",
        buyerRut: "12.345.678-5",
        buyerEmail: "maria@correo.cl",
        buyerPhone: "+56912345678",
        deliveryMethod: "pickup",
        pickupDetails: "Taller Total Kids",
        taxDocument: "boleta",
        subtotal: 20_000,
        shippingCost: 0,
        total: 20_000,
        termsAcceptedAt: new Date(),
        termsVersion: "v1",
        paymentDueAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  /** Correo de "pedido entregado" del pedido, ya procesado con el estado indicado. */
  async function emailWithStatus(status: EmailStatus, scope = randomUUID()) {
    const o = await order();
    const eventKey = emailEventKey("order_delivered", o.id, scope);
    const { emailLogId } = await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "order_delivered",
        recipient: o.buyerEmail,
        eventKey,
        orderId: o.id,
        data: { orderNumber: o.number, buyerName: o.buyerName },
      }),
    );
    const id = emailLogId ?? "";
    if (status !== "pending") {
      await prisma.outboxJob.update({
        where: { eventKey },
        data: {
          status: status === "sent" ? "done" : "failed",
          attempts: 1,
          processedAt: new Date(),
        },
      });
      await prisma.emailLog.update({ where: { id }, data: { status } });
    }
    return { id, order: o, scope };
  }

  function worker(scope: string, sender: FakeEmailSender) {
    return createEmailWorker({
      prisma,
      sender,
      logger: createLogger("silent", false),
      config: {
        siteUrl: "https://tienda.example.com",
        batchSize: 10,
        pollIntervalMs: 10,
        lockTimeoutMs: 300_000,
        scope,
      },
    });
  }

  it("Administrador: crea un registro vinculado, audita y el worker registra el intento manual con actor", async () => {
    const { user, token } = await session("admin");
    const { id, order: o } = await emailWithStatus("failed");

    const res = await resend(id, headers(token));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      id: expect.any(String) as unknown,
      status: "pending",
      resendOf: id,
    });
    const newId = (res.body as { id: string }).id;

    const copy = await prisma.emailLog.findUniqueOrThrow({
      where: { id: newId },
      include: { outboxJob: true },
    });
    expect(copy).toMatchObject({
      event: "order_delivered",
      recipient: "maria@correo.cl",
      status: "pending",
      resendOfId: id,
      orderId: o.id,
      eventKey: `reenvio:${id}:1`,
    });
    expect(copy.outboxJob?.maxAttempts).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "email.resent", resourceId: id },
    });
    expect(audit).toMatchObject({
      actorUserId: user.id,
      actorLabel: "Administrador",
      resourceType: "email",
    });
    expect(audit.details).toMatchObject({
      resendId: newId,
      event: "order_delivered",
      previousStatus: "failed",
    });
    expect(audit.requestId).toBe(res.headers["x-request-id"]);

    // El worker (adaptador falso) hace el envío.
    const sender = new FakeEmailSender();
    await worker(id, sender).runOnce();
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.subject).toBe(`Tu pedido #TK-${String(o.number)} fue entregado`);

    const manual = {
      kind: "manual",
      result: "sent",
      actorUserId: user.id,
      actorLabel: "Administrador",
    };
    const sent = await prisma.emailLog.findUniqueOrThrow({
      where: { id: newId },
      include: { attempts: true },
    });
    expect(sent.status).toBe("sent");
    expect(sent.attempts).toMatchObject([manual]);
    const original = await prisma.emailLog.findUniqueOrThrow({
      where: { id },
      include: { attempts: true },
    });
    expect(original.status).toBe("sent");
    expect(original.attempts).toMatchObject([manual]);
  });

  it("también reenvía un correo incierto; un reenvío fallido deja ambos fallidos, sin reintentos", async () => {
    const { token } = await session("admin");
    const { id } = await emailWithStatus("uncertain");

    const res = await resend(id, headers(token));
    expect(res.status).toBe(202);
    const sender = new FakeEmailSender().respondWith({
      outcome: "retryable",
      detail: "Brevo respondió 503 (sin_codigo)",
    });
    await worker(id, sender).runOnce();

    const copy = await prisma.emailLog.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
      include: { outboxJob: true, attempts: true },
    });
    expect(copy.status).toBe("failed");
    expect(copy.outboxJob?.status).toBe("dead");
    expect(copy.attempts).toMatchObject([{ kind: "manual", result: "failed" }]);
    expect((await prisma.emailLog.findUniqueOrThrow({ where: { id } })).status).toBe("failed");

    // Se puede volver a reenviar: queda como segundo reenvío.
    const again = await resend(id, headers(token));
    expect(again.status).toBe(202);
    const second = await prisma.emailLog.findUniqueOrThrow({
      where: { id: (again.body as { id: string }).id },
    });
    expect(second.eventKey).toBe(`reenvio:${id}:2`);
  });

  it("no cambia el pedido", async () => {
    const { token } = await session("admin");
    const { id, order: o } = await emailWithStatus("failed");
    const before = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });

    expect((await resend(id, headers(token))).status).toBe(202);
    await worker(id, new FakeEmailSender()).runOnce();

    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).toEqual(before);
  });

  it("Operador: 403, y no crea nada", async () => {
    const { token } = await session("operator");
    const { id } = await emailWithStatus("failed");

    const res = await resend(id, headers(token));
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("FORBIDDEN");
    expect(await prisma.emailLog.count({ where: { resendOfId: id } })).toBe(0);
  });

  it("sin CSRF: 403 CSRF_FAILED; sin sesión: 401", async () => {
    const { token } = await session("admin");
    const { id } = await emailWithStatus("failed");

    const noCsrf = await resend(id, headers(token, false));
    expect(noCsrf.status).toBe(403);
    expect((noCsrf.body as { code: string }).code).toBe("CSRF_FAILED");

    const noSession = await resend(id, headers());
    expect(noSession.status).toBe(401);
    expect(await prisma.emailLog.count({ where: { resendOfId: id } })).toBe(0);
  });

  it.each(["sent", "pending"] as const)("un correo %s no se reenvía (409)", async (status) => {
    const { token } = await session("admin");
    const { id } = await emailWithStatus(status);

    const res = await resend(id, headers(token));
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe(
      "Solo se reenvía un correo fallido o con resultado incierto.",
    );
  });

  it("dos clics simultáneos crean un solo reenvío", async () => {
    const { token } = await session("admin");
    const { id } = await emailWithStatus("failed");

    const results = await Promise.all([resend(id, headers(token)), resend(id, headers(token))]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(await prisma.emailLog.count({ where: { resendOfId: id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "email.resent", resourceId: id } })).toBe(
      1,
    );
  });

  it("la recuperación de contraseña no se reenvía (409)", async () => {
    const { user, token } = await session("admin");
    const eventKey = emailEventKey("password_recovery", user.id, randomUUID());
    const { emailLogId } = await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "password_recovery",
        recipient: user.email,
        eventKey,
        data: { userId: user.id },
      }),
    );
    await prisma.emailLog.update({ where: { id: emailLogId ?? "" }, data: { status: "failed" } });

    expect((await resend(emailLogId ?? "", headers(token))).status).toBe(409);
  });

  it("id inexistente: 404; id inválido: 422; otro método: 405", async () => {
    const { token } = await session("admin");
    expect((await resend(randomUUID(), headers(token))).status).toBe(404);
    expect((await resend("no-es-uuid", headers(token))).status).toBe(422);
    const get = await request(app)
      .get(`/api/v1/admin/emails/${randomUUID()}/resend`)
      .set(headers(token));
    expect(get.status).toBe(405);
    expect(get.headers.allow).toContain("POST");
  });
});

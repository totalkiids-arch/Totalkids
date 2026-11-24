import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { createStaffUser, resetPassword } from "../src/services/auth.js";
import { enqueueEmail } from "../src/services/email/enqueue.js";
import { emailEventKey } from "../src/services/email/events.js";
import { FakeEmailSender } from "../src/services/email/fake-sender.js";
import { unsubscribeWithToken } from "../src/services/newsletter.js";
import { createEmailWorker, RETRY_DELAYS_MS } from "../src/services/email/worker.js";

// Worker de correos (LN-14, SRS 4.4.3) contra totalkids_test. Cada test trabaja
// con su propio "scope" (texto en la event_key) para no tomar trabajos de otros
// archivos que corren en paralelo. Nunca se usa la red: fetch está espiado.
const url = process.env.TEST_DATABASE_URL;

const MINUTE = 60_000;
const SITE = "https://tienda.example.com";

describe.skipIf(!url)("worker de correos (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const logger = createLogger("silent", false);
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    // Ningún correo de los tests llegó a la red (ni a Brevo).
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Reloj controlable: parte un poco adelante para que los trabajos estén vencidos. */
  function clock() {
    let current = new Date(Date.now() + 1000);
    return {
      now: () => current,
      advance: (ms: number) => {
        current = new Date(current.getTime() + ms);
      },
    };
  }

  function worker(scope: string, sender: FakeEmailSender, now: () => Date, workerId?: string) {
    return createEmailWorker({
      prisma,
      sender,
      logger,
      now,
      ...(workerId ? { workerId } : {}),
      config: {
        siteUrl: SITE,
        batchSize: 50,
        pollIntervalMs: 10,
        lockTimeoutMs: 5 * MINUTE,
        scope,
      },
    });
  }

  async function enqueueDelivered(scope: string, n = 1) {
    const eventKey = emailEventKey("order_delivered", `${scope}-${String(n)}`);
    const { emailLogId } = await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "order_delivered",
        recipient: "ana@ejemplo.cl",
        eventKey,
        data: { orderNumber: 1000 + n, buyerName: "Ana" },
      }),
    );
    return { eventKey, emailLogId: emailLogId ?? "" };
  }

  async function state(eventKey: string) {
    const job = await prisma.outboxJob.findUniqueOrThrow({ where: { eventKey } });
    const log = await prisma.emailLog.findUniqueOrThrow({
      where: { eventKey },
      include: { attempts: { orderBy: { createdAt: "asc" } } },
    });
    return { job, log };
  }

  it("con el adaptador falso: encolar + correr deja el correo enviado con su intento", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const sender = new FakeEmailSender();
    const c = clock();

    expect(await worker(scope, sender, c.now).runOnce()).toEqual({ processed: 1, released: 0 });

    const { job, log } = await state(eventKey);
    expect(job).toMatchObject({
      status: "done",
      attempts: 1,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    });
    expect(job.processedAt).not.toBeNull();
    expect(log.status).toBe("sent");
    expect(log.providerMessageId).toMatch(/^fake-/);
    expect(log.attempts).toHaveLength(1);
    expect(log.attempts[0]).toMatchObject({ kind: "automatic", result: "sent", actorLabel: null });

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({
      to: "ana@ejemplo.cl",
      subject: "Tu pedido #TK-1001 fue entregado",
      tag: "order_delivered",
    });

    // Una segunda vuelta no lo vuelve a enviar.
    expect((await worker(scope, sender, c.now).runOnce()).processed).toBe(0);
    expect(sender.sent).toHaveLength(1);
  });

  it("un error definitivo (4xx) deja el correo fallido, sin reintento", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const sender = new FakeEmailSender().respondWith({
      outcome: "rejected",
      detail: "Brevo respondió 400 (invalid_parameter)",
    });

    await worker(scope, sender, clock().now).runOnce();

    const { job, log } = await state(eventKey);
    expect(job).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "Brevo respondió 400 (invalid_parameter)",
    });
    expect(log.status).toBe("failed");
    expect(log.attempts.map((a) => a.result)).toEqual(["failed"]);
  });

  it("un fallo reintentable se reintenta a 1, 5 y 15 minutos y luego queda dead", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const failure = { outcome: "retryable", detail: "Brevo respondió 503 (sin_codigo)" } as const;
    const sender = new FakeEmailSender().respondWith(failure, failure, failure, failure);
    const c = clock();
    const w = worker(scope, sender, c.now);

    // Envío inicial.
    const start = c.now().getTime();
    await w.runOnce();
    let s = await state(eventKey);
    expect(s.job).toMatchObject({ status: "pending", attempts: 1 });
    expect(s.job.nextRunAt.getTime()).toBe(start + RETRY_DELAYS_MS[0]);
    expect(s.log.status).toBe("pending");

    // Antes de tiempo no se reintenta.
    c.advance(RETRY_DELAYS_MS[0] - 1000);
    expect((await w.runOnce()).processed).toBe(0);

    const expected = [5 * MINUTE, 15 * MINUTE];
    for (const [i, delay] of expected.entries()) {
      c.advance(1000);
      const at = c.now().getTime();
      await w.runOnce();
      s = await state(eventKey);
      expect(s.job).toMatchObject({ status: "pending", attempts: i + 2 });
      expect(s.job.nextRunAt.getTime()).toBe(at + delay);
      c.advance(delay - 1000);
    }

    // Último reintento (4.º intento): se agota.
    c.advance(1000);
    await w.runOnce();
    s = await state(eventKey);
    expect(s.job).toMatchObject({ status: "dead", attempts: 4, lastError: failure.detail });
    expect(s.log.status).toBe("failed");
    expect(s.log.attempts.map((a) => a.result)).toEqual(["failed", "failed", "failed", "failed"]);
    expect(sender.sent).toHaveLength(4);

    // Ya no se toma más.
    c.advance(60 * MINUTE);
    expect((await w.runOnce()).processed).toBe(0);
  });

  it("un fallo seguido de éxito queda enviado", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const sender = new FakeEmailSender().respondWith({
      outcome: "retryable",
      detail: "Sin conexión con Brevo (ECONNREFUSED)",
    });
    const c = clock();
    const w = worker(scope, sender, c.now);

    await w.runOnce();
    c.advance(MINUTE);
    await w.runOnce();

    const { job, log } = await state(eventKey);
    expect(job).toMatchObject({ status: "done", attempts: 2, lastError: null });
    expect(log.status).toBe("sent");
    expect(log.attempts.map((a) => a.result)).toEqual(["failed", "sent"]);
  });

  it("un timeout queda incierto y no se reenvía a ciegas", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const sender = new FakeEmailSender().respondWith({
      outcome: "timeout",
      detail: "Brevo no respondió en 10000 ms",
    });
    const c = clock();
    const w = worker(scope, sender, c.now);

    await w.runOnce();
    c.advance(60 * MINUTE);
    expect((await w.runOnce()).processed).toBe(0);

    const { job, log } = await state(eventKey);
    expect(job).toMatchObject({ status: "failed", attempts: 1 });
    expect(log.status).toBe("uncertain");
    expect(log.attempts.map((a) => a.result)).toEqual(["timeout"]);
    expect(sender.sent).toHaveLength(1);
  });

  it("libera un bloqueo vencido de un worker caído y lo deja incierto, sin reenviar", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const c = clock();
    // Un worker lo tomó y murió a mitad del envío.
    await prisma.outboxJob.update({
      where: { eventKey },
      data: { status: "processing", attempts: 1, lockedAt: c.now(), lockedBy: "worker-caido" },
    });
    const sender = new FakeEmailSender();
    const w = worker(scope, sender, c.now);

    // Todavía no vence: no se toca.
    expect(await w.runOnce()).toEqual({ processed: 0, released: 0 });
    c.advance(5 * MINUTE + 1000);
    expect(await w.runOnce()).toEqual({ processed: 0, released: 1 });

    const { job, log } = await state(eventKey);
    expect(job).toMatchObject({ status: "failed", lockedAt: null, lockedBy: null });
    expect(log.status).toBe("uncertain");
    expect(log.attempts).toMatchObject([{ kind: "automatic", result: "timeout" }]);
    expect(sender.sent).toHaveLength(0);
  });

  it("dos workers en paralelo nunca procesan el mismo trabajo", async () => {
    const scope = randomUUID();
    const keys = [];
    for (let n = 1; n <= 12; n += 1) keys.push((await enqueueDelivered(scope, n)).eventKey);

    const other = createPrismaClient(url ?? "");
    try {
      const c = clock();
      const a = new FakeEmailSender();
      const b = new FakeEmailSender();
      const config = {
        siteUrl: SITE,
        batchSize: 4,
        pollIntervalMs: 10,
        lockTimeoutMs: 5 * MINUTE,
        scope,
      };
      const wa = createEmailWorker({
        prisma,
        sender: a,
        logger,
        now: c.now,
        config,
        workerId: "a",
      });
      const wb = createEmailWorker({
        prisma: other,
        sender: b,
        logger,
        now: c.now,
        config,
        workerId: "b",
      });

      // Varias vueltas simultáneas de ambos.
      for (let round = 0; round < 3; round += 1) {
        await Promise.all([wa.runOnce(), wb.runOnce()]);
      }

      expect(a.sent.length + b.sent.length).toBe(12);
      const subjects = [...a.sent, ...b.sent].map((e) => e.subject);
      expect(new Set(subjects).size).toBe(12);
      for (const key of keys) {
        const { job, log } = await state(key);
        expect(job).toMatchObject({ status: "done", attempts: 1 });
        expect(log.attempts).toHaveLength(1);
      }
    } finally {
      await other.$disconnect();
    }
  });

  it("start/stop: procesa en segundo plano y se detiene limpio", async () => {
    const scope = randomUUID();
    const { eventKey } = await enqueueDelivered(scope);
    const sender = new FakeEmailSender();
    const w = worker(scope, sender, clock().now);

    w.start();
    await vi.waitFor(async () => {
      expect((await state(eventKey)).log.status).toBe("sent");
    });
    await w.stop();
    expect(sender.sent).toHaveLength(1);
  });

  it("recuperación de contraseña: emite el token al enviar, sin guardarlo, y el enlace funciona", async () => {
    const scope = randomUUID();
    const user = await createStaffUser(prisma, {
      email: `recupera-${scope}@ejemplo.cl`,
      name: "Equipo",
      role: "operator",
      password: "contraseña-segura-del-taller",
    });
    const eventKey = emailEventKey("password_recovery", user.id, scope);
    await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "password_recovery",
        recipient: user.email,
        eventKey,
        data: { userId: user.id },
      }),
    );
    const sender = new FakeEmailSender();

    await worker(scope, sender, () => new Date()).runOnce();

    const { job, log } = await state(eventKey);
    expect(log.status).toBe("sent");
    expect(job.payload).toEqual({ userId: user.id });
    const link = /https:\/\/tienda\.example\.com\/admin\/restablecer\?token=([\w-]+)/.exec(
      sender.sent[0]?.text ?? "",
    );
    const token = decodeURIComponent(link?.[1] ?? "");
    expect(token).not.toBe("");
    // En la base solo queda el hash; ni el payload ni el error guardan el token.
    expect(JSON.stringify(job)).not.toContain(token);
    expect(
      await prisma.authToken.count({ where: { tokenHash: hashToken(token), usedAt: null } }),
    ).toBe(1);

    await resetPassword(prisma, { token, password: "otra-contraseña-más-segura" });
  });

  it("recuperación para una cuenta desactivada: falla sin enviar ni emitir token", async () => {
    const scope = randomUUID();
    const user = await createStaffUser(prisma, {
      email: `inactiva-${scope}@ejemplo.cl`,
      name: "Equipo",
      role: "operator",
      password: "contraseña-segura-del-taller",
    });
    const eventKey = emailEventKey("password_recovery", user.id, scope);
    await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "password_recovery",
        recipient: user.email,
        eventKey,
        data: { userId: user.id },
      }),
    );
    await prisma.user.update({ where: { id: user.id }, data: { status: "inactive" } });
    const sender = new FakeEmailSender();

    await worker(scope, sender, () => new Date()).runOnce();

    const { job, log } = await state(eventKey);
    expect(job.status).toBe("failed");
    expect(log.status).toBe("failed");
    expect(sender.sent).toHaveLength(0);
    expect(await prisma.authToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("baja del newsletter: emite el token al enviar; dado de baja, falla sin enviar", async () => {
    const scope = randomUUID();
    const subscriber = await prisma.newsletterSubscriber.create({
      data: {
        email: `baja-${scope}@ejemplo.cl`,
        consentedAt: new Date(),
        consentVersion: "v1",
        unsubscribeTokenHash: hashToken(scope),
      },
    });
    const enqueue = async (n: string) => {
      const eventKey = emailEventKey("newsletter_unsubscribe", subscriber.id, scope, n);
      await prisma.$transaction((tx) =>
        enqueueEmail(tx, {
          event: "newsletter_unsubscribe",
          recipient: subscriber.email,
          eventKey,
          data: { subscriberId: subscriber.id },
        }),
      );
      return eventKey;
    };
    try {
      const first = await enqueue("1");
      const sender = new FakeEmailSender();
      await worker(scope, sender, () => new Date()).runOnce();

      const { job, log } = await state(first);
      expect(log.status).toBe("sent");
      const link = /https:\/\/tienda\.example\.com\/suscripcion\/baja\?token=([\w-]+)/.exec(
        sender.sent[0]?.text ?? "",
      );
      const token = decodeURIComponent(link?.[1] ?? "");
      expect(token).not.toBe("");
      expect(JSON.stringify(job)).not.toContain(token);
      expect(await unsubscribeWithToken(prisma, token)).toBe(true);

      const second = await enqueue("2");
      await worker(scope, sender, () => new Date()).runOnce();
      expect((await state(second)).log.status).toBe("failed");
      expect(sender.sent).toHaveLength(1);
    } finally {
      const logs = await prisma.emailLog.findMany({ where: { recipient: subscriber.email } });
      await prisma.emailAttempt.deleteMany({ where: { emailId: { in: logs.map((l) => l.id) } } });
      await prisma.emailLog.deleteMany({ where: { recipient: subscriber.email } });
      await prisma.outboxJob.deleteMany({
        where: { id: { in: logs.flatMap((l) => (l.outboxJobId ? [l.outboxJobId] : [])) } },
      });
      await prisma.newsletterSubscriber.delete({ where: { id: subscriber.id } });
    }
  });

  it("los logs del worker no llevan destinatarios, cuerpos ni tokens", async () => {
    const scope = randomUUID();
    const lines: string[] = [];
    const captured = createLogger("debug", false, { write: (line: string) => lines.push(line) });
    const user = await createStaffUser(prisma, {
      email: `logs-${scope}@ejemplo.cl`,
      name: "Equipo",
      role: "operator",
      password: "contraseña-segura-del-taller",
    });
    await prisma.$transaction((tx) =>
      enqueueEmail(tx, {
        event: "password_recovery",
        recipient: user.email,
        eventKey: emailEventKey("password_recovery", user.id, scope),
        data: { userId: user.id },
      }),
    );
    const { eventKey } = await enqueueDelivered(scope);
    const sender = new FakeEmailSender(captured).respondWith(
      { outcome: "accepted", messageId: "m-1" },
      { outcome: "timeout", detail: "Brevo no respondió en 10000 ms" },
    );

    await createEmailWorker({
      prisma,
      sender,
      logger: captured,
      config: {
        siteUrl: SITE,
        batchSize: 10,
        pollIntervalMs: 10,
        lockTimeoutMs: 5 * MINUTE,
        scope,
      },
    }).runOnce();

    expect((await state(eventKey)).log.status).not.toBe("pending");
    const output = lines.join("\n");
    expect(output).toContain("Correo enviado");
    expect(output).toContain("Correo con resultado incierto");
    expect(output).not.toMatch(/@ejemplo\.cl|restablecer|token=|Hola/);
  });

  it("un trabajo sin registro de correo se cierra como fallido sin enviar", async () => {
    const scope = randomUUID();
    const job = await prisma.outboxJob.create({
      data: {
        type: "email.order_delivered",
        eventKey: `order_delivered:${scope}`,
        payload: { orderNumber: 1, buyerName: "Ana" },
      },
    });
    const sender = new FakeEmailSender();

    await worker(scope, sender, clock().now).runOnce();

    const after = await prisma.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after).toMatchObject({ status: "failed", lastError: "Trabajo sin registro de correo" });
    expect(sender.sent).toHaveLength(0);
  });
});

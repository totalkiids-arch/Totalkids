import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailEvent } from "../src/generated/prisma/enums.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { getAdminEmail } from "../src/services/admin-panel/emails.js";
import { enqueueEmail } from "../src/services/email/enqueue.js";
import { emailEventKey, type EmailDataInput } from "../src/services/email/events.js";
import { FakeEmailSender } from "../src/services/email/fake-sender.js";
import { recordPreviewSend } from "../src/services/email/preview.js";
import { chileDay, chileDayRange, countSentToday } from "../src/services/email/quota.js";
import { createEmailWorker } from "../src/services/email/worker.js";

// Límite diario de envíos (plan gratis de Brevo) contra totalkids_test, con el
// adaptador falso. Cada test usa su "scope" (texto en la event_key) y un día
// propio en el futuro, así la cuenta del día no se mezcla con otros archivos.
const url = process.env.TEST_DATABASE_URL;

const DAY = 24 * 3_600_000;
const SITE = "https://tienda.example.com";
const ADMIN = "equipo@ejemplo.cl";

describe.skipIf(!url)("límite diario de correos (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
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

  /** Reloj a las 12:00 de Chile de un día futuro distinto en cada test. */
  function clock() {
    const offsetDays = Math.floor(Math.random() * 20_000);
    let current = new Date(Date.UTC(2100, 0, 1, 15) + offsetDays * DAY);
    return {
      now: () => current,
      advance: (ms: number) => {
        current = new Date(current.getTime() + ms);
      },
    };
  }

  function setup(limit: number, reserve: number) {
    const scope = randomUUID();
    const sender = new FakeEmailSender();
    const c = clock();
    const logger = createLogger("silent", false);
    const warn = vi.spyOn(logger, "warn");
    const worker = createEmailWorker({
      prisma,
      sender,
      logger,
      now: c.now,
      config: {
        siteUrl: SITE,
        batchSize: 50,
        pollIntervalMs: 10,
        lockTimeoutMs: 5 * 60_000,
        scope,
        dailyQuota: { limit, reserve, adminEmail: ADMIN },
      },
    });
    let n = 0;
    async function enqueue<E extends EmailEvent>(event: E, data: EmailDataInput<E>) {
      n += 1;
      const eventKey = emailEventKey(event, `${scope}-${String(n)}`);
      await prisma.$transaction((tx) =>
        enqueueEmail(tx, { event, recipient: "ana@ejemplo.cl", eventKey, data }),
      );
      return eventKey;
    }
    const delivered = () => enqueue("order_delivered", { orderNumber: 1001, buyerName: "Ana" });
    const rejected = () =>
      enqueue("payment_rejected", { orderNumber: 1002, buyerName: "Ana", outcome: "rejected" });
    return { scope, sender, c, warn, worker, delivered, rejected };
  }

  async function job(eventKey: string) {
    const job = await prisma.outboxJob.findUniqueOrThrow({ where: { eventKey } });
    const log = await prisma.emailLog.findUniqueOrThrow({ where: { eventKey } });
    return { job, log };
  }

  it("reserva: solo los críticos; límite: pausa todo y alerta una vez; día siguiente: se reanuda", async () => {
    // Límite 5 con reserva 2: 3 envíos normales, 1 crítico y el último para la alerta.
    const t = setup(5, 2);
    const first = [await t.delivered(), await t.delivered(), await t.delivered()];

    expect((await t.worker.runOnce()).processed).toBe(3);
    expect(t.worker.quotaMode).toBe("normal");
    for (const key of first) expect((await job(key)).log.status).toBe("sent");

    // Entra en la reserva: llegan 2 no críticos y 2 críticos.
    const waiting = [await t.delivered(), await t.delivered()];
    const critical = [await t.rejected(), await t.rejected()];
    expect((await t.worker.runOnce()).processed).toBe(1);
    expect(t.worker.quotaMode).toBe("reserve");
    expect(t.sender.sent.at(-1)?.tag).toBe("payment_rejected");
    // Los no críticos siguen pendientes, sin intentos gastados ni marcados fallidos.
    for (const key of waiting) {
      const { job: j, log } = await job(key);
      expect(j).toMatchObject({ status: "pending", attempts: 0 });
      expect(log.status).toBe("pending");
    }

    // Llega al límite: sale solo la alerta al equipo (el último envío del día).
    expect((await t.worker.runOnce()).processed).toBe(1);
    expect(t.worker.quotaMode).toBe("paused");
    const alert = t.sender.sent.at(-1);
    expect(alert).toMatchObject({ to: ADMIN, tag: "email_quota_alert" });
    expect(alert?.subject).toBe("Correos en pausa: se alcanzó el límite diario (5)");

    // Pausado: no sale nada más, ni siquiera el crítico, y la alerta no se repite.
    expect((await t.worker.runOnce()).processed).toBe(0);
    expect((await t.worker.runOnce()).processed).toBe(0);
    expect(t.sender.sent).toHaveLength(5);
    const alerts = await prisma.emailLog.count({
      where: { event: "email_quota_alert", eventKey: { contains: t.scope } },
    });
    expect(alerts).toBe(1);
    const pendingCritical = critical.filter((k) => k !== critical[0]);
    for (const key of [...waiting, ...pendingCritical]) {
      expect((await job(key)).job).toMatchObject({ status: "pending", attempts: 0 });
    }
    // Un warn por modo y día (reserva y pausa), no uno por vuelta.
    const messages = t.warn.mock.calls.map((call) => String(call[1]));
    expect(messages.filter((m) => m.includes("reserva"))).toHaveLength(1);
    expect(messages.filter((m) => m.includes("pausa"))).toHaveLength(1);

    // Día siguiente (hora de Chile): se reanuda y salen los que esperaban.
    t.c.advance(DAY);
    expect((await t.worker.runOnce()).processed).toBe(3);
    expect(t.worker.quotaMode).toBe("normal");
    for (const key of [...waiting, ...pendingCritical]) {
      const { job: j, log } = await job(key);
      expect(j).toMatchObject({ status: "done", attempts: 1 });
      expect(log.status).toBe("sent");
    }
  });

  it("el cambio de día es a la medianoche de Chile", async () => {
    const t = setup(3, 1);
    await t.delivered();
    await t.delivered();
    expect((await t.worker.runOnce()).processed).toBe(2);
    // Lo usado (2) ya es el último envío: pausado, sale solo la alerta.
    expect((await t.worker.runOnce()).processed).toBe(1);
    expect(t.worker.quotaMode).toBe("paused");
    const waiting = await t.delivered();

    // 23:59 del mismo día de Chile: sigue en pausa.
    const { day: today, end } = chileDayRange(t.c.now());
    t.c.advance(end.getTime() - t.c.now().getTime() - 60_000);
    expect((await t.worker.runOnce()).processed).toBe(0);
    // 00:01 del día siguiente: se reanuda.
    t.c.advance(2 * 60_000);
    expect(chileDay(t.c.now())).not.toBe(today);
    expect((await t.worker.runOnce()).processed).toBe(1);
    expect((await job(waiting)).log.status).toBe("sent");
  });

  it("un 429 de Brevo sigue con su reintento y no cuenta como enviado", async () => {
    const t = setup(5, 2);
    const key = await t.rejected();
    t.sender.respondWith({
      outcome: "retryable",
      detail: "Brevo respondió 429 (too_many_requests)",
    });

    expect((await t.worker.runOnce()).processed).toBe(1);
    const { job: j, log } = await job(key);
    expect(j).toMatchObject({ status: "pending", attempts: 1 });
    expect(j.nextRunAt.getTime()).toBe(t.c.now().getTime() + 60_000);
    expect(log.status).toBe("pending");
    expect(await countSentToday(prisma, t.c.now(), `%${t.scope}%`)).toMatchObject({ used: 0 });

    t.c.advance(60_000);
    expect((await t.worker.runOnce()).processed).toBe(1);
    expect((await job(key)).log.status).toBe("sent");
    expect(await countSentToday(prisma, t.c.now(), `%${t.scope}%`)).toMatchObject({ used: 1 });
  });

  it("los envíos de muestra (email:preview --to) cuentan en el límite del día", async () => {
    const t = setup(5, 2);
    const at = t.c.now();
    for (const slug of ["01", "02", "03"]) {
      await recordPreviewSend(prisma, {
        slug: `${t.scope}-${slug}`,
        event: "order_received",
        recipient: "pruebas@ejemplo.cl",
        result: { outcome: "accepted", messageId: "m-1" },
        at,
      });
    }
    // Sin trabajo en outbox: el worker no los toma, pero la cuenta los incluye.
    expect(await countSentToday(prisma, at, `%${t.scope}%`)).toMatchObject({ used: 3 });
    await t.delivered();
    expect((await t.worker.runOnce()).processed).toBe(0);
    expect(t.worker.quotaMode).toBe("reserve");

    const sample = await prisma.emailLog.findFirstOrThrow({
      where: { eventKey: { contains: t.scope }, event: "order_received" },
    });
    expect(sample.eventKey.startsWith("preview:")).toBe(true);
    expect(sample.outboxJobId).toBeNull();

    // En el panel de Correos se distingue como «Muestra» y no se puede reenviar.
    const detail = await getAdminEmail(prisma, sample.id, "admin");
    expect(detail.reference).toEqual({ kind: "sample", id: sample.id, label: "Muestra" });
    expect(detail.canResend).toBe(false);
  });
});

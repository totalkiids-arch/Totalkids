import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { issueUnsubscribeToken } from "../src/services/newsletter.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Formularios públicos (LN-08) contra totalkids_test. Se omite sin
// TEST_DATABASE_URL. Crea sus datos y los borra al terminar.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("solicitudes de servicio y newsletter (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const id = Math.random().toString(36).slice(2, 8);
  const mail = (name: string) => `${name}-${id}@correo.cl`;
  const requests: string[] = [];

  // Cada prueba arma su app: los límites por IP son por router.
  const post = (path: string, body: object) =>
    request(buildTestApp({ prisma })).post(`/api/v1${path}`).set(csrfHeaders()).send(body);

  afterAll(async () => {
    const emails = [mail("ana"), mail("baja"), mail("vuelve"), mail("nadie")];
    const logs = await prisma.emailLog.findMany({
      where: {
        OR: [{ serviceRequestId: { in: requests } }, { recipient: { in: emails } }],
      },
      select: { id: true, outboxJobId: true },
    });
    await prisma.emailLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });
    await prisma.outboxJob.deleteMany({
      where: { id: { in: logs.flatMap((l) => (l.outboxJobId ? [l.outboxJobId] : [])) } },
    });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: requests } } });
    await prisma.newsletterSubscriber.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  // ── Solicitudes (RF-24) ────────────────────────────────────────────────────

  it("guarda la solicitud con la privacidad aceptada y avisa a ambas partes", async () => {
    const res = await post("/service-requests", {
      service: "armado",
      name: "Ana Pérez",
      email: mail("Ana").toUpperCase(),
      phone: "9 1234 5678",
      commune: "Temuco",
      childrenAges: "3 y 6 años",
      preferredDate: "2099-12-20",
      message: "Necesito armar una cuna en el dormitorio.",
      privacyAccepted: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^SOL-\d+$/);

    const number = Number(String(res.body.reference).slice(4));
    const saved = await prisma.serviceRequest.findUniqueOrThrow({ where: { number } });
    requests.push(saved.id);
    expect(saved).toMatchObject({
      service: "armado",
      email: mail("ana"),
      phone: "+56912345678",
      childrenAges: "3 y 6 años",
      status: "new",
      privacyVersion: "v1-provisional",
    });
    expect(saved.preferredDate?.toISOString().slice(0, 10)).toBe("2099-12-20");

    const logs = await prisma.emailLog.findMany({
      where: { serviceRequestId: saved.id },
      orderBy: { eventKey: "asc" },
    });
    expect(logs.map((l) => [l.event, l.recipient, l.eventKey])).toEqual([
      ["service_request", "equipo@example.com", `service_request:${saved.id}:admin`],
      ["service_request", mail("ana"), `service_request:${saved.id}:requester`],
    ]);
  });

  it("valida la solicitud: servicio, correo, mensaje, fecha pasada y privacidad", async () => {
    const res = await post("/service-requests", {
      service: "otro",
      name: "",
      email: "ana@",
      phone: "123",
      preferredDate: "2020-01-01",
      message: "corto",
      privacyAccepted: false,
    });
    expect(res.status).toBe(422);
    const paths = (res.body.details.issues as { path: string }[]).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "service",
        "name",
        "email",
        "phone",
        "preferredDate",
        "message",
        "privacyAccepted",
      ]),
    );
  });

  // ── Newsletter (RF-25, RF-35) ──────────────────────────────────────────────

  it("suscribe con consentimiento explícito, fecha y versión; sin consentimiento, 422", async () => {
    const rejected = await post("/newsletter", {
      email: mail("baja"),
      consent: false,
      consentVersion: "v1",
    });
    expect(rejected.status).toBe(422);

    const res = await post("/newsletter", {
      email: mail("baja"),
      consent: true,
      consentVersion: "v1-provisional",
    });
    expect(res.status).toBe(202);
    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { email: mail("baja") },
    });
    expect(row).toMatchObject({ status: "active", consentVersion: "v1-provisional" });
    expect(Date.now() - row.consentedAt.getTime()).toBeLessThan(60_000);
  });

  it("pedir el enlace responde igual exista o no, y solo encola para un suscriptor activo", async () => {
    for (const email of [mail("baja"), mail("nadie")]) {
      const res = await post("/newsletter/unsubscribe-link", { email });
      expect(res.status, email).toBe(202);
    }
    const logs = await prisma.emailLog.findMany({
      where: { event: "newsletter_unsubscribe", recipient: { in: [mail("baja"), mail("nadie")] } },
    });
    expect(logs.map((l) => l.recipient)).toEqual([mail("baja")]);
    // El outbox lleva solo el id, nunca el token.
    const job = await prisma.outboxJob.findUniqueOrThrow({
      where: { id: logs[0]?.outboxJobId ?? "" },
    });
    expect(Object.keys(job.payload as object)).toEqual(["subscriberId"]);
  });

  it("el enlace da de baja sin borrar nada; repetirlo responde igual; un token ajeno, 404", async () => {
    const subscriber = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { email: mail("baja") },
    });
    // Lo que hace el worker al enviar el correo.
    const token = (await issueUnsubscribeToken(prisma, subscriber.id)) ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } }))
        .unsubscribeTokenHash,
    ).toBe(hashToken(token));

    expect((await post("/newsletter/unsubscribe", { token })).status).toBe(204);
    expect(
      await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } }),
    ).toMatchObject({ status: "unsubscribed", unsubscribedBy: "Suscriptor" });
    expect((await post("/newsletter/unsubscribe", { token })).status).toBe(204);

    // Dado de baja: ya no se emiten enlaces nuevos (el worker rechaza el correo).
    expect(await issueUnsubscribeToken(prisma, subscriber.id)).toBeNull();

    const other = await post("/newsletter/unsubscribe", { token: "x".repeat(43) });
    expect(other.status).toBe(404);
    expect((await post("/newsletter/unsubscribe", { token: "corto" })).status).toBe(422);
  });

  it("volver a suscribirse reactiva con el consentimiento nuevo e invalida los enlaces viejos", async () => {
    await post("/newsletter", { email: mail("vuelve"), consent: true, consentVersion: "v1" });
    const before = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { email: mail("vuelve") },
    });
    const token = (await issueUnsubscribeToken(prisma, before.id)) ?? "";
    expect((await post("/newsletter/unsubscribe", { token })).status).toBe(204);

    const again = await post("/newsletter", {
      email: mail("vuelve"),
      consent: true,
      consentVersion: "v2",
    });
    expect(again.status).toBe(202);
    expect(
      await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: before.id } }),
    ).toMatchObject({
      status: "active",
      consentVersion: "v2",
      unsubscribedAt: null,
      unsubscribedBy: null,
    });
    expect((await post("/newsletter/unsubscribe", { token })).status).toBe(404);
  });

  it("los formularios exigen CSRF y solo admiten POST", async () => {
    const app = buildTestApp({ prisma });
    for (const path of [
      "/service-requests",
      "/newsletter",
      "/newsletter/unsubscribe-link",
      "/newsletter/unsubscribe",
    ]) {
      expect((await request(app).post(`/api/v1${path}`).send({})).status, path).toBe(403);
      expect((await request(app).get(`/api/v1${path}`)).status, path).toBe(405);
    }
  });
});

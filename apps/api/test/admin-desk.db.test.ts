import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Solicitudes de servicio y suscriptores del panel (LN-16, RF-24, RF-25, RF-29)
// contra totalkids_test. Cada caso corre en una transacción que se deshace.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1/admin${path}`;

async function newRequest(
  db: PrismaClient,
  data: Partial<{ service: string; name: string; createdAt: Date }> = {},
) {
  return db.serviceRequest.create({
    data: {
      service: data.service ?? "armado",
      name: data.name ?? "María José Peña",
      email: `maria-${randomUUID().slice(0, 8)}@correo.cl`,
      phone: "+56911111111",
      commune: "Temuco",
      message: "Necesito armar una cama nido el sábado.",
      privacyAcceptedAt: new Date(),
      privacyVersion: "v1-provisional",
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
  });
}

async function newSubscriber(db: PrismaClient, consentedAt = new Date()) {
  return db.newsletterSubscriber.create({
    data: {
      email: `sub-${randomUUID().slice(0, 8)}@correo.cl`,
      consentedAt,
      consentVersion: "v1-provisional",
      unsubscribeTokenHash: randomUUID(),
    },
  });
}

describe.skipIf(!url)("/admin/service-requests y /admin/newsletter (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  let admin = { token: "", name: "", id: "" };
  let operator = { token: "", name: "", id: "" };

  beforeAll(async () => {
    const a = await panelSession(prisma, "admin");
    const o = await panelSession(prisma, "operator");
    admin = { token: a.token, name: a.user.name, id: a.user.id };
    operator = { token: o.token, name: o.user.name, id: o.user.id };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const inTx = (fn: (db: PrismaClient, app: ReturnType<typeof buildTestApp>) => Promise<void>) =>
    inRollback(prisma, async (db) => fn(db, buildTestApp({ prisma: db })));

  it("solicitudes: Administrador y Operador; sin sesión 401; sin CSRF 403", async () => {
    await inTx(async (db, app) => {
      const r = await newRequest(db);
      expect((await request(app).get(api("/service-requests"))).status).toBe(401);
      for (const token of [admin.token, operator.token]) {
        const res = await request(app).get(api("/service-requests")).set(panelHeaders(token));
        expect(res.status).toBe(200);
      }
      const noCsrf = await request(app)
        .patch(api(`/service-requests/${r.id}`))
        .set(panelHeaders(operator.token, false))
        .send({ status: "in_progress" });
      expect(noCsrf.status).toBe(403);
    });
  });

  it("lista con filtros, más recientes primero y conteo por estado", async () => {
    await inTx(async (db, app) => {
      const tag = randomUUID().slice(0, 6);
      const old = await newRequest(db, {
        name: `Ana ${tag}`,
        createdAt: new Date(Date.now() - 86_400_000),
      });
      const recent = await newRequest(db, { name: `Ana ${tag}`, service: "diseno" });
      await db.serviceRequest.update({ where: { id: old.id }, data: { status: "resolved" } });
      const h = panelHeaders(admin.token);

      const all = await request(app)
        .get(api(`/service-requests?q=${tag}`))
        .set(h);
      expect(all.body.items.map((i: { id: string }) => i.id)).toEqual([recent.id, old.id]);
      expect(all.body.counts).toEqual({ new: 1, in_progress: 0, resolved: 1 });
      expect(all.body.items[0]).toMatchObject({
        reference: `SOL-${String(recent.number)}`,
        serviceLabel: "Diseño de espacios",
        statusLabel: "Nueva",
      });

      const filtered = await request(app)
        .get(api(`/service-requests?q=${tag}&status=resolved&service=armado`))
        .set(h);
      expect(filtered.body.items.map((i: { id: string }) => i.id)).toEqual([old.id]);
      expect(filtered.body.meta).toMatchObject({ total: 1, page: 1 });

      const byRef = await request(app)
        .get(api(`/service-requests?q=SOL-${String(old.number)}`))
        .set(h);
      expect(byRef.body.items[0].id).toBe(old.id);
      expect((await request(app).get(api("/service-requests?status=x")).set(h)).status).toBe(422);
    });
  });

  it("transiciones de UI-14: Nueva → En gestión → Resuelta → reabrir; nunca a Nueva", async () => {
    await inTx(async (db, app) => {
      const r = await newRequest(db);
      const patch = (token: string, body: object) =>
        request(app)
          .patch(api(`/service-requests/SOL-${String(r.number)}`))
          .set(panelHeaders(token))
          .send(body);

      const step1 = await patch(operator.token, { status: "in_progress" });
      expect(step1.status).toBe(200);
      expect(step1.body).toMatchObject({
        status: "in_progress",
        statusOptions: ["in_progress", "resolved"],
      });
      const step2 = await patch(admin.token, {
        status: "resolved",
        note: "Armado el sábado 10 h.",
      });
      expect(step2.body).toMatchObject({
        status: "resolved",
        note: "Armado el sábado 10 h.",
        hasNote: true,
      });

      const back = await patch(admin.token, { status: "new" });
      expect(back.status).toBe(409);
      expect(back.body.message).toBe("Una solicitud resuelta no puede pasar a «Nueva».");
      expect(back.body.details.field).toBe("status");

      const reopen = await patch(operator.token, { status: "in_progress" });
      expect(reopen.body.status).toBe("in_progress");

      const same = await patch(operator.token, { status: "in_progress" });
      expect(same.status).toBe(422);
      expect(same.body.message).toBe("No hay cambios para guardar.");

      const long = await patch(operator.token, { note: "x".repeat(1001) });
      expect(long.status).toBe(422);
      expect(long.body.details.issues[0]).toMatchObject({
        path: "note",
        message: "Usa como máximo 1000 caracteres.",
      });

      const cleared = await patch(operator.token, { note: "  " });
      expect(cleared.body.note).toBe("");

      const detail = await request(app)
        .get(api(`/service-requests/${r.id}`))
        .set(panelHeaders(operator.token));
      expect(detail.status).toBe(200);
      expect(detail.body.message).toBe("Necesito armar una cama nido el sábado.");
      const history = detail.body.history as {
        actor: string;
        actorName: string | null;
        actorUserId: string | null;
        change: string;
      }[];
      expect(history.map((h) => [h.actor, h.change])).toEqual([
        ["Solicitante", "Solicitud recibida"],
        ["Operador", "Estado: Nueva → En gestión"],
        ["Administrador", "Estado: En gestión → Resuelta · Nota interna actualizada"],
        ["Operador", "Estado: Resuelta → En gestión"],
        ["Operador", "Nota interna borrada"],
      ]);
      expect(history[1]).toMatchObject({ actorName: operator.name, actorUserId: operator.id });
      // La nota no se copia a la auditoría.
      const audit = await db.auditLog.findMany({ where: { resourceId: r.id } });
      expect(JSON.stringify(audit.map((a) => a.details))).not.toContain("sábado 10 h");
    });
  });

  it("resolver directo desde Nueva y 404 para una referencia inexistente", async () => {
    await inTx(async (db, app) => {
      const r = await newRequest(db);
      const res = await request(app)
        .patch(api(`/service-requests/${r.id}`))
        .set(panelHeaders(operator.token))
        .send({ status: "resolved" });
      expect(res.body.status).toBe("resolved");
      const missing = await request(app)
        .get(api("/service-requests/SOL-999999999"))
        .set(panelHeaders(operator.token));
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe("Esa solicitud ya no existe.");
    });
  });

  it("suscriptores: solo Administrador (Operador 403 al leer y al dar de baja)", async () => {
    await inTx(async (db, app) => {
      const s = await newSubscriber(db);
      expect((await request(app).get(api("/newsletter"))).status).toBe(401);
      expect(
        (await request(app).get(api("/newsletter")).set(panelHeaders(operator.token))).status,
      ).toBe(403);
      const asOperator = await request(app)
        .post(api(`/newsletter/${s.id}/unsubscribe`))
        .set(panelHeaders(operator.token));
      expect(asOperator.status).toBe(403);
    });
  });

  it("lista con filtro y registra la baja conservando el registro", async () => {
    await inTx(async (db, app) => {
      const older = await newSubscriber(db, new Date(Date.now() - 86_400_000));
      const newer = await newSubscriber(db);
      const h = panelHeaders(admin.token);
      const list = await request(app).get(api("/newsletter?q=sub-")).set(h);
      const ids = (list.body.items as { id: string }[]).map((i) => i.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));

      const res = await request(app)
        .post(api(`/newsletter/${older.id}/unsubscribe`))
        .set(h);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: older.id,
        status: "unsubscribed",
        statusLabel: "Dado de baja",
        unsubscribedBy: "Administrador",
      });
      const stored = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: older.id } });
      expect(stored.email).toBe(older.email);

      const again = await request(app)
        .post(api(`/newsletter/${older.id}/unsubscribe`))
        .set(h);
      expect(again.status).toBe(409);
      expect(again.body.message).toBe("Ese suscriptor ya estaba dado de baja.");
      const unchanged = await db.newsletterSubscriber.findUniqueOrThrow({
        where: { id: older.id },
      });
      expect(unchanged.unsubscribedAt).toEqual(stored.unsubscribedAt);

      const bajas = await request(app).get(api("/newsletter?status=unsubscribed&q=sub-")).set(h);
      expect((bajas.body.items as { id: string }[]).map((i) => i.id)).toContain(older.id);
      expect((bajas.body.items as { id: string }[]).map((i) => i.id)).not.toContain(newer.id);

      const audit = await db.auditLog.findFirst({ where: { resourceId: older.id } });
      expect(audit).toMatchObject({ action: "newsletter.unsubscribed", actorUserId: admin.id });
      expect(JSON.stringify(audit?.details)).not.toContain(older.email);

      const missing = await request(app)
        .post(api(`/newsletter/${randomUUID()}/unsubscribe`))
        .set(h);
      expect(missing.status).toBe(404);
    });
  });
});

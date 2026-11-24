import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { enqueueEmail } from "../src/services/email/enqueue.js";
import { buildTestApp } from "./helpers.js";
import { createOrder, createVariant } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Lecturas del panel (LN-16): correos, actividad, resumen y pagos, contra
// totalkids_test. Cada caso corre en una transacción que se deshace.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1/admin${path}`;

describe.skipIf(!url)("/admin/emails, /admin/activity, /admin/summary y /admin/payments", () => {
  const prisma = createPrismaClient(url ?? "");
  let admin = { token: "", id: "", name: "" };
  let operator = { token: "", id: "", name: "" };

  beforeAll(async () => {
    const a = await panelSession(prisma, "admin");
    const o = await panelSession(prisma, "operator");
    await prisma.user.update({ where: { id: a.user.id }, data: { name: "Ana Administradora" } });
    await prisma.user.update({ where: { id: o.user.id }, data: { name: "Óscar Operador" } });
    admin = { token: a.token, id: a.user.id, name: "Ana Administradora" };
    operator = { token: o.token, id: o.user.id, name: "Óscar Operador" };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const inTx = (fn: (db: PrismaClient, app: ReturnType<typeof buildTestApp>) => Promise<void>) =>
    inRollback(prisma, async (db) => fn(db, buildTestApp({ prisma: db })));

  it("permisos: correos, resumen y pagos para ambos roles; actividad solo Administrador", async () => {
    const app = buildTestApp({ prisma });
    for (const path of ["/emails", "/summary", "/payments", "/activity"]) {
      expect((await request(app).get(api(path))).status, path).toBe(401);
      expect((await request(app).get(api(path)).set(panelHeaders(admin.token))).status, path).toBe(
        200,
      );
    }
    for (const path of ["/emails", "/summary", "/payments"]) {
      expect(
        (await request(app).get(api(path)).set(panelHeaders(operator.token))).status,
        path,
      ).toBe(200);
    }
    expect(
      (await request(app).get(api("/activity")).set(panelHeaders(operator.token))).status,
    ).toBe(403);
  });

  it("correos: filtros por pedido, evento y estado; el Operador no ve recuperaciones", async () => {
    await inTx(async (db, app) => {
      const order = await createOrder(db);
      const tag = randomUUID();
      await enqueueEmail(db, {
        event: "order_shipped",
        recipient: order.buyerEmail,
        eventKey: `order_shipped:${order.id}`,
        orderId: order.id,
        data: {
          method: "pickup",
          orderNumber: order.number,
          buyerName: order.buyerName,
          pickupDetails: "Taller Total Kids, Temuco",
        },
      });
      const user = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
      await enqueueEmail(db, {
        event: "password_recovery",
        recipient: user.email,
        eventKey: `password_recovery:${user.id}:${tag}`,
        data: { userId: user.id },
      });
      const shipped = await db.emailLog.findUniqueOrThrow({
        where: { eventKey: `order_shipped:${order.id}` },
      });
      await db.emailLog.update({ where: { id: shipped.id }, data: { status: "failed" } });
      await db.emailAttempt.create({
        data: { emailId: shipped.id, kind: "automatic", result: "failed", detail: "400" },
      });

      const byOrder = await request(app)
        .get(api(`/emails?order=TK-${String(order.number)}`))
        .set(panelHeaders(operator.token));
      expect(byOrder.status).toBe(200);
      expect(byOrder.body.items).toHaveLength(1);
      expect(byOrder.body.items[0]).toMatchObject({
        event: "order_shipped",
        eventLabel: "Pedido despachado",
        status: "failed",
        statusLabel: "Fallido",
        reference: { kind: "order", label: `TK-${String(order.number)}` },
        attemptsCount: 1,
        canResend: true,
      });
      expect(byOrder.body.counts).toMatchObject({ failed: 1 });

      const failed = await request(app)
        .get(api(`/emails?order=${order.id}&status=sent`))
        .set(panelHeaders(admin.token));
      expect(failed.body.items).toHaveLength(0);

      const recovery = await db.emailLog.findUniqueOrThrow({
        where: { eventKey: `password_recovery:${user.id}:${tag}` },
      });
      const asOperator = await request(app)
        .get(api(`/emails/${recovery.id}`))
        .set(panelHeaders(operator.token));
      expect(asOperator.status).toBe(404);
      const opList = await request(app)
        .get(api("/emails?event=password_recovery"))
        .set(panelHeaders(operator.token));
      expect(opList.body.items).toHaveLength(0);
      const asAdmin = await request(app)
        .get(api(`/emails/${recovery.id}`))
        .set(panelHeaders(admin.token));
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body).toMatchObject({ event: "password_recovery", canResend: false });

      const detail = await request(app)
        .get(api(`/emails/${shipped.id}`))
        .set(panelHeaders(operator.token));
      expect(detail.body.attempts[0]).toMatchObject({
        kind: "automatic",
        result: "failed",
        resultLabel: "Rechazado",
      });
      expect(
        (await request(app).get(api("/emails?order=xx")).set(panelHeaders(admin.token))).status,
      ).toBe(422);
    });
  });

  it("actividad: nombre de la persona, filtro por persona y área, y conteos", async () => {
    await inTx(async (db, app) => {
      const code = `ACT${randomUUID().slice(0, 6).toUpperCase()}`;
      const created = await request(app)
        .post(api("/coupons"))
        .set(panelHeaders(admin.token))
        .send({
          code,
          kind: "amount",
          value: 5000,
          startsOn: "2026-01-01",
          endsOn: "2026-12-31",
          maxUses: 10,
        });
      expect(created.status).toBe(201);
      const r = await db.serviceRequest.create({
        data: {
          service: "armado",
          name: "Luis",
          email: `luis-${randomUUID().slice(0, 6)}@correo.cl`,
          message: "Armar un velador de madera.",
          privacyAcceptedAt: new Date(),
          privacyVersion: "v1",
        },
      });
      await request(app)
        .patch(api(`/service-requests/${r.id}`))
        .set(panelHeaders(operator.token))
        .send({ status: "in_progress" });

      const mine = await request(app)
        .get(api(`/activity?actor=${admin.id}&area=configuracion`))
        .set(panelHeaders(admin.token));
      expect(mine.status).toBe(200);
      expect(mine.body.items[0]).toMatchObject({
        area: "configuracion",
        areaLabel: "Configuración",
        action: "coupon.created",
        description: "Cupón creado",
        actorUserId: admin.id,
        actorName: "Ana Administradora",
        actorLabel: "Administrador",
        reference: { type: "coupon", label: code },
      });
      expect(
        (mine.body.items as { actorUserId: string }[]).every((i) => i.actorUserId === admin.id),
      ).toBe(true);

      const op = await request(app)
        .get(api(`/activity?actor=${operator.id}`))
        .set(panelHeaders(admin.token));
      expect(op.body.items[0]).toMatchObject({
        area: "solicitudes",
        actorName: "Óscar Operador",
        actorLabel: "Operador",
        description: "Seguimiento de solicitud: Estado: Nueva → En gestión",
        reference: { type: "service_request", label: `SOL-${String(r.number)}` },
      });
      expect(op.body.byArea.solicitudes).toBeGreaterThanOrEqual(1);
      expect(op.body.byArea.configuracion).toBe(0);
      const actors = op.body.actors as { id: string; name: string; role: string }[];
      expect(actors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: operator.id, name: "Óscar Operador", role: "Operador" }),
        ]),
      );
      // Los ingresos al panel no son actividad.
      const logins = await request(app)
        .get(api(`/activity?actor=${admin.id}&pageSize=100`))
        .set(panelHeaders(admin.token));
      expect(
        (logins.body.items as { action: string }[]).some((i) => i.action === "auth.login"),
      ).toBe(false);
      const bad = await request(app)
        .get(api("/activity?area=cocina"))
        .set(panelHeaders(admin.token));
      expect(bad.status).toBe(422);
    });
  });

  it("resumen: el Operador no recibe montos ni stock; los pagos en revisión se cuentan", async () => {
    await inTx(async (db, app) => {
      const before = await request(app).get(api("/summary")).set(panelHeaders(admin.token));
      await createOrder(db, { status: "in_review", payments: ["in_review"] });
      await createVariant(db, 2);
      const after = await request(app).get(api("/summary")).set(panelHeaders(admin.token));
      expect(after.body.paymentsInReview).toBe(before.body.paymentsInReview + 1);
      expect(after.body.byStatus.in_review).toBe(before.body.byStatus.in_review + 1);
      expect(after.body.recentOrders.length).toBeLessThanOrEqual(5);
      expect(after.body.sales).toMatchObject({ charged: expect.any(Number) as number });
      // La variante de prueba es de un borrador: también cuenta (no está inactivo).
      expect(after.body.lowStockVariants).toBe(before.body.lowStockVariants + 1);

      const op = await request(app).get(api("/summary")).set(panelHeaders(operator.token));
      expect(op.body).toMatchObject({ sales: null, lowStockVariants: null });
      expect(op.body.byStatus.in_review).toBe(after.body.byStatus.in_review);
    });
  });

  it("pagos: intentos del pedido, el último marcado como conciliable (LN-15)", async () => {
    await inTx(async (db, app) => {
      const order = await createOrder(db, {
        status: "in_review",
        payments: ["rejected", "in_review"],
      });
      const res = await request(app)
        .get(api(`/payments?order=TK-${String(order.number)}`))
        .set(panelHeaders(operator.token));
      expect(res.status).toBe(200);
      const rows = res.body.items as {
        attempt: number;
        current: boolean;
        reconcilable: boolean;
        statusLabel: string;
      }[];
      expect(rows.map((r) => [r.attempt, r.current, r.reconcilable, r.statusLabel])).toEqual([
        [2, true, true, "En revisión"],
        [1, false, false, "Rechazado"],
      ]);
      expect(res.body.counts).toMatchObject({ rejected: 1, in_review: 1, paid: 0 });
      const onlyRejected = await request(app)
        .get(api(`/payments?order=${order.id}&status=rejected`))
        .set(panelHeaders(admin.token));
      expect(onlyRejected.body.items).toHaveLength(1);
    });
  });
});

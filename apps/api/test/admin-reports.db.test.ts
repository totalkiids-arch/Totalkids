import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";
import { createOrder, createVariant } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Reporte de ventas y exportaciones CSV (LN-16, RF-29, RF-30) contra
// totalkids_test. Los datos van en marzo de 2020 y dentro de una transacción
// que se deshace, así los pedidos pagados de otros tests no cambian las sumas.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1/admin${path}`;
const BOM = "﻿";

/** Respuesta CSV como texto (supertest no la parsea). */
const asText = (req: request.Test) =>
  req.buffer(true).parse((res, cb) => {
    let data = "";
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => (data += chunk));
    res.on("end", () => cb(null, data));
  });

async function refund(
  db: PrismaClient,
  order: { id: string },
  amount: number,
  date: string,
  status: "requested" | "processed" | "failed" = "processed",
) {
  const payment = await db.payment.findFirstOrThrow({
    where: { orderId: order.id, status: "paid" },
  });
  return db.refundRecord.create({
    data: {
      orderId: order.id,
      paymentId: payment.id,
      amount,
      refundDate: new Date(`${date}T00:00:00Z`),
      reference: `TRF-${randomUUID().slice(0, 6)}`,
      status,
      registeredByLabel: "Administrador",
      ...(status === "requested"
        ? {}
        : { resolvedAt: new Date(`${date}T12:00:00Z`), resolvedByLabel: "Administrador" }),
    },
  });
}

describe.skipIf(!url)("/admin/reports/sales y /admin/exports (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const inTx = (fn: (db: PrismaClient, app: ReturnType<typeof buildTestApp>) => Promise<void>) =>
    inRollback(prisma, async (db) => fn(db, buildTestApp({ prisma: db })));

  it("permisos: solo Administrador (Operador 403 en reportes y exportaciones)", async () => {
    const app = buildTestApp({ prisma });
    for (const path of ["/reports/sales", "/exports/orders", "/exports/subscribers"]) {
      expect((await request(app).get(api(path))).status, path).toBe(401);
      expect((await request(app).get(api(path)).set(panelHeaders(operator))).status, path).toBe(
        403,
      );
    }
    const unknown = await request(app).get(api("/exports/users")).set(panelHeaders(admin));
    expect(unknown.status).toBe(404);
  });

  it("valida el período con los textos del panel", async () => {
    const app = buildTestApp({ prisma });
    const h = panelHeaders(admin);
    const cases: [string, string][] = [
      ["from=2020-02-30", "Elige fechas válidas para el período."],
      ["from=2020-03-10&to=2020-03-01", "La fecha inicial debe ser anterior o igual a la final."],
      ["from=2019-01-01&to=2020-03-01", "Elige un período de hasta un año."],
    ];
    for (const [query, message] of cases) {
      const res = await request(app)
        .get(api(`/reports/sales?${query}`))
        .set(h);
      expect(res.status, query).toBe(422);
      expect(res.body.details.issues[0].message, query).toBe(message);
    }
    const def = await request(app).get(api("/reports/sales")).set(h);
    expect(def.status).toBe(200);
    expect(def.body.period.from).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("separa cobros y reembolsos, por fecha de cobro en días de Chile (RF-30)", async () => {
    await inTx(async (db, app) => {
      const variant = await createVariant(db, 10);
      const paidOn = (iso: string) => new Date(iso);
      // A: cobrado en marzo (2 unidades), con un reembolso procesado y otro solicitado.
      const a = await createOrder(db, {
        status: "confirmed",
        payments: ["paid"],
        lines: [{ variantId: variant.id, quantity: 2 }],
        createdAt: paidOn("2020-03-04T12:00:00Z"),
        paidAt: paidOn("2020-03-05T15:00:00Z"),
      });
      await db.payment.updateMany({ where: { orderId: a.id }, data: { paymentMethod: "webpay" } });
      await refund(db, a, 5_000, "2020-03-20");
      await refund(db, a, 1_000, "2020-03-21", "requested");
      // B: cobrado en febrero; su reembolso de marzo cuenta en marzo, su venta no.
      const b = await createOrder(db, {
        status: "delivered",
        payments: ["paid"],
        amount: 12_000,
        createdAt: paidOn("2020-02-10T12:00:00Z"),
        paidAt: paidOn("2020-02-11T12:00:00Z"),
      });
      await refund(db, b, 3_000, "2020-03-10");
      // C: pagado y luego cancelado: sigue siendo una venta.
      const c = await createOrder(db, {
        status: "cancelled",
        payments: ["paid"],
        amount: 8_000,
        createdAt: paidOn("2020-03-14T12:00:00Z"),
        paidAt: paidOn("2020-03-15T12:00:00Z"),
      });
      // D: 1 de marzo 02:00 UTC = 29 de febrero 23:00 en Chile: fuera de marzo.
      await createOrder(db, {
        status: "confirmed",
        payments: ["paid"],
        amount: 99_000,
        createdAt: paidOn("2020-02-29T12:00:00Z"),
        paidAt: paidOn("2020-03-01T02:00:00Z"),
      });
      // E: en revisión: no es venta.
      await createOrder(db, {
        status: "in_review",
        payments: ["in_review"],
        createdAt: paidOn("2020-03-06T12:00:00Z"),
      });

      const res = await request(app)
        .get(api("/reports/sales?from=2020-03-01&to=2020-03-31"))
        .set(panelHeaders(admin));
      expect(res.status).toBe(200);
      const r = res.body;
      expect(r).toMatchObject({
        period: { from: "2020-03-01", to: "2020-03-31" },
        currency: "CLP",
        timeZone: "America/Santiago",
        charged: 20_000 + 8_000,
        refunded: 5_000 + 3_000,
        net: 28_000 - 8_000,
        paidOrders: 2,
        averageTicket: 14_000,
        refundsCount: 2,
      });
      expect(r.criteria).toContain("fecha del cobro confirmado");
      expect(r.sales.map((s: { orderId: string }) => s.orderId)).toEqual([c.id, a.id]);
      expect(r.sales[1]).toMatchObject({
        method: "webpay",
        charged: 20_000,
        refundedInPeriod: 5_000,
      });
      expect(r.byMethod).toEqual([
        { method: "webpay", orders: 1, charged: 20_000, refunded: 5_000 },
        { method: "Flow", orders: 1, charged: 8_000, refunded: 3_000 },
      ]);
      expect(r.byProduct).toEqual([
        { name: "Cama nido", sku: expect.any(String) as string, units: 2, amount: 20_000 },
      ]);
      expect(r.refunds.map((x: { orderId: string }) => x.orderId).sort()).toEqual(
        [a.id, b.id].sort(),
      );
    });
  });

  it("CSV de solicitudes: BOM, ';', CRLF, tildes y fórmulas neutralizadas, sin datos de más", async () => {
    await inTx(async (db, app) => {
      const tag = randomUUID().slice(0, 6);
      await db.serviceRequest.create({
        data: {
          service: "diseno",
          name: `=HYPERLINK("http://malo.cl") ${tag}`,
          email: `malo-${tag}@correo.cl`,
          phone: "+56922222222",
          commune: "Ñuñoa",
          message: "Mensaje privado que no debe exportarse.",
          privacyAcceptedAt: new Date(),
          privacyVersion: "v1",
          internalNote: "nota interna secreta",
        },
      });
      await db.serviceRequest.create({
        data: {
          service: "armado",
          name: `María José Peña ${tag}`,
          email: `maria-${tag}@correo.cl`,
          message: "Necesito armar un velador.",
          privacyAcceptedAt: new Date(),
          privacyVersion: "v1",
        },
      });
      const res = await asText(
        request(app)
          .get(api(`/exports/service-requests?q=${tag}`))
          .set(panelHeaders(admin)),
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(res.headers["content-disposition"]).toMatch(
        /^attachment; filename="total-kids-solicitudes-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(res.headers["cache-control"]).toBe("no-store");
      const text = res.body as string;
      expect(text.startsWith(BOM)).toBe(true);
      const lines = text.slice(1).split("\r\n");
      expect(lines[0]).toBe('"Referencia";"Fecha";"Servicio";"Estado";"Nombre";"Correo"');
      expect(lines).toHaveLength(3);
      expect(text).toContain(`"'=HYPERLINK(""http://malo.cl"") ${tag}"`);
      expect(text).toContain(`"María José Peña ${tag}"`);
      expect(text).toContain('"Diseño de espacios";"Nueva"');
      for (const secret of ["+56922222222", "Ñuñoa", "Mensaje privado", "nota interna"]) {
        expect(text).not.toContain(secret);
      }
      const audit = await db.auditLog.findFirst({
        where: { action: "export.downloaded", resourceId: "service-requests" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.details).toMatchObject({ rows: 2, filters: { q: tag } });
    });
  });

  it("CSV de suscriptores, pedidos y ventas con los filtros de la URL", async () => {
    await inTx(async (db, app) => {
      const tag = randomUUID().slice(0, 6);
      await db.newsletterSubscriber.create({
        data: {
          email: `-baja-${tag}@correo.cl`,
          consentedAt: new Date(),
          consentVersion: "v1-provisional",
          unsubscribeTokenHash: randomUUID(),
          status: "unsubscribed",
          unsubscribedAt: new Date(),
          unsubscribedBy: "Suscriptor",
        },
      });
      await db.newsletterSubscriber.create({
        data: {
          email: `activo-${tag}@correo.cl`,
          consentedAt: new Date(),
          consentVersion: "v1-provisional",
          unsubscribeTokenHash: randomUUID(),
        },
      });
      const h = panelHeaders(admin);
      const subs = await asText(
        request(app)
          .get(api(`/exports/subscribers?status=unsubscribed&q=${tag}`))
          .set(h),
      );
      const subText = subs.body as string;
      expect(subText.slice(1).split("\r\n")[0]).toBe(
        '"Correo";"Fecha de consentimiento";"Versión del texto";"Estado";"Fecha de baja"',
      );
      expect(subText).toContain(`"'-baja-${tag}@correo.cl"`);
      expect(subText).toContain('"Dado de baja"');
      expect(subText).not.toContain(`activo-${tag}`);

      const order = await createOrder(db, {
        buyerName: `@Camila Muñoz ${tag}`,
        status: "confirmed",
        payments: ["paid"],
      });
      const orders = await asText(
        request(app)
          .get(api(`/exports/orders?q=${tag}`))
          .set(h),
      );
      const orderText = orders.body as string;
      expect(orderText.slice(1).split("\r\n")).toHaveLength(2);
      expect(orderText).toContain(`"TK-${String(order.number)}"`);
      expect(orderText).toContain(`"'@Camila Muñoz ${tag}"`);
      expect(orderText).toContain('"Confirmado";"Pagado"');
      expect(orderText).not.toContain("12.345.678-5");
      expect(orderText).not.toContain("+56912345678");

      const badFilter = await request(app).get(api("/exports/orders?status=perdido")).set(h);
      expect(badFilter.status).toBe(422);

      const sales = await asText(
        request(app).get(api("/exports/sales?from=2020-03-01&to=2020-03-31")).set(h),
      );
      expect(sales.status).toBe(200);
      expect(sales.headers["content-disposition"]).toContain(
        "total-kids-ventas-2020-03-01-2020-03-31.csv",
      );
      expect((sales.body as string).slice(1)).toBe(
        '"Pedido";"Fecha de cobro";"Comprador";"Medio";"Cobro";"Reembolsos procesados en el período"',
      );
    });
  });
});

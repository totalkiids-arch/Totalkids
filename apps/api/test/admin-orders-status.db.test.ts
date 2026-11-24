import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { CartClient, createCoupon, setSettings, shopFixture } from "./cart-helpers.js";
import { buildTestApp } from "./helpers.js";
import { createOrder, createVariant } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Cambios de estado del panel (LN-13; RF-27, RF-34; RN-04 a RN-06) contra
// totalkids_test. Los casos simples corren en transacciones que se deshacen;
// el de concurrencia usa conexiones reales sobre un pedido sin líneas que se
// borra al final. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

type App = ReturnType<typeof buildTestApp>;
type Body = Record<string, unknown>;

const REASON = "Revisado con el cliente";

describe.skipIf(!url)("PATCH /admin/orders/{id}/status (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const committed: string[] = [];
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });

  afterAll(async () => {
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: committed } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: committed } } });
    await prisma.order.deleteMany({ where: { id: { in: committed } } });
    await prisma.$disconnect();
  });

  const run = (fn: (db: PrismaClient, app: App) => Promise<void>) =>
    inRollback(prisma, (db) => fn(db, buildTestApp({ prisma: db })));

  const patch = (app: App, id: string, body: Body, headers = panelHeaders(admin)) =>
    request(app).patch(`/api/v1/admin/orders/${id}/status`).set(headers).send(body);

  const change = (to: string, extra: Body = {}) => ({ to, reason: REASON, ...extra });

  function expectConflict(res: request.Response, message: string, field = "to") {
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toMatchObject({ code: "CONFLICT", message, details: { field } });
  }

  function issues(res: request.Response) {
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    const list = (res.body as { details: { issues: { path: string; message: string }[] } }).details
      .issues;
    return Object.fromEntries(list.map((i) => [i.path, i.message]));
  }

  describe("permisos y CSRF", () => {
    it("Operador cambia estados; sin sesión 401; sin CSRF 403", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { status: "confirmed", payments: ["paid"] });
        expect(
          (await patch(app, order.id, change("preparing"), panelHeaders(operator))).status,
        ).toBe(200);
        const anonymous = await patch(app, order.id, change("shipped"), panelHeaders(undefined));
        expect(anonymous.status).toBe(401);
        const noCsrf = await patch(app, order.id, change("shipped"), panelHeaders(admin, false));
        expect(noCsrf.status).toBe(403);
        expect(noCsrf.body).toMatchObject({ code: "CSRF_FAILED" });
      });
    });
  });

  describe("transiciones permitidas", () => {
    it("pendiente con pago confirmado → confirmado: copia paidAt, historial y auditoría", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { payments: ["rejected", "paid"] });
        // El pago se acreditó pero el pedido quedó sin fecha de pago (LN-10 aún no existe).
        await db.order.update({ where: { id: order.id }, data: { paidAt: null } });
        const res = await patch(app, order.id, change("confirmed"));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({
          status: "confirmed",
          availableTransitions: ["preparing", "cancelled"],
          statusHistory: [
            {
              from: "pending_payment",
              to: "confirmed",
              actorLabel: "Administrador",
              actorName: "Equipo",
              reason: REASON,
            },
          ],
        });
        const payment = await db.payment.findFirstOrThrow({
          where: { orderId: order.id, status: "paid" },
        });
        const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(row.paidAt?.toISOString()).toBe(payment.paidAt?.toISOString());
        const audit = await db.auditLog.findFirstOrThrow({
          where: { resourceId: order.id, action: "order.status_changed" },
        });
        expect(audit).toMatchObject({ actorLabel: "Administrador", reason: REASON });
        expect(audit.details).toMatchObject({ from: "pending_payment", to: "confirmed" });
      });
    });

    it("pago en revisión resuelto como pagado: en revisión → confirmado", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { status: "in_review", payments: ["paid"] });
        const res = await patch(app, order.id, change("confirmed"));
        expect(res.status).toBe(200);
      });
    });

    it("confirmado → en preparación → despachado (domicilio) → entregado, con correos una vez", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, {
          status: "confirmed",
          delivery: "shipping",
          payments: ["paid"],
        });
        expect((await patch(app, order.id, change("preparing"))).status).toBe(200);
        const shipped = await patch(
          app,
          order.id,
          change("shipped", { carrier: "  Starken ", code: "ST-998877" }),
        );
        expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
        expect(shipped.body).toMatchObject({
          status: "shipped",
          delivery: { carrier: "Starken", trackingCode: "ST-998877" },
          availableTransitions: ["delivered"],
        });
        expect((await patch(app, order.id, change("delivered"))).status).toBe(200);

        const jobs = await db.outboxJob.findMany({
          where: { eventKey: { in: [`order_shipped:${order.id}`, `order_delivered:${order.id}`] } },
          orderBy: { type: "asc" },
        });
        expect(jobs.map((j) => j.type)).toEqual(["email.order_delivered", "email.order_shipped"]);
        expect(jobs[1]?.payload).toMatchObject({
          method: "shipping",
          orderNumber: order.number,
          carrier: "Starken",
          trackingCode: "ST-998877",
        });
        const logs = await db.emailLog.findMany({ where: { orderId: order.id } });
        expect(logs.map((l) => l.event).sort()).toEqual(["order_delivered", "order_shipped"]);
        expect(logs.every((l) => l.recipient === order.buyerEmail)).toBe(true);

        const history = await db.orderStatusHistory.count({ where: { orderId: order.id } });
        expect(history).toBe(3);
      });
    });

    it("retiro en taller: despachado = listo para retiro, sin transportista, con correo de retiro", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { status: "preparing", payments: ["paid"] });
        const res = await patch(app, order.id, change("shipped"));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({ delivery: { carrier: null, trackingCode: null } });
        const job = await db.outboxJob.findUniqueOrThrow({
          where: { eventKey: `order_shipped:${order.id}` },
        });
        expect(job.payload).toMatchObject({
          method: "pickup",
          pickupDetails: "Taller Total Kids, Temuco. Lunes a viernes de 10 a 18 h.",
        });
      });
    });

    it("no duplica un correo ya encolado con la misma clave", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { status: "shipped", payments: ["paid"] });
        await db.emailLog.create({
          data: {
            event: "order_delivered",
            recipient: order.buyerEmail,
            eventKey: `order_delivered:${order.id}`,
            orderId: order.id,
          },
        });
        expect((await patch(app, order.id, change("delivered"))).status).toBe(200);
        expect(
          await db.emailLog.count({ where: { eventKey: `order_delivered:${order.id}` } }),
        ).toBe(1);
      });
    });
  });

  describe("rechazos", () => {
    it("transiciones fuera de la tabla y estados terminales (409)", async () => {
      await run(async (db, app) => {
        const cases = [
          ["confirmed", "shipped", 'Un pedido "Confirmado" no puede pasar a "Despachado".'],
          ["shipped", "cancelled", 'Un pedido "Despachado" no puede pasar a "Cancelado".'],
          [
            "preparing",
            "preparing",
            'Un pedido "En preparación" no puede pasar a "En preparación".',
          ],
          ["delivered", "cancelled", 'Un pedido "Entregado" no puede pasar a "Cancelado".'],
        ] as const;
        for (const [from, to, message] of cases) {
          const order = await createOrder(db, { status: from, payments: ["paid"] });
          expectConflict(await patch(app, order.id, change(to)), message);
        }
        for (const from of ["cancelled", "expired"] as const) {
          const order = await createOrder(db, { status: from, payments: ["rejected"] });
          const res = await patch(app, order.id, change("pending_payment"));
          expect(res.status).toBe(409);
        }
      });
    });

    it("no se confirma ni despacha sin pago confirmado", async () => {
      await run(async (db, app) => {
        const unpaid = await createOrder(db, { payments: ["rejected"] });
        expectConflict(
          await patch(app, unpaid.id, change("confirmed")),
          "Primero concilia y confirma el pago en Pagos y conciliación.",
        );
        // En preparación con fecha de pago pero sin intento cobrado (datos de otra fuente).
        const preparing = await createOrder(db, {
          status: "preparing",
          paidAt: new Date(),
          delivery: "shipping",
        });
        expectConflict(
          await patch(app, preparing.id, change("shipped", { carrier: "Starken", code: "X1" })),
          "Un pedido sin pago confirmado no se despacha.",
        );
      });
    });

    it("confirmar a mano exige que el pago ya esté asentado (reservas y cupón, LN-10)", async () => {
      await run(async (db, app) => {
        const variant = await createVariant(db, 5, 1);
        const order = await createOrder(db, {
          payments: ["paid"],
          lines: [{ variantId: variant.id, reservation: "active" }],
        });
        expectConflict(
          await patch(app, order.id, change("confirmed")),
          "Primero concilia y confirma el pago en Pagos y conciliación.",
        );
      });
    });

    it("RN-04: no se cancela ni vence con el último pago pendiente o en revisión", async () => {
      await run(async (db, app) => {
        const message =
          "Hay un pago sin resolver: concílialo en Pagos antes de cancelar o marcar como vencido.";
        const pending = await createOrder(db, { payments: ["rejected", "pending"] });
        expectConflict(await patch(app, pending.id, change("cancelled")), message);
        expectConflict(await patch(app, pending.id, change("expired")), message);
        const review = await createOrder(db, { status: "in_review", payments: ["in_review"] });
        expectConflict(await patch(app, review.id, change("cancelled")), message);
        const detail = await request(app)
          .get(`/api/v1/admin/orders/${review.id}`)
          .set(panelHeaders(admin, false));
        expect(detail.body).toMatchObject({ blockedByUnresolvedPayment: true });
      });
    });

    it("despacho a domicilio exige transportista y código (422 por campo)", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, {
          status: "preparing",
          delivery: "shipping",
          payments: ["paid"],
        });
        expect(issues(await patch(app, order.id, change("shipped", { carrier: " " })))).toEqual({
          carrier: "Ingresa el transportista para despachar.",
          code: "Ingresa el código de seguimiento para despachar.",
        });
        const long = "x".repeat(81);
        expect(
          issues(await patch(app, order.id, change("shipped", { carrier: long, code: long }))),
        ).toEqual({
          carrier: "El transportista admite hasta 80 caracteres.",
          code: "El código admite hasta 80 caracteres.",
        });
      });
    });

    it("motivo obligatorio y estado válido (422)", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { status: "confirmed", payments: ["paid"] });
        expect(issues(await patch(app, order.id, { to: "preparing", reason: " a " }))).toEqual({
          reason: "Escribe el motivo del cambio (mínimo 3 caracteres).",
        });
        expect(issues(await patch(app, order.id, { to: "preparing" }))).toEqual({
          reason: "Escribe el motivo del cambio (mínimo 3 caracteres).",
        });
        expect(
          issues(await patch(app, order.id, { to: "preparing", reason: "x".repeat(501) })),
        ).toEqual({ reason: "El motivo admite hasta 500 caracteres." });
        expect(issues(await patch(app, order.id, change("enviado")))).toEqual({
          to: "Elige el nuevo estado.",
        });
        expect(await db.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(0);
      });
    });

    it("404 si el pedido no existe", async () => {
      await run(async (_db, app) => {
        const res = await patch(app, "TK-999999999", change("confirmed"));
        expect(res.status).toBe(404);
      });
    });
  });

  describe("cancelar y vencer", () => {
    it("sin pagar: libera reservas (movimiento release) y el uso del cupón", async () => {
      await run(async (db, app) => {
        const variant = await createVariant(db, 5, 3);
        const coupon = await createCoupon(db, { usesCount: 1, maxUses: 1 });
        const order = await createOrder(db, {
          payments: ["rejected"],
          couponId: coupon.id,
          lines: [
            { variantId: variant.id, quantity: 2, reservation: "active" },
            { variantId: variant.id, madeToOrder: true },
          ],
        });
        const res = await patch(app, order.id, change("cancelled"));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({ status: "cancelled", canRecordRestock: false });

        const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
        expect(after).toMatchObject({ stockPhysical: 5, stockReserved: 1 });
        const reservation = await db.stockReservation.findFirstOrThrow({
          where: { orderId: order.id },
        });
        expect(reservation.status).toBe("released");
        expect(reservation.resolvedAt).not.toBeNull();
        const movements = await db.inventoryMovement.findMany({ where: { orderId: order.id } });
        expect(movements).toEqual([
          expect.objectContaining({
            kind: "release",
            physicalDelta: 0,
            reservedDelta: -2,
            physicalAfter: 5,
            reservedAfter: 1,
            actorLabel: "Administrador",
          }),
        ]);
        expect(movements[0]?.reason).toContain(REASON);
        expect(
          (await db.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).status,
        ).toBe("released");
        expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount).toBe(0);
        const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(row.cancelledAt).not.toBeNull();
      });
    });

    it("vencer a mano sin intentos de pago también libera", async () => {
      await run(async (db, app) => {
        const variant = await createVariant(db, 2, 2);
        const order = await createOrder(db, {
          lines: [{ variantId: variant.id, quantity: 2, reservation: "active" }],
        });
        expect((await patch(app, order.id, change("expired"))).status).toBe(200);
        const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
        expect(after.stockReserved).toBe(0);
      });
    });

    it("pagado: no toca pagos ni reembolsos y avisa que no devuelve dinero", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { status: "preparing", payments: ["paid"] });
        const before = await db.payment.findMany({ where: { orderId: order.id } });
        const res = await patch(app, order.id, change("cancelled"));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          status: "cancelled",
          restockRecordedAt: null,
          payment: { status: "paid" },
          refunds: [],
        });
        expect(await db.payment.findMany({ where: { orderId: order.id } })).toEqual(before);
        const audit = await db.auditLog.findFirstOrThrow({
          where: { resourceId: order.id, action: "order.status_changed" },
        });
        expect(audit.details).toMatchObject({
          notice: "Cancelar no devuelve dinero: gestiona la devolución con un reembolso manual.",
        });
        expect(await db.inventoryMovement.count({ where: { orderId: order.id } })).toBe(0);
      });
    });

    it("pagado con reposición: repone solo lo que descontó stock, una sola vez", async () => {
      await run(async (db, app) => {
        const stocked = await createVariant(db, 4, 0);
        const madeToOrder = await createVariant(db, 0, 0);
        const order = await createOrder(db, {
          status: "confirmed",
          payments: ["paid"],
          lines: [
            { variantId: stocked.id, quantity: 2, reservation: "consumed" },
            { variantId: madeToOrder.id, quantity: 3, madeToOrder: true },
          ],
        });
        const res = await patch(app, order.id, change("cancelled", { restock: true }));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect((res.body as Body).restockRecordedAt).not.toBeNull();

        expect(
          await db.productVariant.findUniqueOrThrow({ where: { id: stocked.id } }),
        ).toMatchObject({ stockPhysical: 6, stockReserved: 0 });
        expect(
          await db.productVariant.findUniqueOrThrow({ where: { id: madeToOrder.id } }),
        ).toMatchObject({ stockPhysical: 0 });
        const movements = await db.inventoryMovement.findMany({ where: { orderId: order.id } });
        expect(movements).toEqual([
          expect.objectContaining({
            kind: "restock",
            variantId: stocked.id,
            physicalDelta: 2,
            physicalAfter: 6,
          }),
        ]);
        const audit = await db.auditLog.findFirstOrThrow({
          where: { resourceId: order.id, action: "order.restock_recorded" },
        });
        expect(audit.details).toMatchObject({ units: [{ sku: stocked.sku, quantity: 2 }] });

        // Ya cancelado: no hay otra transición, ni otra reposición.
        const again = await patch(app, order.id, change("cancelled", { restock: true }));
        expect(again.status).toBe(409);
        expect(await db.inventoryMovement.count({ where: { orderId: order.id } })).toBe(1);
      });
    });

    it("la reposición se rechaza si ya se registró o si el pedido no está pagado", async () => {
      await run(async (db, app) => {
        const done = await createOrder(db, {
          status: "confirmed",
          payments: ["paid"],
          restockRecordedAt: new Date(),
        });
        expectConflict(
          await patch(app, done.id, change("cancelled", { restock: true })),
          "La reposición de stock ya se registró para este pedido.",
          "restock",
        );
        const unpaid = await createOrder(db, { payments: ["rejected"] });
        expectConflict(
          await patch(app, unpaid.id, change("cancelled", { restock: true })),
          "La reposición de stock solo se registra al cancelar un pedido pagado.",
          "restock",
        );
        expect(await db.orderStatusHistory.count({ where: { orderId: done.id } })).toBe(0);
      });
    });
  });

  describe("reservas parciales (como las crea LN-09)", () => {
    it("línea a pedido con 2 reservadas: cancelar sin pagar libera 2", async () => {
      await run(async (db, app) => {
        // 3 pedidas, 2 terminadas reservadas y 1 a fabricar (la línea queda a pedido).
        const variant = await createVariant(db, 2, 2);
        const order = await createOrder(db, {
          lines: [
            {
              variantId: variant.id,
              quantity: 3,
              madeToOrder: true,
              reserved: 2,
              reservation: "active",
            },
          ],
        });
        const res = await patch(app, order.id, change("cancelled"));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(
          await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } }),
        ).toMatchObject({ stockPhysical: 2, stockReserved: 0 });
        const movements = await db.inventoryMovement.findMany({ where: { orderId: order.id } });
        expect(movements).toEqual([
          expect.objectContaining({ kind: "release", reservedDelta: -2, reservedAfter: 0 }),
        ]);
      });
    });

    it("pagado con 2 vendidas de una línea a pedido: la reposición repone 2", async () => {
      await run(async (db, app) => {
        // La venta (LN-10) ya descontó las 2 terminadas: quedan 0 físicas.
        const variant = await createVariant(db, 0, 0);
        const order = await createOrder(db, {
          status: "preparing",
          payments: ["paid"],
          lines: [
            {
              variantId: variant.id,
              quantity: 3,
              madeToOrder: true,
              reserved: 2,
              reservation: "consumed",
            },
          ],
        });
        const res = await patch(app, order.id, change("cancelled", { restock: true }));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(
          await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } }),
        ).toMatchObject({ stockPhysical: 2, stockReserved: 0 });
        const movements = await db.inventoryMovement.findMany({ where: { orderId: order.id } });
        expect(movements).toEqual([
          expect.objectContaining({ kind: "restock", physicalDelta: 2, physicalAfter: 2 }),
        ]);
        const audit = await db.auditLog.findFirstOrThrow({
          where: { resourceId: order.id, action: "order.restock_recorded" },
        });
        expect(audit.details).toMatchObject({ units: [{ sku: variant.sku, quantity: 2 }] });
      });
    });
  });

  describe("con el pedido real de LN-09 (POST /orders)", () => {
    it("crear con reserva parcial y cupón, y cancelar desde el panel: nada queda descuadrado", async () => {
      await run(async (db, app) => {
        await setSettings(db, { pickupEnabled: true, freeShippingThreshold: null });
        const shop = await shopFixture(db); // skuA: 5 terminadas a $10.000
        const coupon = await createCoupon(db, { maxUses: 5, usesCount: 0 });

        // El comprador pide 7: LN-09 reserva 5 y marca la línea a pedido por las 2 restantes.
        const buyer = new CartClient(app);
        const added = await buyer.post("/cart/items", { sku: shop.skuA, quantity: 7 });
        expect(added.status, JSON.stringify(added.body)).toBe(201);
        const applied = await buyer.post("/cart/coupon", { code: coupon.code });
        expect(applied.status, JSON.stringify(applied.body)).toBe(200);
        const quote = await buyer.get("/shipping/quote?method=retiro");
        expect(quote.status, JSON.stringify(quote.body)).toBe(200);
        const expectedTotal = (quote.body as { totals: { total: number } }).totals.total;
        const created = await request(app)
          .post("/api/v1/orders")
          .set(buyer.headers())
          .set("Idempotency-Key", randomUUID())
          .send({
            buyer: {
              name: "María González",
              rut: "12345678-5",
              email: "maria@correo.cl",
              phone: "+56 9 1234 5678",
            },
            delivery: { method: "retiro" },
            billing: { document: "boleta" },
            termsAccepted: true,
            expectedTotal,
          });
        expect(created.status, JSON.stringify(created.body)).toBe(201);
        const ref = (created.body as { orderNumber: string }).orderNumber;

        const order = await db.order.findUniqueOrThrow({
          where: { number: Number(ref.replace(/\D/g, "")) },
          include: { items: true, reservations: true, redemption: true },
        });
        expect(order.items).toEqual([expect.objectContaining({ quantity: 7, madeToOrder: true })]);
        expect(order.reservations).toEqual([
          expect.objectContaining({ variantId: shop.variantA, quantity: 5, status: "active" }),
        ]);
        expect(order.redemption?.status).toBe("reserved");
        expect(
          await db.productVariant.findUniqueOrThrow({ where: { id: shop.variantA } }),
        ).toMatchObject({ stockPhysical: 5, stockReserved: 5 });
        expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount).toBe(1);

        // El panel lo ve pendiente de pago, sin poder confirmarlo a mano.
        const detail = await request(app)
          .get(`/api/v1/admin/orders/${ref}`)
          .set(panelHeaders(admin));
        expect(detail.status).toBe(200);
        expect(detail.body).toMatchObject({
          status: "pending_payment",
          payment: { status: "none" },
          availableTransitions: ["cancelled", "expired"],
          statusHistory: [{ to: "pending_payment", actorLabel: "Comprador" }],
        });
        expectConflict(
          await patch(app, ref, change("confirmed")),
          "Primero concilia y confirma el pago en Pagos y conciliación.",
        );

        // Cancelar: reservas, cupón y stock vuelven a como estaban antes de la compra.
        const cancelled = await patch(app, ref, change("cancelled"));
        expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
        expect(
          await db.productVariant.findUniqueOrThrow({ where: { id: shop.variantA } }),
        ).toMatchObject({ stockPhysical: 5, stockReserved: 0 });
        const reservations = await db.stockReservation.findMany({ where: { orderId: order.id } });
        expect(reservations.map((r) => r.status)).toEqual(["released"]);
        expect(
          (await db.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).status,
        ).toBe("released");
        expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount).toBe(0);

        const movements = await db.inventoryMovement.findMany({
          where: { orderId: order.id },
          orderBy: { createdAt: "asc" },
        });
        expect(movements.map((m) => [m.kind, m.physicalDelta, m.reservedDelta])).toEqual([
          ["reservation", 0, 5],
          ["release", 0, -5],
        ]);
        expect(movements.at(-1)).toMatchObject({ physicalAfter: 5, reservedAfter: 0 });
        const history = await db.orderStatusHistory.findMany({
          where: { orderId: order.id },
          orderBy: { createdAt: "asc" },
        });
        expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
          [null, "pending_payment"],
          ["pending_payment", "cancelled"],
        ]);
      });
    });
  });

  describe("concurrencia (conexiones reales)", () => {
    it("dos cambios simultáneos: uno se aplica, el otro choca y el historial queda íntegro", async () => {
      const app = buildTestApp({ prisma });
      const order = await createOrder(prisma, { status: "confirmed", payments: ["paid"] });
      committed.push(order.id);

      const responses = await Promise.all([
        patch(app, order.id, change("preparing")),
        patch(app, order.id, change("preparing")),
        patch(app, order.id, change("cancelled")),
      ]);
      const statuses = responses.map((r) => r.status).sort();
      // preparing y cancelled se excluyen o se encadenan (preparing → cancelled es válido),
      // pero nunca dos veces el mismo cambio.
      expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
      expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);

      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
      });
      expect(history.filter((h) => h.toStatus === "preparing")).toHaveLength(
        history.some((h) => h.toStatus === "preparing") ? 1 : 0,
      );
      // Cada fila parte del estado que dejó la anterior.
      let current = "confirmed";
      for (const h of history) {
        expect(h.fromStatus).toBe(current);
        current = h.toStatus;
      }
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe(current);
      expect(history).toHaveLength(responses.filter((r) => r.status === 200).length);
    });
  });
});

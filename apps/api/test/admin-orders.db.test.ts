import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { createCoupon } from "./cart-helpers.js";
import { buildTestApp } from "./helpers.js";
import { createOrder, createVariant } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Listado y detalle del panel de pedidos (LN-13, RF-27) contra totalkids_test.
// Cada caso corre en una transacción que se deshace; las búsquedas filtran por
// una marca propia para no ver pedidos de otros archivos que corren en
// paralelo. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

type Item = { ref: string; [key: string]: unknown };

describe.skipIf(!url)("GET /admin/orders y /admin/orders/{id} (PostgreSQL real)", () => {
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

  const run = (fn: (db: PrismaClient, app: ReturnType<typeof buildTestApp>) => Promise<void>) =>
    inRollback(prisma, (db) => fn(db, buildTestApp({ prisma: db })));

  const list = (app: ReturnType<typeof buildTestApp>, query: string, token = admin) =>
    request(app).get(`/api/v1/admin/orders?${query}`).set(panelHeaders(token, false));

  const refs = (body: { items: Item[] }) => body.items.map((i) => i.ref);

  describe("permisos", () => {
    it("Administrador y Operador consultan; sin sesión responde 401", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db);
        expect((await list(app, "", admin)).status).toBe(200);
        expect((await list(app, "", operator)).status).toBe(200);
        const detail = await request(app)
          .get(`/api/v1/admin/orders/${order.id}`)
          .set(panelHeaders(operator, false));
        expect(detail.status).toBe(200);
        const anonymous = await request(app).get("/api/v1/admin/orders");
        expect(anonymous.status).toBe(401);
        const anonymousDetail = await request(app).get(`/api/v1/admin/orders/${order.id}`);
        expect(anonymousDetail.status).toBe(401);
      });
    });

    it("405 en métodos no admitidos", async () => {
      await run(async (_db, app) => {
        const res = await request(app).delete("/api/v1/admin/orders").set(panelHeaders(admin));
        expect(res.status).toBe(405);
      });
    });
  });

  describe("listado", () => {
    it("busca por número, por nombre sin tildes y por correo; más recientes primero", async () => {
      await run(async (db, app) => {
        const tag = `Zuñiga${randomUUID().slice(0, 6)}`;
        const older = await createOrder(db, {
          buyerName: `Ana ${tag}`,
          createdAt: new Date(Date.now() - 5 * 86_400_000),
        });
        const newer = await createOrder(db, {
          buyerName: `Bea ${tag}`,
          buyerEmail: `bea-${tag.toLowerCase()}@correo.cl`,
        });

        const byName = await list(
          app,
          `q=${encodeURIComponent(tag.replace("ñ", "n").toUpperCase())}`,
        );
        expect(byName.status).toBe(200);
        expect(refs(byName.body as { items: Item[] })).toEqual([
          `TK-${String(newer.number)}`,
          `TK-${String(older.number)}`,
        ]);

        const byNumber = await list(app, `q=TK-${String(older.number)}`);
        expect(refs(byNumber.body as { items: Item[] })).toContain(`TK-${String(older.number)}`);

        const byEmail = await list(app, `q=bea-${tag.toLowerCase()}`);
        expect(refs(byEmail.body as { items: Item[] })).toEqual([`TK-${String(newer.number)}`]);

        const wildcard = await list(app, `q=${encodeURIComponent(`${tag}%`)}`);
        expect((wildcard.body as { items: Item[] }).items).toEqual([]);
      });
    });

    it("columnas como el panel: estado, pago, entrega, factura pendiente y total", async () => {
      await run(async (db, app) => {
        const tag = `cols${randomUUID().slice(0, 8)}`;
        const order = await createOrder(db, {
          buyerName: `Clara ${tag}`,
          status: "confirmed",
          delivery: "shipping",
          document: "factura",
          payments: ["rejected", "paid"],
        });
        const res = await list(app, `q=${tag}`);
        const [item] = (res.body as { items: Item[] }).items;
        expect(item).toMatchObject({
          id: order.id,
          number: order.number,
          ref: `TK-${String(order.number)}`,
          buyerName: `Clara ${tag}`,
          status: "confirmed",
          statusLabel: "Confirmado",
          paymentStatus: "paid",
          paymentLabel: "Pagado",
          deliveryMethod: "shipping",
          taxDocument: "factura",
          invoicePending: true,
          shippingCost: 5_000,
          total: 35_000,
        });
        expect((res.body as { meta: unknown }).meta).toEqual({
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        });
      });
    });

    it("filtra por estado, pago (incluido sin pago), entrega, factura pendiente y fechas", async () => {
      await run(async (db, app) => {
        const tag = `filtro${randomUUID().slice(0, 8)}`;
        const name = (n: string) => `${n} ${tag}`;
        const pending = await createOrder(db, { buyerName: name("Uno"), payments: ["pending"] });
        const none = await createOrder(db, { buyerName: name("Dos") });
        const invoice = await createOrder(db, {
          buyerName: name("Tres"),
          status: "preparing",
          document: "factura",
          payments: ["paid"],
          delivery: "shipping",
        });
        const issued = await createOrder(db, {
          buyerName: name("Cuatro"),
          status: "delivered",
          document: "factura",
          payments: ["paid"],
          invoiceFolio: `9${String(Date.now()).slice(-8)}`,
          createdAt: new Date("2026-01-10T15:00:00Z"),
        });
        const ref = (o: { number: number }) => `TK-${String(o.number)}`;
        const get = async (query: string) =>
          refs((await list(app, `q=${tag}&${query}`)).body as { items: Item[] }).sort();

        expect(await get("status=preparing,delivered")).toEqual([ref(invoice), ref(issued)].sort());
        expect(await get("status=preparing&status=delivered")).toEqual(
          [ref(invoice), ref(issued)].sort(),
        );
        expect(await get("paymentStatus=pending")).toEqual([ref(pending)]);
        expect(await get("paymentStatus=none")).toEqual([ref(none)]);
        expect(await get("paymentStatus=none,pending")).toEqual([ref(pending), ref(none)].sort());
        expect(await get("deliveryMethod=shipping")).toEqual([ref(invoice)]);
        expect(await get("invoicePending=true")).toEqual([ref(invoice)]);
        expect(await get("invoicePending=false")).toHaveLength(3);
        // 2026-01-10 15:00 UTC = 2026-01-10 en Chile.
        expect(await get("from=2026-01-10&to=2026-01-10")).toEqual([ref(issued)]);
        expect(await get("from=2026-01-11")).not.toContain(ref(issued));
      });
    });

    it("pagina y valida los filtros (422)", async () => {
      await run(async (db, app) => {
        const tag = `pag${randomUUID().slice(0, 8)}`;
        for (let i = 0; i < 3; i += 1) await createOrder(db, { buyerName: `P ${tag}` });
        const page2 = await list(app, `q=${tag}&pageSize=2&page=2`);
        expect((page2.body as { items: Item[] }).items).toHaveLength(1);
        expect((page2.body as { meta: unknown }).meta).toEqual({
          page: 2,
          pageSize: 2,
          total: 3,
          totalPages: 2,
        });

        for (const bad of [
          "status=enviado",
          "paymentStatus=ok",
          "deliveryMethod=dron",
          "invoicePending=si",
          "from=2026-02-30",
          "from=2026-03-02&to=2026-03-01",
        ]) {
          const res = await list(app, bad);
          expect(res.status, bad).toBe(422);
        }
      });
    });
  });

  describe("detalle", () => {
    it("trae snapshot, líneas con extras y a pedido, pagos, reembolsos, historial y correos", async () => {
      await run(async (db, app) => {
        const variant = await createVariant(db, 5, 0);
        const order = await createOrder(db, {
          status: "confirmed",
          delivery: "shipping",
          document: "factura",
          payments: ["rejected", "paid"],
          lines: [
            {
              variantId: variant.id,
              quantity: 2,
              reservation: "consumed",
              extras: [{ code: "armado", name: "Armado", unitPrice: 2_000 }],
            },
            { variantId: variant.id, madeToOrder: true },
          ],
        });
        const paid = await db.payment.findFirstOrThrow({
          where: { orderId: order.id, status: "paid" },
        });
        await db.refundRecord.create({
          data: {
            orderId: order.id,
            paymentId: paid.id,
            amount: 5_000,
            refundDate: new Date(),
            reference: "TRX-1",
            registeredByLabel: "Administrador",
          },
        });
        await db.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: "pending_payment",
            toStatus: "confirmed",
            actorLabel: "Sistema",
          },
        });
        await db.emailLog.create({
          data: {
            event: "purchase_confirmed",
            recipient: order.buyerEmail,
            eventKey: `purchase_confirmed:${order.id}`,
            orderId: order.id,
          },
        });

        const res = await request(app)
          .get(`/api/v1/admin/orders/TK-${String(order.number)}`)
          .set(panelHeaders(admin, false));
        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toMatchObject({
          id: order.id,
          ref: `TK-${String(order.number)}`,
          status: "confirmed",
          buyer: { name: "Camila Pérez", rut: "12.345.678-5" },
          delivery: { method: "shipping", commune: "Ñuñoa", carrier: null },
          billing: {
            document: "factura",
            businessName: "Jardín Infantil Los Robles SpA",
            invoice: null,
            invoicePending: true,
          },
          amounts: { subtotal: 30_000, shippingCost: 5_000, total: 35_000, discount: 0 },
          payment: { status: "paid", label: "Pagado" },
          refundTotals: {
            charged: 35_000,
            committed: 5_000,
            processed: 0,
            refundable: 30_000,
            state: "requested",
          },
          restockRecordedAt: null,
          canRecordRestock: true,
          availableTransitions: ["preparing", "cancelled"],
          blockedByUnresolvedPayment: false,
        });
        const items = body.items as Record<string, unknown>[];
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
          quantity: 2,
          madeToOrder: false,
          extras: [{ code: "armado", name: "Armado", unitPrice: 2_000, text: null }],
        });
        expect(items[1]).toMatchObject({ madeToOrder: true, leadTime: "15 a 20 días hábiles" });
        expect((body.payments as unknown[]).map((p) => (p as { status: string }).status)).toEqual([
          "rejected",
          "paid",
        ]);
        expect(JSON.stringify(body.payments)).not.toContain("tokenHash");
        expect(body.refunds).toEqual([
          expect.objectContaining({ amount: 5_000, reference: "TRX-1", status: "requested" }),
        ]);
        expect(body.statusHistory).toEqual([
          expect.objectContaining({
            from: "pending_payment",
            to: "confirmed",
            actorLabel: "Sistema",
          }),
        ]);
        expect(body.emails).toEqual([
          expect.objectContaining({ event: "purchase_confirmed", status: "pending" }),
        ]);
      });
    });

    it("bloqueos calculados: pago pendiente impide cancelar o vencer", async () => {
      await run(async (db, app) => {
        const order = await createOrder(db, { payments: ["pending"] });
        const res = await request(app)
          .get(`/api/v1/admin/orders/${order.id}`)
          .set(panelHeaders(admin, false));
        expect(res.body).toMatchObject({
          availableTransitions: [],
          blockedByUnresolvedPayment: true,
          payment: { status: "pending" },
        });
      });
    });

    it("404 si no existe y 422 si el identificador no es válido", async () => {
      await run(async (_db, app) => {
        const missing = await request(app)
          .get(`/api/v1/admin/orders/${randomUUID()}`)
          .set(panelHeaders(admin, false));
        expect(missing.status).toBe(404);
        const missingNumber = await request(app)
          .get("/api/v1/admin/orders/TK-999999999")
          .set(panelHeaders(admin, false));
        expect(missingNumber.status).toBe(404);
        const bad = await request(app)
          .get("/api/v1/admin/orders/pedido-raro")
          .set(panelHeaders(admin, false));
        expect(bad.status).toBe(422);
      });
    });

    it("muestra el cupón del pedido", async () => {
      await run(async (db, app) => {
        const coupon = await createCoupon(db, { usesCount: 1 });
        const order = await createOrder(db, { couponId: coupon.id });
        const res = await request(app)
          .get(`/api/v1/admin/orders/${order.id}`)
          .set(panelHeaders(admin, false));
        expect(res.body).toMatchObject({ amounts: { couponCode: "KIDS" } });
      });
    });
  });
});

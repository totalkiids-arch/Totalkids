import { randomUUID } from "node:crypto";

import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { CART_COOKIE_DEV, cartSessionKeyOf } from "../src/middleware/cart-session.js";
import { FakeEmailSender } from "../src/services/email/fake-sender.js";
import { createEmailWorker } from "../src/services/email/worker.js";
import { setSettings } from "./cart-helpers.js";
import { deleteOrders, deleteProducts, ordersOfProducts } from "./cleanup.js";
import { FakeFlow } from "./fake-flow.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Compra de invitado de punta a punta (LN-17, CA-01): carrito → cotización →
// pedido → pago con Flow → callback → consulta del pedido confirmado y su
// correo de compra. Flow es falso (FakeFlow) y el correo lo «envía»
// FakeEmailSender, sin red. Conexiones reales; todo se borra en afterAll. Se
// omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("compra de invitado de punta a punta (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const flow = new FakeFlow();
  const app = buildTestApp({
    prisma,
    flow: { client: flow, callbackBase: "https://api.test/api/v1", sealSecret: "clave" },
  });
  const tag = randomUUID().slice(0, 8);
  const created = { categoryId: "", productId: "", variantId: "", sku: "" };
  let previousSettings: Awaited<ReturnType<typeof prisma.setting.findUnique>> = null;

  beforeAll(async () => {
    previousSettings = await prisma.setting.findUnique({ where: { id: 1 } });
    await setSettings(prisma, { pickupEnabled: true, freeShippingThreshold: null });
    const category = await prisma.category.create({
      data: { slug: `e2e-${tag}`, name: `E2E ${tag}` },
    });
    created.categoryId = category.id;
    created.sku = `TK-E2E-${tag}`.toUpperCase();
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: `velador-${tag}`,
        name: "Velador Luna",
        status: "active",
        publishedAt: new Date("2026-01-01"),
        leadTime: "10 días hábiles",
        variants: { create: { sku: created.sku, price: 25_000, stockPhysical: 3 } },
      },
      include: { variants: true },
    });
    created.productId = product.id;
    created.variantId = product.variants[0]?.id ?? "";
  });

  afterAll(async () => {
    await deleteOrders(prisma, await ordersOfProducts(prisma, [created.productId]));
    await deleteProducts(prisma, [created.productId], [created.categoryId]);
    if (previousSettings) {
      await prisma.setting.update({ where: { id: 1 }, data: previousSettings });
    } else {
      await prisma.setting.deleteMany({ where: { id: 1 } });
    }
    await prisma.$disconnect();
  });

  function session(token?: string) {
    const csrf = csrfHeaders(token ? cartSessionKeyOf(token) : "");
    return { ...csrf, cookie: token ? `${csrf.cookie}; ${CART_COOKIE_DEV}=${token}` : csrf.cookie };
  }

  const expectOk = (res: Response, status: number) =>
    expect(res.status, JSON.stringify(res.body)).toBe(status);

  it("CA-01: carrito, cotización, pedido, pago, callback y consulta del pedido confirmado con su correo", async () => {
    // 1. Carrito: dos veladores (hay 3 terminados).
    const added = await request(app)
      .post("/api/v1/cart/items")
      .set(session())
      .send({ sku: created.sku, quantity: 2 });
    expectOk(added, 201);
    const cartToken =
      ([] as string[])
        .concat(added.headers["set-cookie"] ?? [])
        .find((c) => c.startsWith(`${CART_COOKIE_DEV}=`))
        ?.split(";")[0]
        ?.split("=")[1] ?? "";
    expect(cartToken).not.toBe("");

    // 2. Cotización de retiro en taller: lo que el comprador ve antes de pagar.
    const quote = await request(app)
      .get("/api/v1/shipping/quote?method=retiro")
      .set(session(cartToken));
    expectOk(quote, 200);
    expect(quote.body.totals).toMatchObject({ subtotal: 50_000, shipping: 0, total: 50_000 });

    // 3. Pedido de invitado con el total cotizado.
    const placed = await request(app)
      .post("/api/v1/orders")
      .set(session(cartToken))
      .set("Idempotency-Key", randomUUID())
      .send({
        buyer: {
          name: "Josefa Muñoz",
          rut: "12345678-5",
          email: "Josefa@Correo.cl",
          phone: "+56 9 8765 4321",
        },
        delivery: { method: "retiro" },
        billing: { document: "boleta" },
        termsAccepted: true,
        expectedTotal: quote.body.totals.total as number,
      });
    expectOk(placed, 201);
    const orderNumber = placed.body.orderNumber as string;
    const credential = placed.body.accessToken as string;
    expect(placed.body).toMatchObject({
      status: "pending_payment",
      totals: { total: 50_000 },
      items: [{ sku: created.sku, quantity: 2, madeToOrder: false }],
    });

    // 4. Pago con Flow (falso): la API entrega la URL de Flow.
    const payment = await request(app)
      .post("/api/v1/payments/flow/create")
      .set(csrfHeaders())
      .set("X-Order-Access", credential)
      .send({ orderNumber });
    expectOk(payment, 200);
    expect(flow.createPayment).toHaveBeenCalledTimes(1);
    expect(flow.created[0]).toMatchObject({ amount: 50_000 });

    // 5. El comprador paga y Flow avisa por el callback.
    flow.set({ status: "paid", media: "Webpay" });
    const callback = await request(app)
      .post("/api/v1/payments/flow/confirm")
      .type("form")
      .send({ token: flow.token });
    expectOk(callback, 200);

    // 6. Consulta del pedido como invitado: número + correo, y detalle con la credencial.
    const lookup = await request(app)
      .post("/api/v1/orders/lookup")
      .set(csrfHeaders())
      .set("X-Forwarded-For", "203.0.113.41")
      .send({ orderNumber, email: "josefa@correo.cl" });
    expect(lookup.status, "429 por límite de peticiones: el caso no es válido").not.toBe(429);
    expectOk(lookup, 200);
    expect(lookup.body.accessToken).toBe(credential);
    expect(lookup.body.order).toMatchObject({
      orderNumber,
      status: "confirmed",
      statusLabel: "Confirmado",
      buyer: { email: "josefa@correo.cl" },
      totals: { total: 50_000 },
    });
    const detail = await request(app)
      .get(`/api/v1/orders/${orderNumber}`)
      .set("X-Order-Access", credential);
    expectOk(detail, 200);
    expect(detail.body.status).toBe("confirmed");
    expect(detail.body.paidAt).not.toBeNull();

    // 7. En la base: venta asentada una vez, carrito borrado, correos encolados una vez.
    const order = await prisma.order.findUniqueOrThrow({
      where: { number: Number(orderNumber.slice(3)) },
      include: { payments: true, reservations: true },
    });
    expect(order.payments.map((p) => p.status)).toEqual(["paid"]);
    expect(order.reservations.map((r) => r.status)).toEqual(["consumed"]);
    expect(order.cartId).toBeNull();
    expect(
      await prisma.productVariant.findUniqueOrThrow({ where: { id: created.variantId } }),
    ).toMatchObject({ stockPhysical: 1, stockReserved: 0 });
    const emails = await prisma.emailLog.findMany({ where: { orderId: order.id } });
    expect(emails.map((e) => e.event).sort()).toEqual([
      "new_sale",
      "order_received",
      "purchase_confirmed",
    ]);

    // 8. El worker de correos los envía con el adaptador falso (sin red).
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    const sender = new FakeEmailSender();
    try {
      const worker = createEmailWorker({
        prisma,
        sender,
        logger: createLogger("silent", false),
        now: () => new Date(Date.now() + 1000),
        config: {
          siteUrl: "https://tienda.example.com",
          batchSize: 10,
          pollIntervalMs: 10,
          lockTimeoutMs: 5 * 60_000,
          scope: order.id,
        },
      });
      await worker.runOnce();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    const purchase = sender.sent.filter((m) => m.tag === "purchase_confirmed");
    expect(purchase).toHaveLength(1);
    expect(purchase[0]).toMatchObject({
      to: "josefa@correo.cl",
      subject: `Tu compra #${orderNumber} está confirmada`,
    });
    expect(
      (await prisma.emailLog.findMany({ where: { orderId: order.id } })).map((e) => e.status),
    ).toEqual(["sent", "sent", "sent"]);
  });
});

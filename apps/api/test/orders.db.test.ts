import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { verifyOrderAccess } from "../src/lib/order-access.js";
import { CART_COOKIE_DEV, cartSessionKeyOf } from "../src/middleware/cart-session.js";
import { EMAIL_DATA_SCHEMAS, emailEventKey } from "../src/services/email/events.js";
import { FakeEmailSender } from "../src/services/email/fake-sender.js";
import { createEmailWorker } from "../src/services/email/worker.js";
import { setSettings } from "./cart-helpers.js";
import { buildTestApp, csrfHeaders, testEnv } from "./helpers.js";
import { panelHeaders, panelSession } from "./panel-helpers.js";

// Creación del pedido (LN-09) contra totalkids_test. Se omite sin
// TEST_DATABASE_URL. Crea sus datos y los borra al terminar.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("crear pedido de invitado (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const app = buildTestApp({ prisma });
  const id = Math.random().toString(36).slice(2, 8);
  const created = {
    categoryId: "",
    products: [] as string[],
    coupons: [] as string[],
    zones: [] as string[],
  };
  let skuStock = ""; // 2 unidades terminadas
  let skuSolo = ""; // 1 unidad terminada (para la carrera)

  const BODY = {
    buyer: {
      name: "María González",
      rut: "12345678-5",
      email: "Maria@Correo.cl",
      phone: "+56 9 1234 5678",
    },
    delivery: { method: "retiro" },
    billing: { document: "boleta" },
    termsAccepted: true,
  };

  function session(token?: string) {
    const csrf = csrfHeaders(token ? cartSessionKeyOf(token) : "");
    return { ...csrf, cookie: token ? `${csrf.cookie}; ${CART_COOKIE_DEV}=${token}` : csrf.cookie };
  }

  async function cartWith(...items: { sku: string; quantity: number }[]): Promise<string> {
    let token: string | undefined;
    for (const item of items) {
      const res = await request(app).post("/api/v1/cart/items").set(session(token)).send(item);
      expect(res.status).toBe(201);
      const cookie = ([] as string[])
        .concat(res.headers["set-cookie"] ?? [])
        .find((c) => c.startsWith(`${CART_COOKIE_DEV}=`));
      token = cookie?.split(";")[0]?.split("=")[1] ?? token;
    }
    return token ?? "";
  }

  /** Total que vería el comprador con esa entrega (como hace el checkout de la tienda). */
  async function quotedTotal(token: string, delivery: Record<string, unknown>): Promise<number> {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(delivery)
          .filter(([k]) => ["method", "region", "commune"].includes(k))
          .map(([k, v]) => [k, String(v)]),
      ),
    );
    const res = await request(app).get(`/api/v1/shipping/quote?${query}`).set(session(token));
    expect(res.status).toBe(200);
    return (res.body as { totals: { total: number } }).totals.total;
  }

  /** Crea el pedido; sin `expectedTotal` en el cuerpo, usa el total cotizado. */
  async function order(token: string, body: Record<string, unknown> = BODY, key = randomUUID()) {
    const expectedTotal =
      body.expectedTotal ?? (await quotedTotal(token, body.delivery as Record<string, unknown>));
    return request(app)
      .post("/api/v1/orders")
      .set(session(token))
      .set("Idempotency-Key", key)
      .send({ ...body, expectedTotal });
  }

  let previousSettings: Awaited<ReturnType<typeof prisma.setting.findUnique>> = null;

  beforeAll(async () => {
    // Otros archivos cambian la configuración única: retiro habilitado y sin umbral.
    // Al terminar se deja como estaba (db-integrity espera poder crearla).
    previousSettings = await prisma.setting.findUnique({ where: { id: 1 } });
    await setSettings(prisma, { pickupEnabled: true, freeShippingThreshold: null });
    const category = await prisma.category.create({
      data: { slug: `pedidos-${id}`, name: "Pedidos" },
    });
    created.categoryId = category.id;
    const product = async (slug: string, price: number, stockPhysical: number) => {
      const row = await prisma.product.create({
        data: {
          categoryId: category.id,
          slug: `${slug}-${id}`,
          name: slug,
          status: "active",
          publishedAt: new Date("2026-01-01"),
          leadTime: "10 días hábiles",
          variants: { create: { sku: `TK-${slug}-${id}`.toUpperCase(), price, stockPhysical } },
        },
      });
      created.products.push(row.id);
      return `TK-${slug}-${id}`.toUpperCase();
    };
    skuStock = await product("mesa", 50_000, 2);
    skuSolo = await product("silla", 20_000, 1);
    const zone = await prisma.shippingZone.create({
      data: { region: "AR", commune: `Temuco-${id}`, price: 4_990, leadTime: "3 a 5 días hábiles" },
    });
    created.zones.push(zone.id);
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { items: { some: { variant: { productId: { in: created.products } } } } },
      select: { id: true, idempotencyKey: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.inventoryMovement.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItemExtra.deleteMany({ where: { orderItem: { orderId: { in: ids } } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    const emails = await prisma.emailLog.findMany({
      where: { orderId: { in: ids } },
      select: { id: true, outboxJobId: true },
    });
    await prisma.emailAttempt.deleteMany({ where: { emailId: { in: emails.map((e) => e.id) } } });
    await prisma.emailLog.deleteMany({ where: { id: { in: emails.map((e) => e.id) } } });
    await prisma.outboxJob.deleteMany({
      where: { eventKey: { in: ids.map((o) => emailEventKey("order_received", o)) } },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { key: { in: orders.map((o) => o.idempotencyKey) } },
    });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.cart.deleteMany({
      where: { items: { some: { variant: { productId: { in: created.products } } } } },
    });
    await prisma.coupon.deleteMany({ where: { id: { in: created.coupons } } });
    await prisma.shippingZone.deleteMany({ where: { id: { in: created.zones } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.category.deleteMany({ where: { id: created.categoryId } });
    if (previousSettings) {
      await prisma.setting.update({ where: { id: 1 }, data: previousSettings });
    } else {
      await prisma.setting.deleteMany({ where: { id: 1 } });
    }
    await prisma.$disconnect();
  });

  it("crea el pedido con foto, totales del servidor, reserva parcial y a pedido", async () => {
    // 3 mesas: 2 terminadas se reservan, 1 se fabrica a pedido.
    const token = await cartWith({ sku: skuStock, quantity: 3 });
    const res = await order(token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "pending_payment",
      totals: { subtotal: 150_000, discount: 0, shipping: 0, total: 150_000 },
      delivery: { method: "retiro", leadTime: null },
      items: [
        {
          sku: skuStock,
          quantity: 3,
          unitPrice: 50_000,
          lineTotal: 150_000,
          madeToOrder: true,
          leadTime: "10 días hábiles",
        },
      ],
    });
    expect(res.body.orderNumber).toMatch(/^TK-\d{4,}$/);
    const number = Number((res.body.orderNumber as string).slice(3));
    expect(number).toBeGreaterThanOrEqual(1001);

    const saved = await prisma.order.findUniqueOrThrow({
      where: { number },
      include: { items: true, reservations: true, statusHistory: true, movements: true },
    });
    expect(
      verifyOrderAccess(testEnv.CSRF_SECRET ?? "", saved.id, res.body.accessToken as string),
    ).toBe(true);
    expect(saved).toMatchObject({
      buyerName: "María González",
      buyerRut: "12.345.678-5",
      buyerEmail: "maria@correo.cl",
      buyerPhone: "+56912345678",
      deliveryMethod: "pickup",
      taxDocument: "boleta",
      termsVersion: "v1-provisional",
    });
    expect(saved.reservations.map((r) => r.quantity)).toEqual([2]);
    expect(saved.movements).toMatchObject([
      { kind: "reservation", reservedDelta: 2, reservedAfter: 2, actorLabel: "Sistema" },
    ]);
    expect(saved.statusHistory).toMatchObject([{ fromStatus: null, toStatus: "pending_payment" }]);
    expect(saved.paymentDueAt.getTime()).toBeGreaterThan(saved.createdAt.getTime());
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { sku: skuStock } });
    expect(variant).toMatchObject({ stockPhysical: 2, stockReserved: 2 });
    // El correo "pedido recibido" queda encolado con su registro (detalle en su propio caso).
    expect(
      await prisma.emailLog.count({
        where: { orderId: saved.id, eventKey: emailEventKey("order_received", saved.id) },
      }),
    ).toBe(1);

    // Libera el stock para los demás casos.
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  // ── Correo "pedido recibido" (SRS 4.4.3, RF-20) ─────────────────────────────

  it("encola el correo «pedido recibido» con su registro, sin duplicarlo al repetir", async () => {
    // 3 mesas con 2 terminadas: la línea queda a pedido con su plazo.
    const token = await cartWith({ sku: skuStock, quantity: 3 });
    const key = randomUUID();
    const res = await order(token, BODY, key);
    expect(res.status).toBe(201);
    const saved = await prisma.order.findUniqueOrThrow({
      where: { number: Number((res.body.orderNumber as string).slice(3)) },
    });
    // El pedido recuerda su carrito: se vacía al confirmarse el pago (LN-11).
    expect(saved.cartId).not.toBeNull();
    const eventKey = emailEventKey("order_received", saved.id);

    const job = await prisma.outboxJob.findUniqueOrThrow({ where: { eventKey } });
    const log = await prisma.emailLog.findUniqueOrThrow({ where: { eventKey } });
    expect(job).toMatchObject({ type: "email.order_received", status: "pending" });
    expect(log).toMatchObject({
      event: "order_received",
      recipient: "maria@correo.cl",
      orderId: saved.id,
      outboxJobId: job.id,
      status: "pending",
    });
    // Datos completos y válidos para la plantilla; nada de pago ni datos tributarios.
    expect(EMAIL_DATA_SCHEMAS.order_received.safeParse(job.payload).success).toBe(true);
    expect(job.payload).toEqual({
      orderNumber: saved.number,
      buyerName: "María González",
      items: [
        {
          name: "mesa",
          variant: null,
          quantity: 3,
          unitPrice: 50_000,
          lineTotal: 150_000,
          extras: [],
          madeToOrder: true,
          leadTime: "10 días hábiles",
        },
      ],
      subtotal: 150_000,
      discount: 0,
      shippingCost: 0,
      total: 150_000,
      paymentDueAt: saved.paymentDueAt.toISOString(),
      delivery: { method: "pickup", pickupDetails: saved.pickupDetails, leadTime: null },
    });
    expect(JSON.stringify(job.payload)).not.toMatch(/rut|phone|payment"|token|12\.345/i);

    // La misma Idempotency-Key devuelve el pedido sin encolar otro correo.
    const again = await order(token, BODY, key);
    expect(again.status).toBe(200);
    expect(await prisma.outboxJob.count({ where: { eventKey } })).toBe(1);
    expect(await prisma.emailLog.count({ where: { orderId: saved.id } })).toBe(1);

    // El worker de LN-14 con el adaptador falso lo envía (sin red).
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const sender = new FakeEmailSender();
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
          scope: saved.id,
        },
      });
      expect(await worker.runOnce()).toEqual({ processed: 1, released: 0 });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]).toMatchObject({
        to: "maria@correo.cl",
        subject: `Recibimos tu pedido #${res.body.orderNumber as string}`,
        tag: "order_received",
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const sent = await prisma.emailLog.findUniqueOrThrow({
      where: { eventKey },
      include: { attempts: true },
    });
    expect(sent.status).toBe("sent");
    expect(sent.attempts).toMatchObject([{ kind: "automatic", result: "sent" }]);

    // El panel lo muestra en el detalle del pedido (y desde ahí se puede reenviar).
    const { token: admin } = await panelSession(prisma, "admin");
    const detail = await request(app)
      .get(`/api/v1/admin/orders/${res.body.orderNumber as string}`)
      .set(panelHeaders(admin));
    expect(detail.status).toBe(200);
    expect(detail.body.emails).toMatchObject([
      { id: sent.id, event: "order_received", recipient: "maria@correo.cl", status: "sent" },
    ]);

    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("idempotente: misma clave y cuerpo devuelve el mismo pedido; otro cuerpo, 409", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const key = randomUUID();
    const first = await order(token, BODY, key);
    const again = await order(token, BODY, key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);

    const other = await order(
      token,
      {
        ...BODY,
        billing: { document: "boleta" },
        delivery: {
          method: "despacho",
          region: "AR",
          commune: `Temuco-${id}`,
          street: "Av. Alemania 1",
        },
      },
      key,
    );
    expect(other.status).toBe(409);
    expect(other.body.details.reason).toBe("idempotency_mismatch");
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("despacho a la zona: tarifa en el total y foto de la dirección; factura con sus datos", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const res = await order(token, {
      ...BODY,
      delivery: {
        method: "despacho",
        region: "AR",
        commune: `temuco-${id}`,
        street: "Av. Alemania 0123",
        unit: "Depto 4",
      },
      billing: {
        document: "factura",
        rut: "76.123.456-0",
        businessName: "Jardín Los Peques SpA",
        activity: "Educación preescolar",
        email: "Facturas@Peques.cl",
        address: "Calle Uno 123",
        commune: "Temuco",
        purchaseOrder: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      totals: { subtotal: 50_000, shipping: 4_990, total: 54_990 },
      delivery: { method: "despacho", leadTime: "3 a 5 días hábiles" },
    });
    const saved = await prisma.order.findUniqueOrThrow({
      where: { number: Number((res.body.orderNumber as string).slice(3)) },
    });
    expect(saved).toMatchObject({
      deliveryMethod: "shipping",
      shippingRegion: "AR",
      shippingStreet: "Av. Alemania 0123",
      shippingUnit: "Depto 4",
      shippingCost: 4_990,
      taxDocument: "factura",
      invoiceRut: "76.123.456-0",
      invoiceEmail: "facturas@peques.cl",
      purchaseOrderRequired: true,
    });
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("con cupón: descuenta, reserva el uso y no supera el cupo", async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: `PEDIDO${id.toUpperCase()}`,
        kind: "percent",
        value: 10,
        startsOn: new Date("2026-01-01"),
        endsOn: new Date("2030-12-31"),
        maxUses: 1,
      },
    });
    created.coupons.push(coupon.id);
    const first = await cartWith({ sku: skuStock, quantity: 1 });
    const second = await cartWith({ sku: skuStock, quantity: 1 });
    for (const token of [first, second]) {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set(session(token))
        .send({ code: coupon.code });
      expect(res.status).toBe(200);
    }
    const ok = await order(first);
    expect(ok.status).toBe(201);
    expect(ok.body.totals).toMatchObject({ subtotal: 50_000, discount: 5_000, total: 45_000 });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount).toBe(1);

    // El segundo carrito aplicó el cupón antes: ahora está agotado y no se crea el pedido.
    const rejected = await order(second);
    expect(rejected.status).toBe(409);
    expect(rejected.body.details.reason).toBe("coupon_invalid");
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("dos compras por la última unidad: solo una la reserva; la otra queda a pedido", async () => {
    const [a, b] = [
      await cartWith({ sku: skuSolo, quantity: 1 }),
      await cartWith({ sku: skuSolo, quantity: 1 }),
    ];
    const results = await Promise.all([order(a), order(b)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const madeToOrder = results
      .map((r) => (r.body.items as { madeToOrder: boolean }[])[0]?.madeToOrder)
      .sort();
    expect(madeToOrder).toEqual([false, true]);
    expect(
      await prisma.productVariant.findUniqueOrThrow({ where: { sku: skuSolo } }),
    ).toMatchObject({
      stockPhysical: 1,
      stockReserved: 1,
    });
  });

  it("si el precio cambió desde que el comprador vio el total, 409 y no se crea nada", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const seen = await quotedTotal(token, { method: "retiro" });
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { price: 55_000 } });
    try {
      const before = await prisma.order.count();
      const res = await order(token, { ...BODY, expectedTotal: seen });
      expect(res.status).toBe(409);
      expect(res.body.details).toMatchObject({
        reason: "total_changed",
        totals: { subtotal: 55_000, total: 55_000 },
      });
      expect(await prisma.order.count()).toBe(before);
      expect(
        (await prisma.productVariant.findUniqueOrThrow({ where: { sku: skuStock } })).stockReserved,
      ).toBe(0);
    } finally {
      await prisma.productVariant.update({ where: { sku: skuStock }, data: { price: 50_000 } });
    }
  });

  it("un carrito con productos retirados no se puede pedir", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const productId = created.products[0] ?? "";
    await prisma.product.update({ where: { id: productId }, data: { status: "inactive" } });
    try {
      const res = await order(token);
      expect(res.status).toBe(409);
      expect(res.body.details.reason).toBe("cart_blocked");
    } finally {
      await prisma.product.update({ where: { id: productId }, data: { status: "active" } });
    }
  });

  // ── Consulta del pedido (RF-23, RF-36) ─────────────────────────────────────

  const lookup = (orderNumber: string, email: string) =>
    request(app).post("/api/v1/orders/lookup").set(csrfHeaders()).send({ orderNumber, email });

  const detail = (orderNumber: string, credential?: string) => {
    const req = request(app).get(`/api/v1/orders/${orderNumber}`);
    return credential ? req.set("X-Order-Access", credential) : req;
  };

  it("número + correo entregan el pedido y la misma credencial de la creación", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const created_ = await order(token);
    const number = created_.body.orderNumber as string;

    // El número y el correo no distinguen formato ni mayúsculas.
    const res = await lookup(number.toLowerCase(), "MARIA@correo.cl");
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe(created_.body.accessToken);
    expect(res.body.order).toMatchObject({
      orderNumber: number,
      status: "pending_payment",
      statusLabel: "Pendiente de pago",
      buyer: { name: "María González", email: "maria@correo.cl" },
      delivery: { method: "retiro" },
      billing: { document: "boleta", invoice: null },
      totals: { subtotal: 50_000, total: 50_000 },
      paymentStatus: null,
      history: [{ status: "pending_payment", label: "Pendiente de pago" }],
    });
    expect(res.body.order.items).toHaveLength(1);
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("número inexistente o correo equivocado: el mismo 404 genérico", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const number = (await order(token)).body.orderNumber as string;
    const wrongEmail = await lookup(number, "otra@correo.cl");
    const missing = await lookup("TK-999999999", "maria@correo.cl");
    expect([wrongEmail.status, missing.status]).toEqual([404, 404]);
    expect(wrongEmail.body.message).toBe(missing.body.message);
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("el detalle exige la credencial de ESE pedido y muestra seguimiento y factura", async () => {
    const [first, second] = [
      await order(await cartWith({ sku: skuStock, quantity: 1 })),
      await order(await cartWith({ sku: skuStock, quantity: 1 })),
    ];
    const number = first.body.orderNumber as string;
    expect((await detail(number)).status).toBe(401);
    // La credencial de otro pedido no sirve: mismo 404 que un pedido inexistente.
    expect((await detail(number, second.body.accessToken as string)).status).toBe(404);
    expect((await detail("TK-999999999", first.body.accessToken as string)).status).toBe(404);

    // Confirmado por el sistema, con una nota interna que el comprador no debe ver.
    const saved = await prisma.order.findUniqueOrThrow({
      where: { number: Number(number.slice(3)) },
    });
    await prisma.order.update({
      where: { id: saved.id },
      data: { status: "confirmed", paidAt: new Date() },
    });
    await prisma.orderStatusHistory.create({
      data: {
        orderId: saved.id,
        fromStatus: "pending_payment",
        toStatus: "confirmed",
        actorLabel: "Sistema",
        reason: "Nota interna",
      },
    });
    const res = await detail(number, first.body.accessToken as string);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orderNumber: number,
      status: "confirmed",
      statusLabel: "Confirmado",
    });
    expect(res.body.paidAt).not.toBeNull();
    expect(res.body.history.map((h: { status: string }) => h.status)).toEqual([
      "pending_payment",
      "confirmed",
    ]);
    // El historial del comprador no expone actores ni notas internas.
    expect(JSON.stringify(res.body.history)).not.toContain("Nota interna");
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  // ── LN-17: acceso ajeno (CA-07) y cambio de precio (CA-08) ─────────────────

  it("CA-07: lookup y detalle ajenos: 404 con solo el formato de error, sin datos del pedido", async () => {
    const otherBuyer = { ...BODY, buyer: { ...BODY.buyer, email: "pedro@correo.cl" } };
    const mine = await order(await cartWith({ sku: skuStock, quantity: 1 }));
    const theirs = await order(await cartWith({ sku: skuStock, quantity: 1 }), otherBuyer);
    expect([mine.status, theirs.status]).toEqual([201, 201]);
    const theirNumber = theirs.body.orderNumber as string;

    // IP propia: el límite de consultas (10 cada 15 min) no se mezcla con los otros casos.
    const lookupFrom = (orderNumber: string, email: string) =>
      request(app)
        .post("/api/v1/orders/lookup")
        .set(csrfHeaders())
        .set("X-Forwarded-For", "203.0.113.17")
        .send({ orderNumber, email });

    const denied = [
      // Correo del pedido A con el número del pedido B.
      await lookupFrom(theirNumber, "maria@correo.cl"),
      // Correo parecido (otro dominio).
      await lookupFrom(theirNumber, "pedro@correo.com"),
      // Credencial de A para ver el detalle de B.
      await detail(theirNumber, mine.body.accessToken as string),
      // Credencial alterada.
      await detail(theirNumber, `${(theirs.body.accessToken as string).slice(0, -2)}xx`),
    ];
    for (const res of denied) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      // Solo el cuerpo de error estándar: nada del pedido ajeno.
      expect(Object.keys(res.body as object).sort()).toEqual(
        expect.arrayContaining(["code", "message"]),
      );
      expect(res.body).not.toHaveProperty("order");
      expect(res.body).not.toHaveProperty("accessToken");
      expect(res.body).not.toHaveProperty("orderNumber");
      const text = JSON.stringify(res.body);
      for (const secret of [
        "pedro@correo.cl",
        "María",
        "González",
        "12.345.678-5",
        theirs.body.accessToken as string,
        theirNumber.slice(3),
      ]) {
        expect(text).not.toContain(secret);
      }
    }
    // El mensaje no distingue «existe pero no es tuyo» de «no existe».
    const missing = await lookupFrom("TK-999999999", "pedro@correo.cl");
    expect(missing.status).toBe(404);
    expect(denied[0]?.body.message).toBe(missing.body.message);
    expect(denied[0]?.body.code).toBe(missing.body.code);

    // El dueño sí accede, con su correo.
    const own = await lookupFrom(theirNumber, "Pedro@Correo.cl");
    expect(own.status).toBe(200);
    expect(own.body.accessToken).toBe(theirs.body.accessToken);
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { stockReserved: 0 } });
  });

  it("CA-08: tras el 409 por cambio de precio, reintentar con el total informado crea el pedido", async () => {
    const token = await cartWith({ sku: skuStock, quantity: 1 });
    const seen = await quotedTotal(token, { method: "retiro" });
    await prisma.productVariant.update({ where: { sku: skuStock }, data: { price: 52_000 } });
    try {
      const changed = await order(token, { ...BODY, expectedTotal: seen });
      expect(changed.status).toBe(409);
      expect(changed.body.details.reason).toBe("total_changed");
      const informed = (changed.body.details as { totals: { total: number } }).totals.total;
      expect(informed).toBe(52_000);

      // El comprador acepta el nuevo total (nuevo intento, nueva clave).
      const accepted = await order(token, { ...BODY, expectedTotal: informed });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
      expect(accepted.body.totals).toMatchObject({ subtotal: 52_000, total: 52_000 });
      expect(accepted.body.items[0]).toMatchObject({ unitPrice: 52_000, lineTotal: 52_000 });
    } finally {
      await prisma.productVariant.update({
        where: { sku: skuStock },
        data: { price: 50_000, stockReserved: 0 },
      });
    }
  });
});

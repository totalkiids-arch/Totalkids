import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { verifyOrderAccess } from "../src/lib/order-access.js";
import { hashToken } from "../src/lib/secrets.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { buildTestApp, csrfHeaders, testEnv } from "./helpers.js";

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
    const csrf = csrfHeaders(token ? `|carrito:${hashToken(token)}` : "");
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

  const order = (token: string, body: object = BODY, key = randomUUID()) =>
    request(app).post("/api/v1/orders").set(session(token)).set("Idempotency-Key", key).send(body);

  beforeAll(async () => {
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
          variants: { create: { sku: `TK-${slug}-${id}`, price, stockPhysical } },
        },
      });
      created.products.push(row.id);
      return `TK-${slug}-${id}`;
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
    await prisma.outboxJob.deleteMany({
      where: { eventKey: { in: ids.map((o) => `email.order_received:${o}`) } },
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
    expect(
      await prisma.outboxJob.count({ where: { eventKey: `email.order_received:${saved.id}` } }),
    ).toBe(1);

    // Libera el stock para los demás casos.
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
});

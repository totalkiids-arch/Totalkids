import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// API del carrito (LN-06) contra totalkids_test. Requiere docker compose up y
// pnpm db:migrate:test; se omite sin TEST_DATABASE_URL. Crea su propio catálogo
// y lo borra al terminar.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("carrito de invitado (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const app = buildTestApp({ prisma });
  const created = { categories: [] as string[], products: [] as string[], extras: [] as string[] };
  let skuCuna = "";
  let skuMesa = "";
  let mesaProductId = "";

  /** Cabeceras para modificar: cookie del carrito (si hay) y CSRF atado a esa sesión. */
  function session(token?: string) {
    const csrf = csrfHeaders(token ? `|carrito:${hashToken(token)}` : "");
    return {
      ...csrf,
      cookie: token ? `${csrf.cookie}; ${CART_COOKIE_DEV}=${token}` : csrf.cookie,
    };
  }

  /** Token del carrito en el Set-Cookie de la respuesta. */
  function tokenFrom(res: request.Response): string | undefined {
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const line = cookies.find((c) => c.startsWith(`${CART_COOKIE_DEV}=`));
    return line?.split(";")[0]?.split("=")[1];
  }

  const add = (body: object, token?: string) =>
    request(app).post("/api/v1/cart/items").set(session(token)).send(body);

  beforeAll(async () => {
    const id = Math.random().toString(36).slice(2, 8);
    const category = await prisma.category.create({
      data: { slug: `cart-${id}`, name: "Carrito" },
    });
    created.categories.push(category.id);
    const armado = await prisma.extra.create({
      data: { code: `cart-armado-${id}`, name: "Armado a domicilio", price: 15_000 },
    });
    const nombre = await prisma.extra.create({
      data: {
        code: `cart-nombre-${id}`,
        name: "Nombre grabado",
        price: null,
        requiresText: true,
        textLabel: "Nombre",
        textMaxLength: 12,
      },
    });
    created.extras.push(armado.id, nombre.id);

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
          extras: {
            create: [
              { extraId: armado.id, sortOrder: 0 },
              { extraId: nombre.id, sortOrder: 1 },
            ],
          },
        },
      });
      created.products.push(row.id);
      return { id: row.id, sku: `TK-${slug}-${id}` };
    };
    skuCuna = (await product("cuna", 245_990, 0)).sku;
    const mesa = await product("mesa", 69_990, 5);
    skuMesa = mesa.sku;
    mesaProductId = mesa.id;
  });

  afterAll(async () => {
    // Los carritos de prueba referencian las variantes: se borran primero.
    await prisma.cart.deleteMany({
      where: { items: { some: { variant: { productId: { in: created.products } } } } },
    });
    await prisma.productExtra.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.extra.deleteMany({ where: { id: { in: created.extras } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.category.deleteMany({ where: { id: { in: created.categories } } });
    await prisma.$disconnect();
  });

  it("GET /cart sin cookie responde un carrito vacío y no lo crea", async () => {
    const res = await request(app).get("/api/v1/cart");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.body).toMatchObject({
      lines: [],
      units: 0,
      coupon: null,
      totals: { subtotal: 0, discount: 0, shipping: null, total: 0 },
      checkoutReady: false,
    });
  });

  it("modificar exige el token CSRF", async () => {
    const res = await request(app).post("/api/v1/cart/items").send({ sku: skuCuna, quantity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_FAILED");
  });

  it("el primer agregado crea el carrito con cookie opaca y valoriza en el servidor", async () => {
    const res = await add({ sku: skuCuna, quantity: 2 });
    expect(res.status).toBe(201);
    const token = tokenFrom(res);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";")).toMatch(/HttpOnly/i);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0]).toMatchObject({
      sku: skuCuna,
      quantity: 2,
      unitPrice: 245_990,
      lineTotal: 491_980,
      // Sin unidades terminadas: a pedido, con el plazo del producto, sin bloquear.
      madeToOrder: true,
      leadTime: "10 días hábiles",
      status: "ok",
    });
    expect(res.body).toMatchObject({
      units: 2,
      totals: { subtotal: 491_980, total: 491_980 },
      checkoutReady: true,
    });

    // La base guarda el hash, nunca el token.
    const cart = await prisma.cart.findUnique({
      where: { guestTokenHash: hashToken(token ?? "") },
    });
    expect(cart).not.toBeNull();
  });

  it("al crearse el carrito, el CSRF anterior ya no sirve (hay que pedir uno nuevo)", async () => {
    const first = await add({ sku: skuMesa, quantity: 1 });
    const token = tokenFrom(first) ?? "";
    const stale = csrfHeaders("");
    const res = await request(app)
      .post("/api/v1/cart/items")
      .set({ ...stale, cookie: `${stale.cookie}; ${CART_COOKIE_DEV}=${token}` })
      .send({ sku: skuMesa, quantity: 1 });
    expect(res.status).toBe(403);
    expect((await add({ sku: skuMesa, quantity: 1 }, token)).status).toBe(201);
  });

  it("la misma combinación suma; otro extra o texto es otra línea", async () => {
    const [armado, nombre] = await prisma.extra.findMany({
      where: { id: { in: created.extras } },
      orderBy: { name: "asc" },
    });
    const token = tokenFrom(await add({ sku: skuMesa, quantity: 1 })) ?? "";
    await add({ sku: skuMesa, quantity: 2 }, token);
    await add({ sku: skuMesa, quantity: 1, extras: [{ code: armado?.code }] }, token);
    const res = await add(
      { sku: skuMesa, quantity: 1, extras: [{ code: nombre?.code, text: " Sofía " }] },
      token,
    );
    expect(res.status).toBe(201);
    const lines = res.body.lines as {
      quantity: number;
      extras: { name: string; text: string | null }[];
      extrasUnitPrice: number;
    }[];
    expect(lines.map((l) => l.quantity)).toEqual([3, 1, 1]);
    expect(lines[1]).toMatchObject({ extrasUnitPrice: 15_000 });
    expect(lines[2]?.extras).toEqual([
      { code: nombre?.code, name: "Nombre grabado", unitPrice: null, text: "Sofía" },
    ]);
    // El nombre grabado tiene precio por confirmar: se informa y no suma.
    expect(res.body.unpriced).toEqual(["Nombre grabado"]);
    // Mesa con 5 unidades terminadas: 3 no son a pedido.
    expect(res.body.lines[0].madeToOrder).toBe(false);
  });

  it("respeta el máximo por SKU y valida el pedido", async () => {
    const token = tokenFrom(await add({ sku: skuCuna, quantity: 8 })) ?? "";
    const over = await add({ sku: skuCuna, quantity: 2 }, token);
    expect(over.status).toBe(409);
    expect(over.body.message).toBe("Solo puedes agregar 1 unidad más.");

    expect((await add({ sku: "TK-NO-EXISTE", quantity: 1 }, token)).status).toBe(404);
    const invalid = await add({ sku: skuCuna, quantity: 0 }, token);
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe("VALIDATION_ERROR");
    const badText = await add(
      { sku: skuCuna, quantity: 1, extras: [{ code: "no-se-ofrece" }] },
      token,
    );
    expect(badText.status).toBe(422);
  });

  it("cambia la cantidad, quita líneas y no toca líneas de otro carrito", async () => {
    const mine = tokenFrom(await add({ sku: skuMesa, quantity: 1 })) ?? "";
    const other = tokenFrom(await add({ sku: skuMesa, quantity: 1 })) ?? "";
    const lineId = (
      await request(app).get("/api/v1/cart").set("cookie", `${CART_COOKIE_DEV}=${mine}`)
    ).body.lines[0].id as string;

    const foreign = await request(app)
      .patch(`/api/v1/cart/items/${lineId}`)
      .set(session(other))
      .send({ quantity: 4 });
    expect(foreign.status).toBe(404);

    const updated = await request(app)
      .patch(`/api/v1/cart/items/${lineId}`)
      .set(session(mine))
      .send({ quantity: 4 });
    expect(updated.status).toBe(200);
    expect(updated.body.lines[0].quantity).toBe(4);

    const tooMany = await request(app)
      .patch(`/api/v1/cart/items/${lineId}`)
      .set(session(mine))
      .send({ quantity: 10 });
    expect(tooMany.status).toBe(422);

    const removed = await request(app).delete(`/api/v1/cart/items/${lineId}`).set(session(mine));
    expect(removed.status).toBe(200);
    expect(removed.body.lines).toEqual([]);
    expect(
      (await request(app).delete(`/api/v1/cart/items/${lineId}`).set(session(mine))).status,
    ).toBe(404);
    expect(
      (await request(app).delete("/api/v1/cart/items/no-es-uuid").set(session(mine))).status,
    ).toBe(404);
  });

  it("revalida: un producto retirado bloquea el pago hasta quitarlo", async () => {
    const token = tokenFrom(await add({ sku: skuMesa, quantity: 1 })) ?? "";
    await prisma.product.update({ where: { id: mesaProductId }, data: { status: "inactive" } });
    try {
      const res = await request(app)
        .get("/api/v1/cart")
        .set("cookie", `${CART_COOKIE_DEV}=${token}`);
      expect(res.body.lines[0]).toMatchObject({ status: "unavailable", lineTotal: null });
      expect(res.body).toMatchObject({
        blocked: true,
        checkoutReady: false,
        totals: { subtotal: 0 },
      });
    } finally {
      await prisma.product.update({ where: { id: mesaProductId }, data: { status: "active" } });
    }
  });

  it("las rutas del carrito declaran sus métodos (405)", async () => {
    const res = await request(app).put("/api/v1/cart").set(session());
    expect(res.status).toBe(405);
  });
});

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/lib/prisma.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { CartClient, setSettings, shopFixture } from "./cart-helpers.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";
import { inRollback } from "./panel-helpers.js";

// Carrito (LN-06, RF-05 a RF-08) contra totalkids_test. Cada caso corre en una
// transacción que se deshace: no altera los conteos de catalog.db.test.ts.
// Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

interface CartBody {
  lines: {
    id: string;
    sku: string;
    quantity: number;
    status: string;
    unitPrice: number | null;
    lineTotal: number | null;
    extras: { code: string; price: number | null; text: string | null }[];
    availability: { status: string; inStock: number; leadTime: string | null; message: string };
    notices: { code: string; message: string }[];
  }[];
  notices: { code: string; message: string }[];
  totals: {
    units: number;
    subtotal: number;
    discount: number;
    totalWithoutShipping: number;
    unpriced: string[];
  };
  freeShipping: { threshold: number; remaining: number; percent: number; reached: boolean } | null;
  canCheckout: boolean;
}

const body = (res: { body: unknown }) => res.body as CartBody;

describe.skipIf(!url)("carrito /cart (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Caso aislado: app sobre una transacción que se deshace, con producto de prueba. */
  function scenario(
    fn: (ctx: {
      db: PrismaClient;
      client: CartClient;
      app: ReturnType<typeof buildTestApp>;
      shop: Awaited<ReturnType<typeof shopFixture>>;
    }) => Promise<void>,
  ) {
    return () =>
      inRollback(prisma, async (db) => {
        const app = buildTestApp({ prisma: db });
        const shop = await shopFixture(db);
        await fn({ db, app, shop, client: new CartClient(app) });
      });
  }

  it(
    "GET sin cookie: carrito vacío y no crea filas",
    scenario(async ({ db, client }) => {
      const before = await db.cart.count();
      const res = await client.get("/cart");
      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(body(res).lines).toEqual([]);
      expect(body(res).totals).toMatchObject({ units: 0, subtotal: 0, discount: 0 });
      expect(body(res).canCheckout).toBe(false);
      expect(await db.cart.count()).toBe(before);
    }),
  );

  it(
    "el primer POST crea la cookie opaca (HttpOnly, solo el hash en la base) y un CSRF nuevo",
    scenario(async ({ db, app, client, shop }) => {
      const res = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      expect(res.status).toBe(201);
      const setCookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
        c.startsWith(`${CART_COOKIE_DEV}=`),
      );
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);
      expect(setCookie).toMatch(/Path=\//);
      expect(client.cart).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(res.headers["x-csrf-token"]).toBe(client.csrf);

      const cart = await db.cart.findUniqueOrThrow({
        where: { guestTokenHash: hashToken(client.cart ?? "") },
      });
      expect(cart.guestTokenHash).not.toContain(client.cart);
      expect(cart.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);

      // Con la cookie del carrito, el CSRF anterior (sin sesión) ya no vale.
      const stale = await request(app)
        .post("/api/v1/cart/items")
        .set({
          ...csrfHeaders(),
          cookie: `${csrfHeaders().cookie}; ${CART_COOKIE_DEV}=${client.cart ?? ""}`,
        })
        .send({ sku: shop.skuA, quantity: 1 });
      expect(stale.status).toBe(403);
      // El nuevo sí, sin pedir /csrf otra vez.
      const again = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      expect(again.status).toBe(201);
      expect(again.headers["set-cookie"]).toBeUndefined();
      expect(body(again).lines[0]?.quantity).toBe(2);
    }),
  );

  it(
    "la misma combinación suma; otro extra u otro texto es otra línea",
    scenario(async ({ client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1, extras: [shop.armado] });
      let res = await client.post("/cart/items", {
        sku: shop.skuA.toLowerCase(),
        quantity: 2,
        extras: [shop.armado, shop.armado],
      });
      expect(body(res).lines).toHaveLength(1);
      expect(body(res).lines[0]).toMatchObject({
        quantity: 3,
        unitPrice: 15_000,
        lineTotal: 45_000,
      });

      res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 1,
        extras: [shop.nombre],
        texts: { [shop.nombre]: "Sofía" },
      });
      expect(body(res).lines).toHaveLength(2);
      // Mismo texto con espacios de más: misma línea.
      res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 1,
        extras: [shop.nombre],
        texts: { [shop.nombre]: "  Sofía " },
      });
      expect(body(res).lines).toHaveLength(2);
      const named = body(res).lines.find((l) => l.extras.some((e) => e.code === shop.nombre));
      expect(named).toMatchObject({ quantity: 2, unitPrice: 10_000 });
      expect(named?.extras[0]).toMatchObject({ text: "Sofía", price: null });
      // Otro nombre: otra línea.
      res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 1,
        extras: [shop.nombre],
        texts: { [shop.nombre]: "Tomás" },
      });
      expect(body(res).lines).toHaveLength(3);
      expect(body(res).totals).toMatchObject({ units: 6, subtotal: 75_000 });
      // El extra con precio por confirmar no suma y se informa, sin bloquear.
      expect(body(res).totals.unpriced).toEqual(["Nombre grabado"]);
      expect(body(res).canCheckout).toBe(true);
    }),
  );

  it(
    "extras no ofrecidos, texto faltante o largo, y cantidades fuera de rango → 422",
    scenario(async ({ client, shop }) => {
      let res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 1,
        extras: [shop.barniz],
      });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        message: "Uno de los servicios elegidos ya no está disponible.",
      });

      res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 1,
        extras: [shop.nombre],
      });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        message: "Revisa el nombre del niño (máximo 12 caracteres).",
      });
      res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 1,
        extras: [shop.nombre],
        texts: { [shop.nombre]: "Maximiliano José" },
      });
      expect(res.status).toBe(422);

      for (const quantity of [0, 10, 1.5]) {
        res = await client.post("/cart/items", { sku: shop.skuA, quantity });
        expect(res.status).toBe(422);
      }

      res = await client.post("/cart/items", { sku: shop.skuA, quantity: 8 });
      expect(res.status).toBe(201);
      res = await client.post("/cart/items", {
        sku: shop.skuA,
        quantity: 2,
        extras: [shop.armado],
      });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ message: "Solo puedes agregar 1 unidad más." });
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      res = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      expect(res.body).toMatchObject({
        message: "Ya tienes 9 unidades en el carrito. Para más, escríbenos y lo cotizamos.",
      });

      res = await client.post("/cart/items", { sku: "NO-EXISTE", quantity: 1 });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ message: "Este producto ya no está disponible." });
    }),
  );

  it(
    "tope de 30 líneas por carrito",
    scenario(async ({ db, client, shop }) => {
      await db.productVariant.createMany({
        data: Array.from({ length: 30 }, (_, i) => ({
          productId: shop.productId,
          sku: `${shop.skuA}-${String(i)}`,
          optionLabel: `Opción ${String(i)}`,
          price: 1_000,
          sortOrder: 10 + i,
        })),
      });
      for (let i = 0; i < 30; i += 1) {
        const res = await client.post("/cart/items", {
          sku: `${shop.skuA}-${String(i)}`,
          quantity: 1,
        });
        expect(res.status).toBe(201);
      }
      const res = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        message: "El carrito admite hasta 30 productos distintos.",
      });
    }),
  );

  it(
    "solo el carrito propio: una línea ajena o un id inválido → 404",
    scenario(async ({ app, client, shop }) => {
      const mine = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      const lineId = body(mine).lines[0]?.id ?? "";
      const other = new CartClient(app);
      await other.post("/cart/items", { sku: shop.skuB, quantity: 1 });

      expect((await other.patch(`/cart/items/${lineId}`, { quantity: 2 })).status).toBe(404);
      expect((await other.delete(`/cart/items/${lineId}`)).status).toBe(404);
      expect((await other.delete("/cart/items/no-es-uuid")).status).toBe(404);
      // Sin cookie de carrito.
      expect(
        (await new CartClient(app).patch(`/cart/items/${lineId}`, { quantity: 2 })).status,
      ).toBe(404);

      const updated = await client.patch(`/cart/items/${lineId}`, { quantity: 4 });
      expect(updated.status).toBe(200);
      expect(body(updated).lines[0]?.quantity).toBe(4);
      expect((await client.patch(`/cart/items/${lineId}`, { quantity: 0 })).status).toBe(422);
      const removed = await client.delete(`/cart/items/${lineId}`);
      expect(removed.status).toBe(200);
      expect(body(removed).lines).toEqual([]);
    }),
  );

  it(
    "revalida en cada lectura: precio actual, stock 0 «a pedido» con plazo, y en stock parcial",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 7 });
      await client.post("/cart/items", { sku: shop.skuB, quantity: 1 });
      await db.productVariant.update({ where: { id: shop.variantA }, data: { price: 12_000 } });

      const res = await client.get("/cart");
      const [a, b] = body(res).lines;
      expect(a).toMatchObject({ unitPrice: 12_000, lineTotal: 84_000 });
      expect(a?.availability).toMatchObject({
        status: "mixto",
        inStock: 5,
        message: "Reserva: 5 en stock, el resto a pedido",
      });
      expect(b?.availability).toEqual({
        status: "a_pedido",
        inStock: 0,
        leadTime: "10 días hábiles",
        message: "Reserva a pedido: se fabrica al confirmar",
      });
      expect(body(res).totals.subtotal).toBe(104_000);
      expect(body(res).canCheckout).toBe(true);
    }),
  );

  it(
    "producto desactivado: se marca y sale de los totales; la siguiente escritura lo quita con aviso",
    scenario(async ({ db, client, shop }) => {
      const other = await shopFixture(db);
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      const added = await client.post("/cart/items", { sku: other.skuA, quantity: 2 });
      const keepId = body(added).lines[1]?.id ?? "";
      await db.product.update({ where: { id: shop.productId }, data: { status: "inactive" } });

      const res = await client.get("/cart");
      expect(body(res).lines[0]).toMatchObject({ status: "unavailable", unitPrice: null });
      expect(body(res).lines[0]?.notices[0]?.code).toBe("product_removed");
      expect(body(res).totals).toMatchObject({ units: 2, subtotal: 20_000 });
      // Leer no borra: el aviso sigue en la siguiente lectura.
      expect(body(await client.get("/cart")).lines).toHaveLength(2);

      const written = await client.patch(`/cart/items/${keepId}`, { quantity: 3 });
      expect(body(written).lines).toHaveLength(1);
      expect(body(written).notices).toContainEqual({
        code: "product_removed",
        message: "Un producto ya no está a la venta y lo quitamos.",
      });
      expect(body(await client.get("/cart")).notices).toEqual([]);
    }),
  );

  it(
    "extra retirado: se informa, deja de sumar y al escribir se junta con su línea gemela",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 5 });
      await client.post("/cart/items", { sku: shop.skuA, quantity: 3, extras: [shop.armado] });
      await db.productExtra.delete({
        where: { productId_extraId: { productId: shop.productId, extraId: shop.extraIds.armado } },
      });

      const res = await client.get("/cart");
      expect(body(res).lines[1]).toMatchObject({ unitPrice: 10_000, extras: [] });
      expect(body(res).lines[1]?.notices[0]?.code).toBe("extra_removed");

      const lineId = body(res).lines[0]?.id ?? "";
      const written = await client.patch(`/cart/items/${lineId}`, { quantity: 7 });
      expect(body(written).lines).toHaveLength(1);
      expect(body(written).lines[0]?.quantity).toBe(9);
      expect(body(written).notices.map((n) => n.message)).toEqual([
        "Quitamos un servicio que ya no está disponible.",
        "Ajustamos la cantidad a 9, el máximo por producto.",
      ]);
    }),
  );

  it(
    "precio por definir: no se puede agregar; si queda sin precio, la línea bloquea el pago",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      await db.productVariant.update({ where: { id: shop.variantB }, data: { price: null } });
      const res = await client.post("/cart/items", { sku: shop.skuB, quantity: 1 });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        message: "Este producto aún no tiene precio. Escríbenos y lo cotizamos.",
      });

      await db.productVariant.update({ where: { id: shop.variantA }, data: { price: null } });
      const cart = body(await client.get("/cart"));
      expect(cart.lines[0]).toMatchObject({ status: "unpriced", lineTotal: null });
      expect(cart.totals.unpriced).toEqual([expect.stringContaining("Silla")]);
      expect(cart.canCheckout).toBe(false);
    }),
  );

  it(
    "monto faltante para despacho gratis (RF-08)",
    scenario(async ({ db, client, shop }) => {
      await setSettings(db, { freeShippingThreshold: 50_000 });
      let res = await client.post("/cart/items", { sku: shop.skuA, quantity: 2 });
      expect(body(res).freeShipping).toEqual({
        threshold: 50_000,
        remaining: 30_000,
        percent: 40,
        reached: false,
      });
      res = await client.post("/cart/items", { sku: shop.skuB, quantity: 2 });
      expect(body(res).freeShipping).toMatchObject({ remaining: 0, percent: 100, reached: true });
      await setSettings(db, { freeShippingThreshold: null });
      expect(body(await client.get("/cart")).freeShipping).toBeNull();
    }),
  );

  it(
    "carrito vencido: se ignora y el siguiente POST crea otro",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      const first = client.cart;
      await db.cart.update({
        where: { guestTokenHash: hashToken(first ?? "") },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(body(await client.get("/cart")).lines).toEqual([]);
      const res = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      expect(res.status).toBe(201);
      expect(client.cart).not.toBe(first);
      expect(body(res).lines[0]?.quantity).toBe(1);
    }),
  );
});

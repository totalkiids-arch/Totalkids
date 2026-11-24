import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { shopFixture } from "./cart-helpers.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Con una sesión del panel abierta, la clave CSRF sigue siendo la del panel
// (LN-04): crear un carrito no la cambia ni emite otro token. Se omite sin
// TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("carrito con sesión del panel abierta (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("usa la clave del panel y el panel sigue funcionando", async () => {
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      const shop = await shopFixture(db);
      const { token } = await panelSession(db, "admin");
      const headers = panelHeaders(token);

      const created = await request(app)
        .post("/api/v1/cart/items")
        .set(headers)
        .send({ sku: shop.skuA, quantity: 1 });
      expect(created.status).toBe(201);
      expect(created.headers["x-csrf-token"]).toBeUndefined();
      const cartCookie = (created.headers["set-cookie"] as unknown as string[])
        .find((c) => c.startsWith(`${CART_COOKIE_DEV}=`))
        ?.split(";")[0];

      // Mismo token del panel, ahora también con la cookie del carrito.
      const withCart = { ...headers, cookie: `${headers.cookie}; ${cartCookie ?? ""}` };
      const again = await request(app)
        .post("/api/v1/cart/items")
        .set(withCart)
        .send({ sku: shop.skuA, quantity: 1 });
      expect(again.status).toBe(201);
      expect((again.body as { lines: { quantity: number }[] }).lines[0]?.quantity).toBe(2);

      const session = await request(app).get("/api/v1/auth/session").set(withCart);
      expect(session.status).toBe(200);
    });
  });
});

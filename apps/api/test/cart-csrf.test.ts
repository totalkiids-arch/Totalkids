import request from "supertest";
import { describe, expect, it } from "vitest";

import { randomToken } from "../src/lib/secrets.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Las escrituras del carrito exigen el doble envío CSRF (RNF-04). El middleware
// responde antes de tocar la base, así que basta un Prisma falso.
describe("CSRF en el carrito (LN-06)", () => {
  const app = buildTestApp();
  const lineId = "0190a5d2-0000-7000-8000-000000000000";
  const writes = [
    () => request(app).post("/api/v1/cart/items").send({ sku: "TK-1", quantity: 1 }),
    () => request(app).patch(`/api/v1/cart/items/${lineId}`).send({ quantity: 2 }),
    () => request(app).delete(`/api/v1/cart/items/${lineId}`),
    () => request(app).post("/api/v1/cart/coupon").send({ code: "KIDS10" }),
    () => request(app).delete("/api/v1/cart/coupon"),
  ];

  it("sin token → 403 CSRF_FAILED en cada escritura", async () => {
    for (const write of writes) {
      const res = await write();
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "CSRF_FAILED" });
    }
  });

  it("un token sin sesión no vale si ya hay cookie de carrito", async () => {
    const headers = csrfHeaders();
    const res = await request(app)
      .post("/api/v1/cart/items")
      .set({ ...headers, cookie: `${headers.cookie}; ${CART_COOKIE_DEV}=${randomToken()}` })
      .send({ sku: "TK-1", quantity: 1 });
    expect(res.status).toBe(403);
  });

  it("las lecturas no exigen CSRF: la cotización llega a validar la query", async () => {
    const res = await request(app).get("/api/v1/shipping/quote?method=avion");
    expect(res.status).toBe(422);
  });
});

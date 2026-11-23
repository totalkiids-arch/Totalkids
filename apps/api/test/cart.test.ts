import request from "supertest";
import { describe, expect, it } from "vitest";

import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Rutas del carrito que responden sin tocar la base (la base real se prueba en
// cart.db.test.ts): carrito vacío, CSRF, validación y métodos.
describe("rutas del carrito (sin base)", () => {
  const app = buildTestApp();

  it("GET /cart sin cookie: carrito vacío, sin crear sesión ni cachear", async () => {
    const res = await request(app).get("/api/v1/cart");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      lines: [],
      units: 0,
      unpriced: [],
      coupon: null,
      totals: { subtotal: 0, discount: 0, shipping: null, total: 0 },
      blocked: false,
      changed: false,
      checkoutReady: false,
    });
  });

  it("agregar sin token CSRF responde 403", async () => {
    const res = await request(app).post("/api/v1/cart/items").send({ sku: "TK-1", quantity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_FAILED");
  });

  it("valida el cuerpo antes de tocar la base (422 con el campo)", async () => {
    const res = await request(app)
      .post("/api/v1/cart/items")
      .set(csrfHeaders())
      .send({ sku: "", quantity: 12, extras: [{ code: "x", text: "a".repeat(201) }] });
    expect(res.status).toBe(422);
    const paths = (res.body.details.issues as { path: string }[]).map((i) => i.path).sort();
    expect(paths).toEqual(["extras.0.text", "quantity", "sku"]);
  });

  it("un id de línea mal formado es 404, igual que uno inexistente", async () => {
    const res = await request(app).delete("/api/v1/cart/items/no-es-uuid").set(csrfHeaders());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("métodos no declarados: 405 con Allow", async () => {
    const res = await request(app).put("/api/v1/cart/items").set(csrfHeaders()).send({});
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });

  it("cupón: exige CSRF, valida el código y sin carrito responde 404", async () => {
    expect((await request(app).post("/api/v1/cart/coupon").send({ code: "X" })).status).toBe(403);
    const empty = await request(app)
      .post("/api/v1/cart/coupon")
      .set(csrfHeaders())
      .send({ code: " " });
    expect(empty.status).toBe(422);
    const noCart = await request(app)
      .post("/api/v1/cart/coupon")
      .set(csrfHeaders())
      .send({ code: "APRENDER10" });
    expect(noCart.status).toBe(404);
  });

  it("quitar el cupón sin carrito es idempotente: carrito vacío", async () => {
    const res = await request(app).delete("/api/v1/cart/coupon").set(csrfHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lines: [], coupon: null });
  });

  it("cotizar despacho valida método, región y comuna", async () => {
    const res = await request(app).get("/api/v1/shipping/quote?method=avion&region=araucania");
    expect(res.status).toBe(422);
    const paths = (res.body.details.issues as { path: string }[]).map((i) => i.path).sort();
    expect(paths).toEqual(["method", "region"]);
  });

  it("una cookie de carrito con otro formato se ignora (como sin carrito)", async () => {
    const legacy = encodeURIComponent(JSON.stringify({ v: 1, l: [] }));
    const res = await request(app)
      .get("/api/v1/cart")
      .set("cookie", `${CART_COOKIE_DEV}=${legacy}`);
    expect(res.status).toBe(200);
    expect(res.body.lines).toEqual([]);
  });
});

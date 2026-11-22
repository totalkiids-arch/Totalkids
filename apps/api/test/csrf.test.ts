import { Router, type Request } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { parseCookies } from "../src/lib/cookies.js";
import { CSRF_COOKIE_DEV, issueCsrfToken, verifyCsrfToken } from "../src/lib/csrf.js";
import { FLOW_CALLBACK_PATHS } from "../src/middleware/body.js";
import { buildTestApp, csrfHeaders, testEnv } from "./helpers.js";

const secret = testEnv.CSRF_SECRET ?? "";

/** Sesión de prueba: la cabecera x-test-session hace de cookie opaca de LN-04/LN-06. */
const sessionKey = (req: Request) => req.get("x-test-session") ?? "";

function routes(v1: Router) {
  const router = Router();
  router.post("/orders-test", (_req, res) => {
    res.status(201).json({ ok: true });
  });
  router.delete("/orders-test", (_req, res) => {
    res.status(204).end();
  });
  for (const path of FLOW_CALLBACK_PATHS) {
    router.post(path, (req, res) => {
      res.json({ token: (req.body as { token?: string }).token ?? null });
    });
  }
  v1.use(router);
}

const app = buildTestApp({ registerRoutes: routes, csrfSessionKey: sessionKey });

describe("tokens CSRF", () => {
  it("se firman y se atan a la sesión", () => {
    const token = issueCsrfToken(secret, "sesion-a");
    expect(verifyCsrfToken(secret, token, "sesion-a")).toBe(true);
    expect(verifyCsrfToken(secret, token, "sesion-b")).toBe(false);
    expect(verifyCsrfToken("otro-secreto-de-al-menos-32-caracteres", token, "sesion-a")).toBe(
      false,
    );
    expect(verifyCsrfToken(secret, "basura", "sesion-a")).toBe(false);
  });
});

describe("GET /api/v1/csrf", () => {
  it("entrega el token y fija la cookie HttpOnly SameSite=Lax", async () => {
    const res = await request(app).get("/api/v1/csrf");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const token = res.body.csrfToken as string;
    expect(verifyCsrfToken(secret, token)).toBe(true);

    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain(`${CSRF_COOKIE_DEV}=${token}`);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).not.toMatch(/Secure/);
  });

  it("reutiliza una cookie vigente de la misma sesión y renueva la de otra", async () => {
    const current = issueCsrfToken(secret, "s1");
    const same = await request(app)
      .get("/api/v1/csrf")
      .set("cookie", `${CSRF_COOKIE_DEV}=${current}`)
      .set("x-test-session", "s1");
    expect(same.body.csrfToken).toBe(current);

    const other = await request(app)
      .get("/api/v1/csrf")
      .set("cookie", `${CSRF_COOKIE_DEV}=${current}`)
      .set("x-test-session", "s2");
    expect(other.body.csrfToken).not.toBe(current);
    expect(verifyCsrfToken(secret, other.body.csrfToken as string, "s2")).toBe(true);
  });

  it("en producción usa __Host-tk_csrf con Secure", async () => {
    const prod = buildTestApp({ env: { NODE_ENV: "production" } });
    const res = await request(prod).get("/api/v1/csrf");
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/^__Host-tk_csrf=/);
    expect(setCookie).toMatch(/Secure/);
  });
});

describe("csrfProtection", () => {
  it("rechaza con 403 CSRF_FAILED si falta el token", async () => {
    const res = await request(app).post("/api/v1/orders-test").send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "CSRF_FAILED", details: null });

    const onlyCookie = await request(app)
      .post("/api/v1/orders-test")
      .set("cookie", csrfHeaders().cookie ?? "")
      .send({});
    expect(onlyCookie.status).toBe(403);
  });

  it("rechaza cabecera y cookie distintas, o un token alterado", async () => {
    const a = csrfHeaders();
    const b = csrfHeaders();
    const mismatch = await request(app)
      .post("/api/v1/orders-test")
      .set("cookie", a.cookie ?? "")
      .set("x-csrf-token", b["x-csrf-token"] ?? "")
      .send({});
    expect(mismatch.status).toBe(403);

    const token = a["x-csrf-token"] ?? "";
    const forged = `${token.slice(0, -2)}AA`;
    const tampered = await request(app)
      .post("/api/v1/orders-test")
      .set("cookie", `${CSRF_COOKIE_DEV}=${forged}`)
      .set("x-csrf-token", forged)
      .send({});
    expect(tampered.status).toBe(403);
  });

  it("rechaza un token de otra sesión (p. ej. obtenido por el atacante)", async () => {
    const res = await request(app)
      .post("/api/v1/orders-test")
      .set(csrfHeaders("sesion-atacante"))
      .set("x-test-session", "sesion-victima")
      .send({});
    expect(res.status).toBe(403);
  });

  it("acepta el par válido de la sesión actual en POST y DELETE", async () => {
    const created = await request(app)
      .post("/api/v1/orders-test")
      .set(csrfHeaders("sesion-1"))
      .set("x-test-session", "sesion-1")
      .send({});
    expect(created.status).toBe(201);

    const deleted = await request(app).delete("/api/v1/orders-test").set(csrfHeaders());
    expect(deleted.status).toBe(204);
  });

  it("acepta el flujo completo: GET /csrf y luego POST con cookie y cabecera", async () => {
    const issued = await request(app).get("/api/v1/csrf");
    const cookie = parseCookies(String(issued.headers["set-cookie"]).split(";")[0]);
    const res = await request(app)
      .post("/api/v1/orders-test")
      .set("cookie", `${CSRF_COOKIE_DEV}=${cookie[CSRF_COOKIE_DEV]}`)
      .set("x-csrf-token", issued.body.csrfToken as string)
      .send({});
    expect(res.status).toBe(201);
  });

  it("rechaza un Origin ajeno aunque el token sea válido", async () => {
    const res = await request(app)
      .post("/api/v1/orders-test")
      .set(csrfHeaders())
      .set("origin", "https://sitio-malicioso.example")
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Origen no permitido");

    const own = await request(app)
      .post("/api/v1/orders-test")
      .set(csrfHeaders())
      .set("origin", "http://localhost:3000")
      .send({});
    expect(own.status).toBe(201);
  });

  it("no aplica a métodos seguros", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });
});

describe("callbacks de Flow", () => {
  it.each(FLOW_CALLBACK_PATHS)("%s está exento de CSRF y acepta formulario", async (path) => {
    const res = await request(app)
      .post(`/api/v1${path}`)
      .type("form")
      .send({ token: "tok_flow_123" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: "tok_flow_123" });
  });

  it("los callbacks de Flow no aceptan JSON (415)", async () => {
    const res = await request(app)
      .post(`/api/v1${FLOW_CALLBACK_PATHS[0]}`)
      .send({ token: "tok_flow_123" });
    expect(res.status).toBe(415);
    expect(res.body.details).toEqual({ allowed: ["application/x-www-form-urlencoded"] });
  });

  it("el resto de rutas no acepta formularios (415), ni siquiera con token", async () => {
    const res = await request(app)
      .post("/api/v1/orders-test")
      .set(csrfHeaders())
      .type("form")
      .send({ token: "x" });
    expect(res.status).toBe(415);
  });
});

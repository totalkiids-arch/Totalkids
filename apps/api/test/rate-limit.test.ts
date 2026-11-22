import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createRateLimiter,
  loginAccountLimiter,
  loginAccountKey,
  publicFormLimiter,
} from "../src/middleware/rate-limit.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

describe("límite global por IP", () => {
  const app = buildTestApp({ env: { RATE_LIMIT_MAX: 2, RATE_LIMIT_WINDOW_MS: 60_000 } });

  it("responde 429 RATE_LIMITED con el formato de error y cabeceras estándar", async () => {
    const first = await request(app).get("/api/v1/health");
    expect(first.status).toBe(200);
    expect(first.headers.ratelimit).toMatch(/"global"; r=1; t=\d+/);
    expect(first.headers["ratelimit-policy"]).toMatch(/"global"; q=2; w=60/);
    expect(first.headers["x-ratelimit-limit"]).toBeUndefined();

    await request(app).get("/api/v1/health");
    const blocked = await request(app).get("/api/v1/health").set("x-request-id", "req-429");

    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toMatch(/^\d+$/);
    expect(blocked.body).toEqual({
      code: "RATE_LIMITED",
      message: expect.any(String),
      details: { retryAfterSeconds: Number(blocked.headers["retry-after"]) },
      requestId: "req-429",
    });
  });

  it("usa la IP real de X-Forwarded-For (trust proxy) para separar clientes", async () => {
    const proxied = buildTestApp({ env: { RATE_LIMIT_MAX: 1 } });
    const a1 = await request(proxied).get("/api/v1/health").set("x-forwarded-for", "203.0.113.1");
    const a2 = await request(proxied).get("/api/v1/health").set("x-forwarded-for", "203.0.113.1");
    const b1 = await request(proxied).get("/api/v1/health").set("x-forwarded-for", "203.0.113.2");
    expect([a1.status, a2.status, b1.status]).toEqual([200, 429, 200]);
  });
});

describe("limitadores por ruta", () => {
  function appWith(router: Router) {
    return buildTestApp({ registerRoutes: (v1) => v1.use(router) });
  }

  it("publicFormLimiter admite una configuración más estricta por endpoint", async () => {
    const router = Router();
    router.get("/form", publicFormLimiter({ limit: 1 }), (_req, res) => {
      res.json({ ok: true });
    });
    const app = appWith(router);
    expect((await request(app).get("/api/v1/form")).status).toBe(200);
    const blocked = await request(app).get("/api/v1/form");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.ratelimit).toContain('"public-form"');
  });

  it("loginAccountLimiter cuenta solo fallos y por cuenta (5 cada 15 min)", async () => {
    const router = Router();
    router.post("/login", loginAccountLimiter(), (req, res) => {
      const ok = (req.body as { password?: string }).password === "correcta";
      res.status(ok ? 200 : 401).json({ ok });
    });
    const app = appWith(router);
    const login = (email: string, password: string) =>
      request(app).post("/api/v1/login").set(csrfHeaders()).send({ email, password });

    // Los ingresos correctos no consumen cupo.
    for (let i = 0; i < 6; i++)
      expect((await login("ana@totalkids.cl", "correcta")).status).toBe(200);

    for (let i = 0; i < 5; i++) expect((await login("Ana@TotalKids.cl ", "mala")).status).toBe(401);
    const blocked = await login("ana@totalkids.cl", "correcta");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");

    // Otra cuenta desde la misma IP sigue pudiendo intentar.
    expect((await login("otra@totalkids.cl", "mala")).status).toBe(401);
  });

  it("loginAccountKey normaliza el correo y cae en la IP si no viene", () => {
    const req = (body: unknown) =>
      ({ body, ip: "198.51.100.7" }) as Parameters<typeof loginAccountKey>[0];
    expect(loginAccountKey(req({ email: " Ana@TotalKids.CL " }))).toBe("cuenta:ana@totalkids.cl");
    expect(loginAccountKey(req({}))).toBe("ip:198.51.100.7");
  });

  it("createRateLimiter acepta una clave propia", async () => {
    const router = Router();
    router.get(
      "/by-header",
      createRateLimiter({
        name: "custom",
        windowMs: 60_000,
        limit: 1,
        keyGenerator: (req) => req.get("x-cliente") ?? "anon",
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    const app = appWith(router);
    expect((await request(app).get("/api/v1/by-header").set("x-cliente", "a")).status).toBe(200);
    expect((await request(app).get("/api/v1/by-header").set("x-cliente", "a")).status).toBe(429);
    expect((await request(app).get("/api/v1/by-header").set("x-cliente", "b")).status).toBe(200);
  });
});

import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AppError, ERROR_CODES, errors } from "../src/lib/errors.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

/** Rutas de prueba para provocar cada tipo de error. */
function testRoutes(v1: Router) {
  const router = Router();
  router.post("/echo", (req, res) => {
    res.json({ received: req.body as unknown });
  });
  router.get("/boom", () => {
    throw new Error("detalle interno: password=hunter2");
  });
  router.get("/conflict", () => {
    throw errors.conflict("El SKU ya existe", { field: "sku" });
  });
  v1.use(router);
}

function expectErrorBody(body: unknown, code: string) {
  expect(Object.keys(body as object).sort()).toEqual(["code", "details", "message", "requestId"]);
  expect(body).toMatchObject({ code, message: expect.any(String), requestId: expect.any(String) });
}

describe("catálogo de errores", () => {
  it("las fábricas usan el status del catálogo", () => {
    const err = errors.forbidden();
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(ERROR_CODES.FORBIDDEN);
    expect(errors.validation().status).toBe(422);
    expect(errors.csrfFailed().status).toBe(403);
  });
});

describe("formato de error", () => {
  const app = buildTestApp({ registerRoutes: testRoutes });

  it("409 de una ruta conserva code, details y requestId", async () => {
    const res = await request(app).get("/api/v1/conflict").set("x-request-id", "req-409");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: "CONFLICT",
      message: "El SKU ya existe",
      details: { field: "sku" },
      requestId: "req-409",
    });
  });

  it("404 en rutas inexistentes", async () => {
    const res = await request(app).get("/api/v1/no-existe");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND", details: null });
  });

  it("400 BAD_REQUEST con JSON malformado, sin devolver el cuerpo crudo", async () => {
    const res = await request(app)
      .post("/api/v1/echo")
      .set("content-type", "application/json")
      .send('{"email": "a@b.cl",');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "BAD_REQUEST", details: null });
    expect(JSON.stringify(res.body)).not.toContain("a@b.cl");
  });

  it("413 PAYLOAD_TOO_LARGE si el JSON supera el límite", async () => {
    const res = await request(app)
      .post("/api/v1/echo")
      .send({ text: "x".repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expectErrorBody(res.body, "PAYLOAD_TOO_LARGE");
  });

  it("415 UNSUPPORTED_MEDIA_TYPE si el cuerpo no es JSON", async () => {
    const res = await request(app)
      .post("/api/v1/echo")
      .set("content-type", "application/x-www-form-urlencoded")
      .send("email=a%40b.cl");
    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      details: { allowed: ["application/json"] },
    });

    const text = await request(app)
      .post("/api/v1/echo")
      .set("content-type", "text/plain")
      .send("hola");
    expect(text.status).toBe(415);
  });

  it("405 METHOD_NOT_ALLOWED con cabecera Allow en rutas existentes", async () => {
    const res = await request(app).delete("/api/v1/health").set(csrfHeaders());
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("GET, HEAD");
    expectErrorBody(res.body, "METHOD_NOT_ALLOWED");
  });

  it("las respuestas de /api/v1 no se cachean", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("500 INTERNAL_ERROR", () => {
  it("nunca expone stack ni el mensaje interno", async () => {
    for (const NODE_ENV of ["development", "production"] as const) {
      const app = buildTestApp({ env: { NODE_ENV }, registerRoutes: testRoutes });
      const res = await request(app).get("/api/v1/boom");
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor",
        details: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/hunter2|stack|at /);
    }
  });

  it("en producción oculta los details de un AppError interno", async () => {
    const app = buildTestApp({
      env: { NODE_ENV: "production" },
      registerRoutes: (v1) => {
        v1.get("/internal", () => {
          throw errors.internal("Falló la consulta a Flow", { flowStatus: 7 });
        });
      },
    });
    const res = await request(app).get("/api/v1/internal");
    expect(res.body).toMatchObject({ message: "Error interno del servidor", details: null });
  });
});

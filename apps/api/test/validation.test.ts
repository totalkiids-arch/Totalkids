import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { pageMeta, pageWindow, paginationQuery } from "../src/lib/pagination.js";
import { validated } from "../src/lib/validation.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

const itemBody = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  quantity: z.number().int().min(1),
  lines: z.array(z.object({ sku: z.string().min(1) })).optional(),
});

function routes(v1: Router) {
  const router = Router();
  router.post(
    "/items/:id",
    validated(
      { body: itemBody, params: z.object({ id: z.coerce.number().int().positive() }) },
      ({ body, params }, _req, res) => {
        res.status(201).json({ id: params.id, email: body.email, quantity: body.quantity });
      },
    ),
  );
  router.get(
    "/list",
    validated({ query: paginationQuery }, ({ query }, _req, res) => {
      res.json({ ...pageWindow(query), meta: pageMeta(45, query) });
    }),
  );
  router.get(
    "/async",
    validated({}, async () => {
      await Promise.resolve();
      throw new Error("falla asíncrona");
    }),
  );
  v1.use(router);
}

const app = buildTestApp({ registerRoutes: routes });

describe("validated()", () => {
  it("entrega al handler los datos parseados y transformados", async () => {
    const res = await request(app)
      .post("/api/v1/items/7")
      .set(csrfHeaders())
      .send({ email: "Ana@Ejemplo.CL", quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7, email: "ana@ejemplo.cl", quantity: 2 });
  });

  it("responde 422 VALIDATION_ERROR con un issue por campo, en español", async () => {
    const res = await request(app)
      .post("/api/v1/items/abc")
      .set(csrfHeaders())
      .send({ email: "no-es-correo", quantity: 0, lines: [{ sku: "" }] });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    const issues = res.body.details.issues as { location: string; path: string; message: string }[];
    expect(issues.map((i) => `${i.location}:${i.path}`).sort()).toEqual([
      "body:email",
      "body:lines.0.sku",
      "body:quantity",
      "params:id",
    ]);
    for (const issue of issues) {
      expect(issue.message).toMatch(/[a-záéíóúñ]/i);
      expect(issue.message).not.toMatch(/expected|Invalid input/);
    }
    // Nunca devuelve el valor recibido.
    expect(JSON.stringify(res.body)).not.toContain("no-es-correo");
  });

  it("rechaza un cuerpo ausente como 422 del objeto entero", async () => {
    const res = await request(app).post("/api/v1/items/1").set(csrfHeaders());
    expect(res.status).toBe(422);
    expect(res.body.details.issues[0]).toMatchObject({ location: "body", path: "" });
  });

  it("valida y convierte la query de paginación", async () => {
    const ok = await request(app).get("/api/v1/list?page=3&pageSize=10");
    expect(ok.body).toEqual({
      skip: 20,
      take: 10,
      meta: { page: 3, pageSize: 10, total: 45, totalPages: 5 },
    });

    const defaults = await request(app).get("/api/v1/list");
    expect(defaults.body.meta).toMatchObject({ page: 1, pageSize: 20 });

    const bad = await request(app).get("/api/v1/list?pageSize=500");
    expect(bad.status).toBe(422);
    expect(bad.body.details.issues[0]).toMatchObject({ location: "query", path: "pageSize" });
  });

  it("los errores asíncronos del handler llegan al manejador de errores", async () => {
    const res = await request(app).get("/api/v1/async");
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
  });
});

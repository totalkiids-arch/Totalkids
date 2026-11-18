import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";

type QueryRaw = Pick<PrismaClient, "$queryRaw">;

describe("GET /api/v1/health", () => {
  it("responde { status: 'ok' } cuando la base de datos responde", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as QueryRaw;

    const res = await request(buildTestApp(prisma)).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("responde 503 con el formato estándar de error si la base de datos falla", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as QueryRaw;

    const res = await request(buildTestApp(prisma))
      .get("/api/v1/health")
      .set("x-request-id", "test-request-id");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: "DATABASE_UNAVAILABLE",
      message: "No hay conexión con la base de datos",
      details: { cause: "Error" },
      requestId: "test-request-id",
    });
  });
});

describe("rutas inexistentes", () => {
  it("responden 404 con el formato estándar de error", async () => {
    const prisma = { $queryRaw: vi.fn() } as unknown as QueryRaw;

    const res = await request(buildTestApp(prisma)).get("/api/v1/no-existe");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND", details: null });
    expect(typeof res.body.requestId).toBe("string");
  });
});

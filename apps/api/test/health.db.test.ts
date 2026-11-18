import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { buildTestApp } from "./helpers.js";

// Test de integración contra la base totalkids_test (requiere docker compose up
// y pnpm db:migrate:test). Se omite si TEST_DATABASE_URL no está definida.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("GET /api/v1/health (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("verifica la conexión y la tabla healthcheck migrada", async () => {
    const res = await request(buildTestApp(prisma)).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });

    const row = await prisma.healthcheck.create({ data: {} });
    expect(row.id).toBeGreaterThan(0);
    await prisma.healthcheck.delete({ where: { id: row.id } });
  });
});

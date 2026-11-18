import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createLogger } from "../src/lib/logger.js";
import type { PrismaClient } from "../src/lib/prisma.js";

function buildAppWithCapturedLogs() {
  const lines: string[] = [];
  const logger = createLogger("info", false, { write: (line: string) => lines.push(line) });
  const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as Pick<
    PrismaClient,
    "$queryRaw"
  >;
  const app = createApp({
    env: { CORS_ORIGINS: ["http://localhost:3000"], TRUST_PROXY: "loopback" },
    logger,
    prisma,
  });
  return { app, lines };
}

describe("log HTTP", () => {
  it("registra una línea compacta sin cookies ni authorization", async () => {
    const { app, lines } = buildAppWithCapturedLogs();

    await request(app)
      .get("/api/v1/health")
      .set("cookie", "refreshToken=secreto-jwt")
      .set("authorization", "Bearer secreto-bearer");

    const output = lines.join("\n");
    expect(output).toContain("GET /api/v1/health 200");
    expect(output).not.toContain("secreto-jwt");
    expect(output).not.toContain("secreto-bearer");
  });

  it("no registra los archivos estáticos de /api/docs", async () => {
    const { app, lines } = buildAppWithCapturedLogs();

    await request(app).get("/api/docs/");

    expect(lines.join("\n")).not.toContain("/api/docs");
  });
});

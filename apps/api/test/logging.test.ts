import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createLogger } from "../src/lib/logger.js";
import { fakePrisma, testEnv } from "./helpers.js";

function buildAppWithCapturedLogs() {
  const lines: string[] = [];
  const logger = createLogger("info", false, { write: (line: string) => lines.push(line) });
  const app = createApp({ env: testEnv, logger, prisma: fakePrisma() });
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

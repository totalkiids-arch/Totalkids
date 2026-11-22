import request from "supertest";
import { describe, expect, it } from "vitest";

import { buildTestApp } from "./helpers.js";

describe("/api/docs", () => {
  it("en desarrollo muestra Swagger UI y el contrato en JSON", async () => {
    const app = buildTestApp({ env: { NODE_ENV: "development", API_DOCS: "enabled" } });

    const ui = await request(app).get("/api/docs/");
    expect(ui.status).toBe(200);
    expect(ui.text).toContain("Total Kids API");

    const spec = await request(app).get("/api/docs/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toMatch(/^3\./);
    expect(spec.body.paths["/csrf"]).toBeDefined();
  });

  it("deshabilitado (por defecto en producción) responde 404 estándar", async () => {
    const app = buildTestApp({ env: { NODE_ENV: "production", API_DOCS: "disabled" } });
    for (const path of ["/api/docs", "/api/docs/", "/api/docs/openapi.json"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });

  it("la API sigue funcionando con las docs deshabilitadas", async () => {
    const app = buildTestApp({ env: { NODE_ENV: "production", API_DOCS: "disabled" } });
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });
});

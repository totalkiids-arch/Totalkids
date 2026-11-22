import { describe, expect, it } from "vitest";

import { parseEnv } from "../src/config/env.js";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };
const secret = "s".repeat(32);

describe("variables de entorno", () => {
  it("usa valores por defecto seguros en desarrollo", () => {
    const parsed = parseEnv({ ...base, NODE_ENV: "development" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      API_DOCS: "enabled",
      RATE_LIMIT_MAX: 300,
      RATE_LIMIT_WINDOW_MS: 300_000,
    });
    expect(parsed.data?.CSRF_SECRET).toBeUndefined();
  });

  it("en producción exige CSRF_SECRET y deshabilita /api/docs por defecto", () => {
    expect(parseEnv({ ...base, NODE_ENV: "production" }).success).toBe(false);
    const parsed = parseEnv({ ...base, NODE_ENV: "production", CSRF_SECRET: secret });
    expect(parsed.data?.API_DOCS).toBe("disabled");
    const forced = parseEnv({
      ...base,
      NODE_ENV: "production",
      CSRF_SECRET: secret,
      API_DOCS: "enabled",
    });
    expect(forced.data?.API_DOCS).toBe("enabled");
  });

  it("trata como no definidas las variables vacías de .env.example", () => {
    const parsed = parseEnv({ ...base, CSRF_SECRET: "", API_DOCS: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.CSRF_SECRET).toBeUndefined();
    expect(parsed.data?.API_DOCS).toBe("enabled");
  });

  it("rechaza un CSRF_SECRET corto", () => {
    expect(parseEnv({ ...base, CSRF_SECRET: "corto" }).success).toBe(false);
  });
});

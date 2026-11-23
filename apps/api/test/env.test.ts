import { describe, expect, it } from "vitest";

import { parseEnv } from "../src/config/env.js";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };
const secret = "s".repeat(32);
/**
 * En producción los correos necesitan el origen público del sitio (LN-14) y las
 * imágenes del catálogo su base pública (LN-12).
 */
const productionSite = {
  PUBLIC_SITE_URL: "https://tienda.example.com",
  IMAGES_PUBLIC_URL: "https://tienda.example.com/uploads",
};

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
    expect(parseEnv({ ...base, ...productionSite, NODE_ENV: "production" }).success).toBe(false);
    const parsed = parseEnv({
      ...base,
      ...productionSite,
      NODE_ENV: "production",
      CSRF_SECRET: secret,
    });
    expect(parsed.data?.API_DOCS).toBe("disabled");
    const forced = parseEnv({
      ...base,
      ...productionSite,
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

  it("correos: adaptador falso y valores de desarrollo sin dominios reales", () => {
    const parsed = parseEnv({ ...base, NODE_ENV: "development" });
    expect(parsed.data).toMatchObject({
      EMAIL_PROVIDER: "fake",
      BREVO_SENDER_EMAIL: "no-reply@example.com",
      BREVO_SENDER_NAME: "Total Kids",
      EMAIL_ADMIN_TO: "equipo@example.com",
      PUBLIC_SITE_URL: "http://localhost:3000",
      EMAIL_SEND_TIMEOUT_MS: 10_000,
      EMAIL_WORKER_POLL_MS: 5_000,
      EMAIL_WORKER_BATCH: 10,
      EMAIL_WORKER_LOCK_TIMEOUT_MS: 300_000,
    });
    expect(parsed.data?.BREVO_API_KEY).toBeUndefined();
    // Las vacías de .env.example cuentan como no definidas.
    expect(parseEnv({ ...base, EMAIL_PROVIDER: "", BREVO_API_KEY: "" }).data?.EMAIL_PROVIDER).toBe(
      "fake",
    );
    expect(
      parseEnv({ ...base, PUBLIC_SITE_URL: "https://x.example.com/" }).data?.PUBLIC_SITE_URL,
    ).toBe("https://x.example.com");
  });

  it("en producción con Brevo exige API key, remitente y casilla del equipo", () => {
    const prod = {
      ...base,
      ...productionSite,
      NODE_ENV: "production",
      CSRF_SECRET: secret,
      EMAIL_PROVIDER: "brevo",
    };
    const missing = parseEnv(prod);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map((i) => i.path[0]).sort()).toEqual([
      "BREVO_API_KEY",
      "BREVO_SENDER_EMAIL",
      "EMAIL_ADMIN_TO",
    ]);
    const complete = parseEnv({
      ...prod,
      BREVO_API_KEY: "xkeysib-x",
      BREVO_SENDER_EMAIL: "no-reply@example.com",
      EMAIL_ADMIN_TO: "equipo@example.com",
    });
    expect(complete.success).toBe(true);
  });

  it("en producción exige PUBLIC_SITE_URL con https", () => {
    const prod = { ...base, NODE_ENV: "production", CSRF_SECRET: secret };
    expect(parseEnv(prod).success).toBe(false);
    expect(parseEnv({ ...prod, PUBLIC_SITE_URL: "http://tienda.example.com" }).success).toBe(false);
    expect(parseEnv({ ...prod, ...productionSite }).success).toBe(true);
  });

  it("imágenes: carpeta y URL por defecto en desarrollo; https obligatorio en producción", () => {
    const dev = parseEnv(base);
    expect(dev.data).toMatchObject({
      IMAGES_DIR: "uploads",
      IMAGES_PUBLIC_URL: "http://localhost:4000/uploads",
    });
    expect(
      parseEnv({ ...base, IMAGES_PUBLIC_URL: "https://cdn.example.com/img/" }).data
        ?.IMAGES_PUBLIC_URL,
    ).toBe("https://cdn.example.com/img");
    const prod = { ...base, ...productionSite, NODE_ENV: "production", CSRF_SECRET: secret };
    expect(parseEnv(prod).success).toBe(true);
    expect(parseEnv({ ...prod, IMAGES_PUBLIC_URL: "" }).success).toBe(false);
    expect(parseEnv({ ...prod, IMAGES_PUBLIC_URL: "http://tienda.example.com/u" }).success).toBe(
      false,
    );
  });

  it("el bloqueo del worker debe durar más que el timeout de envío", () => {
    expect(
      parseEnv({ ...base, EMAIL_SEND_TIMEOUT_MS: "10000", EMAIL_WORKER_LOCK_TIMEOUT_MS: "5000" })
        .success,
    ).toBe(false);
  });

  it("rechaza un CSRF_SECRET corto", () => {
    expect(parseEnv({ ...base, CSRF_SECRET: "corto" }).success).toBe(false);
  });
});

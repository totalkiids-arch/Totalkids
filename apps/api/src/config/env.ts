import "dotenv/config";
import { z } from "zod";

/** Una variable presente pero vacía (`CSRF_SECRET=`) cuenta como no definida. */
const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);

/** Valores por defecto fuera de producción, sin dominios reales (example.com, RFC 2606). */
export const DEV_SENDER_EMAIL = "no-reply@example.com";
export const DEV_ADMIN_TO = "equipo@example.com";
export const DEV_SITE_URL = "http://localhost:3000";
/** En desarrollo la API sirve IMAGES_DIR en /uploads (LN-12). */
export const DEV_IMAGES_URL = "http://localhost:4000/uploads";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.url(),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY: z.string().default("loopback"),
    /** Ventana y máximo del límite global por IP (RNF-04). */
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Secreto HMAC de los tokens CSRF. Obligatorio en producción. */
    CSRF_SECRET: z.preprocess(
      blankAsUndefined,
      z.string().min(32, "CSRF_SECRET debe tener al menos 32 caracteres").optional(),
    ),
    /** /api/docs: por defecto activo salvo en producción (SRS 4.4.2). */
    API_DOCS: z.preprocess(blankAsUndefined, z.enum(["enabled", "disabled"]).optional()),

    // ── Correos transaccionales y worker (LN-14) ──
    /** fake (por defecto): no usa la red. brevo: API transaccional de Brevo. */
    EMAIL_PROVIDER: z.preprocess(blankAsUndefined, z.enum(["fake", "brevo"]).default("fake")),
    BREVO_API_KEY: z.preprocess(blankAsUndefined, z.string().min(1).optional()),
    BREVO_API_URL: z.preprocess(blankAsUndefined, z.url().optional()),
    /** Remitente autorizado en Brevo. Obligatorio en producción con Brevo. */
    BREVO_SENDER_EMAIL: z.preprocess(blankAsUndefined, z.email().optional()),
    BREVO_SENDER_NAME: z.preprocess(blankAsUndefined, z.string().max(70).default("Total Kids")),
    /** Casilla del equipo: "nueva venta" y copia de "solicitud de servicio". */
    EMAIL_ADMIN_TO: z.preprocess(blankAsUndefined, z.email().optional()),
    /** Origen público del sitio (Next.js) para los enlaces de los correos. */
    PUBLIC_SITE_URL: z.preprocess(blankAsUndefined, z.url().optional()),
    EMAIL_SEND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
    EMAIL_WORKER_POLL_MS: z.coerce.number().int().min(100).default(5_000),
    EMAIL_WORKER_BATCH: z.coerce.number().int().min(1).max(100).default(10),
    EMAIL_WORKER_LOCK_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60_000),

    // ── Imágenes del catálogo (LN-12) ──
    /** Carpeta del adaptador de disco local (relativa al proceso o absoluta). */
    IMAGES_DIR: z.preprocess(blankAsUndefined, z.string().min(1).default("uploads")),
    /** Base pública de las imágenes guardadas en IMAGES_DIR (sin barra final). */
    IMAGES_PUBLIC_URL: z.preprocess(blankAsUndefined, z.url().optional()),

    // ── Carrito (LN-06) ──
    /** Días sin uso tras los que vence el carrito del invitado (expiración deslizante). */
    CART_TTL_DAYS: z.preprocess(
      blankAsUndefined,
      z.coerce.number().int().min(1).max(90).default(30),
    ),
  })
  .superRefine((env, ctx) => {
    const production = env.NODE_ENV === "production";
    const required = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (production && !env.CSRF_SECRET) {
      required("CSRF_SECRET", "CSRF_SECRET es obligatorio en producción");
    }
    if (production && env.EMAIL_PROVIDER === "brevo") {
      if (!env.BREVO_API_KEY)
        required("BREVO_API_KEY", "BREVO_API_KEY es obligatorio en producción con Brevo");
      if (!env.BREVO_SENDER_EMAIL) {
        required("BREVO_SENDER_EMAIL", "BREVO_SENDER_EMAIL es obligatorio en producción con Brevo");
      }
      if (!env.EMAIL_ADMIN_TO)
        required("EMAIL_ADMIN_TO", "EMAIL_ADMIN_TO es obligatorio en producción con Brevo");
    }
    if (production && !env.PUBLIC_SITE_URL?.startsWith("https://")) {
      required("PUBLIC_SITE_URL", "PUBLIC_SITE_URL es obligatorio en producción y debe usar https");
    }
    if (production && !env.IMAGES_PUBLIC_URL?.startsWith("https://")) {
      required(
        "IMAGES_PUBLIC_URL",
        "IMAGES_PUBLIC_URL es obligatorio en producción y debe usar https",
      );
    }
    if (env.EMAIL_WORKER_LOCK_TIMEOUT_MS <= env.EMAIL_SEND_TIMEOUT_MS) {
      required(
        "EMAIL_WORKER_LOCK_TIMEOUT_MS",
        "EMAIL_WORKER_LOCK_TIMEOUT_MS debe ser mayor que EMAIL_SEND_TIMEOUT_MS",
      );
    }
  })
  .transform((env) => ({
    ...env,
    API_DOCS: env.API_DOCS ?? (env.NODE_ENV === "production" ? "disabled" : "enabled"),
    BREVO_SENDER_EMAIL: env.BREVO_SENDER_EMAIL ?? DEV_SENDER_EMAIL,
    EMAIL_ADMIN_TO: env.EMAIL_ADMIN_TO ?? DEV_ADMIN_TO,
    PUBLIC_SITE_URL: (env.PUBLIC_SITE_URL ?? DEV_SITE_URL).replace(/\/+$/, ""),
    IMAGES_PUBLIC_URL: (env.IMAGES_PUBLIC_URL ?? DEV_IMAGES_URL).replace(/\/+$/, ""),
  }));

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.safeParse(source);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = parseEnv(source);
  if (!parsed.success) {
    console.error("Variables de entorno inválidas:", z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

/** Convierte TRUST_PROXY ("true", "1", "loopback", ...) al valor que espera Express. */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  return Number.isInteger(asNumber) ? asNumber : value;
}

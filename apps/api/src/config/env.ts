import "dotenv/config";
import { z } from "zod";

/** Una variable presente pero vacía (`CSRF_SECRET=`) cuenta como no definida. */
const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);

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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.CSRF_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["CSRF_SECRET"],
        message: "CSRF_SECRET es obligatorio en producción",
      });
    }
  })
  .transform((env) => ({
    ...env,
    API_DOCS: env.API_DOCS ?? (env.NODE_ENV === "production" ? "disabled" : "enabled"),
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

import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
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

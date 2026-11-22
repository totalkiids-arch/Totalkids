import { vi } from "vitest";

import { createApp, type AppDeps } from "../src/app.js";
import { CSRF_COOKIE_DEV, issueCsrfToken } from "../src/lib/csrf.js";
import { createLogger } from "../src/lib/logger.js";
import type { PrismaClient } from "../src/lib/prisma.js";

type QueryRaw = Pick<PrismaClient, "$queryRaw">;

/** Cliente para createApp: los tests sin base solo implementan $queryRaw. */
const asClient = (prisma: QueryRaw | PrismaClient) => prisma as PrismaClient;

export const testEnv: AppDeps["env"] = {
  NODE_ENV: "test",
  CORS_ORIGINS: ["http://localhost:3000"],
  TRUST_PROXY: "loopback",
  // Alto para que el límite global no interfiera; rate-limit.test.ts lo baja.
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 10_000,
  CSRF_SECRET: "secreto-de-pruebas-con-al-menos-32-caracteres",
  API_DOCS: "enabled",
};

/**
 * Cabeceras de un par CSRF válido (cookie + X-CSRF-Token), como las mandaría
 * Next.js: `request(app).post(url).set(csrfHeaders())`.
 */
export function csrfHeaders(sessionKey = ""): Record<string, string> {
  const token = issueCsrfToken(testEnv.CSRF_SECRET ?? "", sessionKey);
  return { cookie: `${CSRF_COOKIE_DEV}=${token}`, "x-csrf-token": token };
}

/**
 * Prisma falso: solo $queryRaw, que resuelve (la base "responde"). Sirve para las
 * rutas que no tocan modelos; las que sí, se prueban contra la base real (*.db.test.ts).
 */
export function fakePrisma(): PrismaClient {
  return { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as PrismaClient;
}

export interface TestAppOptions extends Partial<Omit<AppDeps, "env" | "prisma">> {
  env?: Partial<AppDeps["env"]>;
  prisma?: QueryRaw | PrismaClient;
}

/** App de pruebas con logs silenciosos; acepta overrides de env y rutas extra. */
export function buildTestApp(prismaOrOptions?: QueryRaw | PrismaClient | TestAppOptions) {
  const options: TestAppOptions =
    prismaOrOptions && "$queryRaw" in prismaOrOptions
      ? { prisma: prismaOrOptions }
      : (prismaOrOptions ?? {});
  return createApp({
    ...options,
    logger: options.logger ?? createLogger("silent", false),
    prisma: asClient(options.prisma ?? fakePrisma()),
    env: { ...testEnv, ...options.env },
  });
}

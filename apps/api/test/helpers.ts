import { vi } from "vitest";

import { createApp, type AppDeps } from "../src/app.js";
import { CSRF_COOKIE_DEV, issueCsrfToken } from "../src/lib/csrf.js";
import { createLogger } from "../src/lib/logger.js";
import type { PrismaClient } from "../src/lib/prisma.js";

type QueryRaw = Pick<PrismaClient, "$queryRaw">;

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

/** Prisma falso: $queryRaw resuelve (la base "responde"). */
export function fakePrisma(): QueryRaw {
  return { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as QueryRaw;
}

export interface TestAppOptions extends Partial<Omit<AppDeps, "env">> {
  env?: Partial<AppDeps["env"]>;
}

/** App de pruebas con logs silenciosos; acepta overrides de env y rutas extra. */
export function buildTestApp(prismaOrOptions?: QueryRaw | TestAppOptions) {
  const options: TestAppOptions =
    prismaOrOptions && "$queryRaw" in prismaOrOptions
      ? { prisma: prismaOrOptions }
      : (prismaOrOptions ?? {});
  return createApp({
    ...options,
    logger: options.logger ?? createLogger("silent", false),
    prisma: options.prisma ?? fakePrisma(),
    env: { ...testEnv, ...options.env },
  });
}

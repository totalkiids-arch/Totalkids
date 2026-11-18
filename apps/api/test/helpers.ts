import { createApp } from "../src/app.js";
import { createLogger } from "../src/lib/logger.js";
import type { PrismaClient } from "../src/lib/prisma.js";

export function buildTestApp(prisma: Pick<PrismaClient, "$queryRaw">) {
  return createApp({
    env: { CORS_ORIGINS: ["http://localhost:3000"], TRUST_PROXY: "loopback" },
    logger: createLogger("silent", false),
    prisma,
  });
}

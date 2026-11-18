import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = createPrismaClient(env.DATABASE_URL);
const app = createApp({ env, logger, prisma });

const server = app.listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT}/api/v1`);
  logger.info(`Documentación en http://localhost:${env.PORT}/api/docs`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} recibido, cerrando servidor`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

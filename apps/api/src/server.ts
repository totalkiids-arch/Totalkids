import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";
import { createFlowClient } from "./services/flow/client.js";
import { parseFlowConfig } from "./services/flow/config.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = createPrismaClient(env.DATABASE_URL);
const flowConfig = parseFlowConfig(process.env);
if (!flowConfig) logger.warn("Flow sin configurar: no se pueden iniciar pagos");
const app = createApp({
  env,
  logger,
  prisma,
  flow: flowConfig && {
    client: createFlowClient(flowConfig),
    callbackBase: flowConfig.callbackBase,
    sealSecret: flowConfig.secretKey,
  },
});

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

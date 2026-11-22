import "dotenv/config";

import { createPrismaClient } from "../src/lib/prisma.js";

/**
 * Antes de toda la corrida, vacía la base de tests (TEST_DATABASE_URL) para que
 * cada ejecución parta limpia. TRUNCATE no dispara los triggers por fila, así
 * que también limpia audit_log (que no admite DELETE). No reinicia las
 * secuencias: los números de pedido siguen partiendo en TK-1001 o más.
 *
 * Solo actúa sobre una base cuyo nombre termina en "_test".
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const database = new URL(url).pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una base *_test (es "${database}")`);
  }

  const prisma = createPrismaClient(url);
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

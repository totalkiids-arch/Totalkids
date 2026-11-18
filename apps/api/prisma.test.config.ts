// Configuración de Prisma CLI para la base de tests (TEST_DATABASE_URL).
// Uso: pnpm db:migrate:test
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("TEST_DATABASE_URL"),
  },
});

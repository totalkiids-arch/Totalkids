// Configuración de Prisma CLI (base de desarrollo: DATABASE_URL).
// Prisma 7 no carga .env automáticamente, por eso se importa dotenv.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // pnpm db:seed: catálogo importado y configuración inicial (idempotente).
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

import "dotenv/config";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Los *.db.test.ts comparten totalkids_test y algunos guardan datos (p. ej.
    // catálogo y carrito): en paralelo, uno alteraría los conteos exactos del otro.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  },
});

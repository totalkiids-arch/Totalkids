import { readFileSync } from "node:fs";

import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { parse } from "yaml";

const specPath = new URL("../../openapi.yaml", import.meta.url);

export function docsRouter(): Router {
  const spec = parse(readFileSync(specPath, "utf8")) as Record<string, unknown>;
  const router = Router();
  router.get("/openapi.json", (_req, res) => {
    res.json(spec);
  });
  router.use("/", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Total Kids API" }));
  return router;
}

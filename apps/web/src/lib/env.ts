import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  API_URL: z
    .url()
    .default("http://localhost:4000")
    .transform((url) => url.replace(/\/+$/, "")),
});

/** Variables de entorno de servidor. No importar desde componentes de cliente. */
export const serverEnv = serverEnvSchema.parse(process.env);

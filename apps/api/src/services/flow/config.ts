import { z } from "zod";

/** Únicas bases permitidas (SRS 4.4.1): las claves nunca salen hacia otro host. */
export const FLOW_SANDBOX_BASE = "https://sandbox.flow.cl/api";
export const FLOW_PRODUCTION_BASE = "https://www.flow.cl/api";

const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  FLOW_API_KEY: z.preprocess(blankAsUndefined, z.string().optional()),
  FLOW_SECRET_KEY: z.preprocess(blankAsUndefined, z.string().optional()),
  FLOW_API_BASE: z.preprocess(
    blankAsUndefined,
    z.enum([FLOW_SANDBOX_BASE, FLOW_PRODUCTION_BASE]).default(FLOW_SANDBOX_BASE),
  ),
});

export interface FlowConfig {
  apiKey: string;
  secretKey: string;
  apiBase: string;
}

/**
 * Configuración de Flow desde el entorno. null si no hay claves (Flow
 * deshabilitado); error si solo hay una o la base no es de Flow.
 */
export function parseFlowConfig(
  source: Readonly<Record<string, string | undefined>>,
): FlowConfig | null {
  const parsed = schema.safeParse(source);
  // No se incluye el valor recibido: podría ser una clave mal puesta.
  if (!parsed.success) throw new Error("FLOW_API_BASE debe ser la base oficial de Flow");
  const { FLOW_API_KEY: apiKey, FLOW_SECRET_KEY: secretKey, FLOW_API_BASE: apiBase } = parsed.data;
  if (!apiKey && !secretKey) return null;
  if (!apiKey || !secretKey) {
    throw new Error("FLOW_API_KEY y FLOW_SECRET_KEY deben definirse juntas");
  }
  return { apiKey, secretKey, apiBase };
}

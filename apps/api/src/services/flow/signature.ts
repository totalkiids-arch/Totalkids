import { createHmac } from "node:crypto";

export type FlowParams = Readonly<Record<string, string>>;

/**
 * Firma de Flow (SRS 4.4.1): parámetros ordenados por nombre, concatenación
 * nombre+valor sin separadores y HMAC-SHA256 hexadecimal con la secretKey.
 * El propio parámetro `s` nunca entra en el cálculo.
 */
export function signFlowParams(params: FlowParams, secretKey: string): string {
  const text = Object.keys(params)
    .filter((name) => name !== "s")
    .sort()
    .map((name) => `${name}${params[name] ?? ""}`)
    .join("");
  return createHmac("sha256", secretKey).update(text, "utf8").digest("hex");
}

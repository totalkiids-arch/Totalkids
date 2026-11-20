/**
 * Regiones de Chile, de norte a sur, para la dirección de despacho.
 * El código es estable (se guarda en el pedido); el nombre es de presentación.
 */
export const REGIONS = [
  { code: "AP", name: "Arica y Parinacota" },
  { code: "TA", name: "Tarapacá" },
  { code: "AN", name: "Antofagasta" },
  { code: "AT", name: "Atacama" },
  { code: "CO", name: "Coquimbo" },
  { code: "VS", name: "Valparaíso" },
  { code: "RM", name: "Región Metropolitana" },
  { code: "LI", name: "O'Higgins" },
  { code: "ML", name: "Maule" },
  { code: "NB", name: "Ñuble" },
  { code: "BI", name: "Biobío" },
  { code: "AR", name: "La Araucanía" },
  { code: "LR", name: "Los Ríos" },
  { code: "LL", name: "Los Lagos" },
  { code: "AI", name: "Aysén" },
  { code: "MA", name: "Magallanes" },
] as const;

export type RegionCode = (typeof REGIONS)[number]["code"];

export function isRegionCode(value: unknown): value is RegionCode {
  return typeof value === "string" && REGIONS.some((r) => r.code === value);
}

export function regionName(code: RegionCode): string {
  return REGIONS.find((r) => r.code === code)?.name ?? code;
}

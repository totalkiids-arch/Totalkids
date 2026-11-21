/** Plantillas visuales disponibles para la tienda. Solo puede haber una activa. */
export const STORE_THEMES = [
  "clasica",
  "navidad",
  "pascua",
  "ano-nuevo",
  "fiestas-patrias",
  "invierno",
  "primavera",
] as const;

export type StoreThemeId = (typeof STORE_THEMES)[number];

export interface StoreTheme {
  id: StoreThemeId;
  name: string;
  description: string;
  season: string;
}

export const DEFAULT_STORE_THEME: StoreThemeId = "clasica";

export const storeThemes: readonly StoreTheme[] = [
  {
    id: "clasica",
    name: "Clásica Total Kids",
    description: "La identidad habitual, cálida y colorida de la tienda.",
    season: "Todo el año",
  },
  {
    id: "navidad",
    name: "Navidad",
    description: "Rojo pino, verde y detalles dorados para campañas navideñas.",
    season: "Diciembre",
  },
  {
    id: "pascua",
    name: "Pascua",
    description: "Tonos lavanda, menta y amarillo suave para celebrar Pascua.",
    season: "Marzo / abril",
  },
  {
    id: "ano-nuevo",
    name: "Año Nuevo",
    description: "Azul noche, violeta y acentos dorados para comenzar el año.",
    season: "Enero",
  },
  {
    id: "fiestas-patrias",
    name: "Fiestas Patrias",
    description: "Banderas chilenas, manta y sombrero para celebrar el dieciocho.",
    season: "Septiembre",
  },
  {
    id: "invierno",
    name: "Invierno",
    description: "Azules profundos y celestes suaves para la temporada fría.",
    season: "Junio / agosto",
  },
  {
    id: "primavera",
    name: "Primavera",
    description: "Verdes frescos, coral y flores para una tienda luminosa.",
    season: "Septiembre / noviembre",
  },
] as const;

export function isStoreThemeId(value: unknown): value is StoreThemeId {
  return typeof value === "string" && (STORE_THEMES as readonly string[]).includes(value);
}

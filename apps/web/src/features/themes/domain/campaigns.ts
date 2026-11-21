import type { StoreThemeId } from "./store-theme";

/** Plantillas con ambientación de campaña (la clásica no la tiene). */
export type CampaignThemeId = Exclude<StoreThemeId, "clasica">;

/** Textos de campaña: franja superior y diapositiva principal de la portada. */
export interface StoreCampaign {
  id: CampaignThemeId;
  /** Franja superior. */
  title: string;
  detail: string;
  /** Diapositiva de portada. */
  eyebrow: string;
  heroTitle: string;
  heroHighlight: string;
  heroBody: string;
  bubble: string;
  sceneLabel: string;
  cta: { href: string; label: string };
}

const CAMPAIGNS: Record<CampaignThemeId, StoreCampaign> = {
  navidad: {
    id: "navidad",
    title: "Navidad para jugar y compartir",
    detail: "Los amigos de Total Kids ya preparan los regalos.",
    eyebrow: "Campaña de Navidad",
    heroTitle: "Regalos que se quedan",
    heroHighlight: "para crecer",
    heroBody:
      "Muebles de madera hechos para jugar, ordenar y soñar mucho después de abrir el regalo. Elige con tiempo y coordinamos el despacho o el retiro en el taller.",
    bubble: "¡Jo, jo! Este librero va bajo el árbol.",
    sceneLabel: "Un animalito con gorro navideño junto a un árbol de Navidad y regalos",
    cta: { href: "/catalogo", label: "Ver regalos" },
  },
  pascua: {
    id: "pascua",
    title: "Una Pascua llena de sorpresas",
    detail: "Nuestros amigos escondieron huevitos por la tienda.",
    eyebrow: "Campaña de Pascua",
    heroTitle: "Una Pascua para",
    heroHighlight: "buscar y jugar",
    heroBody:
      "Cubos, baúles y repisas a su altura: el escondite perfecto para los huevitos y para todo lo que viene después.",
    bubble: "¡Encontré otro huevito!",
    sceneLabel: "Un animalito con orejas de conejo rodeado de huevos de Pascua",
    cta: { href: "/catalogo?categoria=almacenamiento", label: "Ver almacenamiento" },
  },
  "ano-nuevo": {
    id: "ano-nuevo",
    title: "¡Comencemos un nuevo año jugando!",
    detail: "Los animales celebran nuevas aventuras en familia.",
    eyebrow: "Campaña de Año Nuevo",
    heroTitle: "Año nuevo,",
    heroHighlight: "rincón nuevo",
    heroBody:
      "Renueva su pieza o la sala de clases con mesas, sillas y libreros pensados para un año de aprendizajes.",
    bubble: "¡Feliz año nuevo, amigos!",
    sceneLabel: "Un animalito con gorro de fiesta bajo fuegos artificiales",
    cta: { href: "/catalogo", label: "Ver catálogo" },
  },
  "fiestas-patrias": {
    id: "fiestas-patrias",
    title: "¡Felices Fiestas Patrias!",
    detail: "Nuestra pandilla se puso la manta y el sombrero para celebrar Chile.",
    eyebrow: "Campaña de Fiestas Patrias",
    heroTitle: "¡A celebrar el",
    heroHighlight: "dieciocho!",
    heroBody:
      "Muebles chilenos de madera para jugar en familia estas fiestas. Coordina el despacho o retíralos en nuestro taller.",
    bubble: "¡Viva Chile, po!",
    sceneLabel: "Un animalito con manta y sombrero huaso entre banderas chilenas",
    cta: { href: "/catalogo", label: "Ver catálogo" },
  },
  invierno: {
    id: "invierno",
    title: "Invierno de aventuras en casa",
    detail: "Los amigos de Total Kids se abrigaron para seguir jugando.",
    eyebrow: "Campaña de invierno",
    heroTitle: "Panoramas bajo techo",
    heroHighlight: "todo el invierno",
    heroBody:
      "Mesas para dibujar, camas casita y rincones de lectura para que los días de lluvia también sean de juego.",
    bubble: "¡Brr! Mejor jugamos adentro.",
    sceneLabel: "Un animalito con gorro de lana bajo copos de nieve",
    cta: { href: "/catalogo?categoria=cunas", label: "Ver camas casita" },
  },
  primavera: {
    id: "primavera",
    title: "Llegó la primavera a Total Kids",
    detail: "Flores, color y amigos listos para imaginar.",
    eyebrow: "Campaña de primavera",
    heroTitle: "Rincones que",
    heroHighlight: "florecen",
    heroBody:
      "Color, luz y muebles a su medida para estrenar espacios de juego con la llegada del buen tiempo.",
    bubble: "¡Huele a flores!",
    sceneLabel: "Un animalito con corona de flores en un jardín",
    cta: { href: "/catalogo", label: "Ver catálogo" },
  },
};

export function campaignFor(theme: StoreThemeId): StoreCampaign | null {
  return theme === "clasica" ? null : CAMPAIGNS[theme];
}

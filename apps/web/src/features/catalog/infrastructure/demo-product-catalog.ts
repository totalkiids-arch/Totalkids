import type { ProductCatalog } from "../application/product-catalog";
import type { ProductSummary } from "../domain/product";

/**
 * Adaptador de demostración con los productos de la maqueta aprobada.
 * Se reemplaza por un adaptador que consulte la API (vía rutas BFF / apiFetch)
 * cuando exista el endpoint de catálogo.
 */
const FEATURED: ProductSummary[] = [
  {
    slug: "set-mesa-2-sillas-colores",
    name: "Set mesa + 2 sillas Colores",
    category: "Mesas y Sillas",
    ageRange: "3 a 6 años",
    summary: "Cubierta lavable y cantos redondeados para pintar, armar y compartir.",
    price: null,
    compareAtPrice: null,
    badge: { label: "-[X]%", tone: "sale" },
    room: "estudio",
    illustration: { key: "mesa-sillas", alt: "Mesa amarilla con dos sillas y bloques de letras" },
  },
  {
    slug: "librero-frontal-3-niveles",
    name: "Librero frontal 3 niveles",
    category: "Libreros",
    ageRange: "2 a 8 años",
    summary: "Portadas a la vista para que elijan solos su próxima lectura.",
    price: null,
    compareAtPrice: null,
    badge: { label: "Montessori", tone: "line" },
    room: "dormitorio",
    illustration: { key: "librero", alt: "Librero frontal de madera con libros de colores" },
  },
  {
    slug: "cama-casita-montessori-1-plaza",
    name: "Cama casita Montessori 1 plaza",
    category: "Camas",
    ageRange: "2 a 10 años",
    summary: "Baja al piso para subir y bajar sin ayuda. Un refugio para soñar.",
    price: null,
    compareAtPrice: null,
    badge: { label: "Nuevo", tone: "new" },
    room: "dormitorio",
    illustration: { key: "cama-casita", alt: "Cama casita de madera con techo y bandera" },
  },
  {
    slug: "baul-juguetes-con-banca",
    name: "Baúl de juguetes con banca",
    category: "Organizadores",
    ageRange: "Todas las edades",
    summary: "Tapa con cierre lento antipellizcos. Guarda y sirve de asiento.",
    price: null,
    compareAtPrice: null,
    badge: { label: "-[X]%", tone: "sale" },
    room: "juego-orden",
    illustration: { key: "baul", alt: "Baúl verde de juguetes con letras ABC, pelota y bloque" },
  },
  {
    slug: "escritorio-crece-conmigo",
    name: "Escritorio Crece Conmigo",
    category: "Escritorios",
    ageRange: "6 a 12 años",
    summary: "Altura regulable y cajonera para tareas, dibujo y manualidades.",
    price: null,
    compareAtPrice: null,
    badge: null,
    room: "estudio",
    illustration: { key: "escritorio", alt: "Escritorio azul con lámpara, libro y silla roja" },
  },
  {
    slug: "organizador-6-cubos-arcoiris",
    name: "Organizador 6 cubos Arcoíris",
    category: "Organizadores",
    ageRange: "Todas las edades",
    summary: "Un color por tipo de juguete: ordenar también es aprender a clasificar.",
    price: null,
    compareAtPrice: null,
    badge: { label: "Top ventas", tone: "top" },
    room: "juego-orden",
    illustration: { key: "organizador", alt: "Organizador de madera con seis cubos de colores" },
  },
  {
    slug: "atril-doble-pizarra-magnetica",
    name: "Atril doble pizarra y magnética",
    category: "Juego",
    ageRange: "3 a 8 años",
    summary: "Para dibujar, escribir las primeras letras y jugar a la escuela.",
    price: null,
    compareAtPrice: null,
    badge: null,
    room: "juego-orden",
    illustration: { key: "atril", alt: "Atril de madera con pizarra y números dibujados" },
  },
  {
    slug: "torre-aprendizaje-regulable",
    name: "Torre de aprendizaje regulable",
    category: "Montessori",
    ageRange: "18 meses a 5 años",
    summary: "Sube a la altura del mesón para cocinar y ayudar en casa con baranda segura.",
    price: null,
    compareAtPrice: null,
    badge: { label: "Montessori", tone: "line" },
    room: "estudio",
    illustration: {
      key: "torre",
      alt: "Torre de aprendizaje de madera con plataforma y peldaño",
    },
  },
];

export const demoProductCatalog: ProductCatalog = {
  listFeatured: async () => FEATURED,
};

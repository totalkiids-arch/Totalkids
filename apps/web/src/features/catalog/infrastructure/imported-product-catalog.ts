import type { ProductCatalog } from "../application/product-catalog";
import { applyCatalogQuery } from "../domain/catalog-query";
import { CATEGORIES, type CategorySlug, type ProductSummary } from "../domain/product";
import { discountPercent, type ProductDetail } from "../domain/product-detail";
import records from "./totalmuebles/catalogo.json";
import type { CatalogRecord } from "./totalmuebles/transform";

/**
 * Adaptador con el catálogo importado de totalmuebles.cl
 * (`pnpm catalogo:importar`). Se reemplaza por uno que consulte la API cuando el
 * catálogo viva en la base de datos; este JSON será su semilla.
 */
const CATALOG = records as CatalogRecord[];

/** Plazo que el cliente publica para todo su catálogo ("Tiempo de fabricación 3 a 5 días hábiles"). */
const LEAD_TIME = "3 a 5 días hábiles";

const CARE = [
  "Llega embalado, con piezas identificadas e instrucciones de armado.",
  "Limpieza con paño húmedo y jabón neutro; evita productos abrasivos.",
  "Revisa y reaprieta tornillos y uniones cada cierto tiempo, sobre todo en uso diario de aula.",
];

/** Contenido de tienda por categoría: Tito y "Cómo aprende jugando". */
const CATEGORY_STORY: Record<
  CategorySlug,
  { quote: string; learning: { title: string; text: string }[] }
> = {
  cunas: {
    quote: "¡En mi cuna descanso tranquilo y despierto listo para jugar!",
    learning: [
      { title: "Descanso", text: "Un lugar seguro y propio ayuda a crear rutinas de sueño." },
      { title: "Seguridad", text: "Barandas y alturas pensadas para salas cuna." },
      { title: "Confianza", text: "Siempre a la vista de quien lo cuida." },
    ],
  },
  mesas: {
    quote: "¡En mi mesa pinto, armo y comparto con mis amigos!",
    learning: [
      {
        title: "Concentración",
        text: "A su altura, los pies tocan el suelo y la espalda descansa.",
      },
      { title: "Compartir", text: "Un espacio común para crear, conversar y comer juntos." },
      { title: "Motricidad fina", text: "Dibujar, recortar y armar con comodidad." },
    ],
  },
  sillas: {
    quote: "¡Me siento solito y mis pies llegan al suelo!",
    learning: [
      { title: "Autonomía", text: "Se sientan y se levantan sin ayuda." },
      { title: "Postura", text: "La altura justa para cada nivel cuida su espalda." },
      { title: "Atención", text: "Cómodos, se concentran más tiempo en lo que hacen." },
    ],
  },
  mudadores: {
    quote: "¡El momento del cambio también es para conversar y reír!",
    learning: [
      { title: "Vínculo", text: "El cambio de muda es un momento de contacto y conversación." },
      { title: "Seguridad", text: "Barandas y superficies acolchadas para cada movimiento." },
      { title: "Orden", text: "Cada niño tiene su espacio para sus cosas." },
    ],
  },
  almacenamiento: {
    quote: "¡Cada juguete tiene su casa y yo sé dónde va!",
    learning: [
      { title: "Orden", text: "A su altura, guardar al terminar se vuelve parte del juego." },
      { title: "Autonomía", text: "Eligen y devuelven sus materiales sin ayuda." },
      { title: "Clasificar", text: "Agrupar por tipo o color es su primer ejercicio lógico." },
    ],
  },
  "montessori-pikler": {
    quote: "¡Subo, bajo y me deslizo a mi ritmo!",
    learning: [
      { title: "Movimiento libre", text: "Exploran su cuerpo y sus límites sin apuro." },
      { title: "Confianza", text: "Cada logro lo consiguen por sí mismos." },
      { title: "Coordinación", text: "Trepar y equilibrarse desarrolla la motricidad gruesa." },
    ],
  },
  junji: {
    quote: "¡Mi sala está hecha a mi medida!",
    learning: [
      { title: "A su medida", text: "Mobiliario pensado para cada nivel educativo." },
      { title: "Seguridad", text: "Bordes redondeados y materiales no tóxicos." },
      { title: "Autonomía", text: "Todo a su alcance para hacerlo por sí mismos." },
    ],
  },
};

function toSummary(r: CatalogRecord): ProductSummary {
  const percent = discountPercent(r.price, r.compareAtPrice);
  const badge =
    percent !== null
      ? { label: `-${percent}%`, tone: "sale" as const }
      : r.categories.includes("montessori-pikler")
        ? { label: "Montessori", tone: "line" as const }
        : null;
  return {
    slug: r.slug,
    name: r.name,
    category: CATEGORIES.find((c) => c.slug === r.category)?.label ?? "Productos",
    categories: r.categories,
    levels: r.levels,
    summary: r.summary,
    price: r.price,
    compareAtPrice: r.compareAtPrice,
    badge,
    materials: r.materials,
    popularity: r.popularity,
    publishedAt: r.publishedAt,
    featured: r.featured,
    inStock: false,
    image: r.images[0] ?? null,
  };
}

function toDetail(r: CatalogRecord): ProductDetail {
  const story = CATEGORY_STORY[r.category];
  const text = [...r.description, ...r.specs.map((s) => s.value)].join(" ").toLowerCase();
  return {
    ...toSummary(r),
    images: r.images,
    description: r.description,
    specs: r.specs,
    dimensions: r.dimensions,
    care: CARE,
    learning: story.learning,
    mascotQuote: story.quote,
    optionName: null,
    variants: [
      {
        sku: `TK-${r.sourceId}`,
        option: null,
        price: r.price,
        compareAtPrice: r.compareAtPrice,
        // Todo se fabrica a pedido: las unidades terminadas las informa el
        // inventario del panel (ver container.ts), no el sitio importado.
        available: 0,
      },
    ],
    extras: [{ id: "armado", label: "Armado a domicilio", price: null, personalization: null }],
    installments: null,
    leadTime: LEAD_TIME,
    warrantyMonths: null,
    highlight: /redondead|sin filo/.test(text) ? "Bordes redondeados" : "Fabricación propia",
  };
}

const SUMMARIES = CATALOG.map(toSummary);

export const importedProductCatalog: ProductCatalog = {
  listFeatured: async () => SUMMARIES.filter((p) => p.featured),
  search: async (query) => applyCatalogQuery(SUMMARIES, query),
  getBySlug: async (slug) => {
    const record = CATALOG.find((r) => r.slug === slug);
    return record ? toDetail(record) : null;
  },
  listRelated: async (slug, limit) => {
    const product = CATALOG.find((r) => r.slug === slug);
    if (!product) return [];
    // Completan la sala: otra categoría, primero los que comparten nivel, luego los más vendidos.
    const sharesLevel = (r: CatalogRecord) => r.levels.some((l) => product.levels.includes(l));
    const picked = CATALOG.filter((r) => r.slug !== slug && r.category !== product.category)
      .sort(
        (a, b) => Number(sharesLevel(b)) - Number(sharesLevel(a)) || b.popularity - a.popularity,
      )
      .filter((r, i, list) => list.findIndex((x) => x.category === r.category) === i)
      .slice(0, limit);
    return picked.map(toSummary);
  },
  listSlugs: async () => CATALOG.map((r) => r.slug),
};

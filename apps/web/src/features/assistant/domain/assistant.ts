import type { ContactInfo } from "./contact";

/**
 * Respuestas de Tito, el ayudante de la tienda. Funciona con palabras clave en el
 * navegador: no usa inteligencia artificial ni envía lo que se escribe. Dominio puro.
 */

export interface AnswerLink {
  label: string;
  /** Ruta interna ("/…") o enlace de contacto (tel:, mailto:, https://wa.me). */
  href: string;
}

export interface Answer {
  text: string;
  links: AnswerLink[];
}

export type TopicId =
  "products" | "contact" | "tracking" | "delivery" | "payment" | "services" | "changes";

/** Botones rápidos del panel. */
export const QUICK_TOPICS: readonly { id: TopicId; label: string }[] = [
  { id: "products", label: "Busco un mueble" },
  { id: "contact", label: "Correo y teléfono" },
  { id: "tracking", label: "Mi pedido" },
  { id: "delivery", label: "Despacho y retiro" },
  { id: "payment", label: "Formas de pago" },
  { id: "services", label: "Servicios a medida" },
  { id: "changes", label: "Cambios y garantía" },
];

export const GREETING =
  "¡Hola! Soy Tito. Te ayudo a encontrar muebles, resolver dudas o contactar al equipo. ¿Qué necesitas?";

const REQUEST_FORM: AnswerLink = { label: "Escribir al equipo", href: "/servicios/solicitar" };

function contactAnswer(contact: ContactInfo): Answer {
  const lines = [
    contact.phone && `Teléfono: ${contact.phone}`,
    contact.email && `Correo: ${contact.email}`,
    contact.address && `Dirección: ${contact.address}`,
    contact.hours && `Horario: ${contact.hours}`,
  ].filter(Boolean);
  const links: AnswerLink[] = [];
  if (contact.whatsapp) {
    links.push({ label: "WhatsApp", href: `https://wa.me/${contact.whatsapp}` });
  }
  if (contact.phone) {
    links.push({ label: "Llamar", href: `tel:${contact.phone.replace(/[^\d+]/g, "")}` });
  }
  if (contact.email) links.push({ label: "Enviar correo", href: `mailto:${contact.email}` });
  if (links.length === 0) links.push(REQUEST_FORM);
  return {
    text:
      lines.length > 0
        ? `Así puedes contactarnos:\n${lines.join("\n")}`
        : "Déjanos tu mensaje en el formulario y el equipo te responderá.",
    links,
  };
}

export function topicAnswer(topic: TopicId, contact: ContactInfo): Answer {
  switch (topic) {
    case "products":
      return {
        text: "¿Qué tipo de mueble buscas? Elige una categoría o escríbeme, por ejemplo: «estante».",
        links: CATEGORIES.map(({ label, href }) => ({ label, href })),
      };
    case "contact":
      return contactAnswer(contact);
    case "tracking":
      return {
        text: "Para ver tu pedido necesitas su número (TK-…) y el correo con que compraste.",
        links: [{ label: "Consultar mi pedido", href: "/seguimiento" }],
      };
    case "delivery":
      return {
        text: "Puedes pedir despacho a domicilio o retirar en el taller. Al comprar, con tu comuna, te mostramos el costo o si queda por coordinar. Lo que no está en stock se fabrica a pedido.",
        links: [{ label: "Ver despachos y retiro", href: "/politicas#despacho" }],
      };
    case "payment":
      return {
        text: "Se paga en línea con Flow. El comprobante de Flow reemplaza la boleta y también puedes pedir factura.",
        links: [{ label: "Ver medios de pago", href: "/politicas#compra" }],
      };
    case "services":
      return {
        text: "Hacemos armado, diseño de espacios, personalización y proyectos para jardines y colegios.",
        links: [
          { label: "Ver servicios", href: "/servicios" },
          { label: "Pedir una cotización", href: "/servicios/solicitar" },
        ],
      };
    case "changes":
      return {
        text: "Aquí están las condiciones de cambios y garantía. Si tienes un problema con tu mueble, escríbenos.",
        links: [{ label: "Cambios y garantía", href: "/politicas#cambios" }, REQUEST_FORM],
      };
  }
}

/** Categorías que Tito reconoce por palabra. Los enlaces son los del menú de la tienda. */
const CATEGORIES: readonly (AnswerLink & { match: RegExp })[] = [
  {
    label: "Cunas y camas",
    href: "/catalogo?categoria=cunas",
    match: /\b(cunas?|camas?|dormir|colchon(es)?)\b/,
  },
  { label: "Mesas", href: "/catalogo?categoria=mesas", match: /\b(mesas?|mesitas?)\b/ },
  {
    label: "Sillas",
    href: "/catalogo?categoria=sillas",
    match: /\b(sillas?|sillitas?|asientos?)\b/,
  },
  {
    label: "Mudadores",
    href: "/catalogo?categoria=mudadores",
    match: /\b(mudador(es)?|cambiador(es)?)\b/,
  },
  {
    label: "Almacenamiento",
    href: "/catalogo?categoria=almacenamiento",
    match: /\b(almacen\w*|guardar|estantes?|repisas?|cajon\w*|baul(es)?|organizador(es)?)\b/,
  },
  {
    label: "Montessori y Pikler",
    href: "/catalogo?categoria=montessori-pikler",
    match: /\b(montes+ori|pikler|trepar)\b/,
  },
  { label: "Línea JUNJI", href: "/catalogo?categoria=junji", match: /\bjunji\b/ },
  { label: "Ofertas", href: "/catalogo?ofertas=1", match: /\b(ofertas?|descuentos?|rebajas?)\b/ },
];

/** En orden: gana el primero que calza. */
const TOPICS: readonly { id: TopicId; match: RegExp }[] = [
  {
    id: "tracking",
    match: /\b(mi (pedido|compra|orden)|seguimiento|rastre\w*|tk-?\d+|cuando llega)\b/,
  },
  { id: "changes", match: /\b(cambios?|devol\w+|garantia|reembolso|roto|fallad\w+)\b/ },
  {
    id: "payment",
    match: /\b(pag(o|os|ar|ue)|cuotas?|tarjetas?|flow|boleta|factura|transferencia)\b/,
  },
  { id: "delivery", match: /\b(despach\w*|envi(o|os|an|ar)|retir\w*|delivery|entregas?)\b/ },
  {
    id: "contact",
    match:
      /\b(contact\w*|correos?|e?-?mail|telefonos?|numero|fono|celular|whatsapp|wsp|llamar|hablar|direccion|ubica\w*|horarios?|donde (estan|queda\w*))\b/,
  },
  {
    id: "services",
    match:
      /\b(servicios?|arma(do|r)|instala\w*|medida|personaliza\w*|cotiza\w*|jardin(es)?|colegios?|diseno)\b/,
  },
  { id: "products", match: /\b(productos?|muebles?|catalogo)\b/ },
];

const STOP_WORDS = new Set(
  "a al algo alguna algun ando buscando busco como con cual de del el en es esta estoy favor hay hola la las lo los me mi necesito o para por que quiero quisiera se si su sus tengo tiene tienen tito un una unas unos venden y".split(
    " ",
  ),
);

const MAX_SEARCH = 60;

/** Minúsculas y sin tildes. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Lo que queda para buscar en el catálogo. */
export function searchTerms(text: string): string {
  return (normalize(text).match(/[a-z0-9]+/g) ?? [])
    .filter((word) => !STOP_WORDS.has(word))
    .join(" ")
    .slice(0, MAX_SEARCH)
    .trim();
}

/** Respuesta a un texto libre. */
export function answerTo(text: string, contact: ContactInfo): Answer {
  const clean = normalize(text);
  const terms = searchTerms(text);
  const search = { label: `Buscar «${terms}»`, href: `/catalogo?q=${encodeURIComponent(terms)}` };

  const topic = TOPICS.find((t) => t.match.test(clean));
  const category = CATEGORIES.find((c) => c.match.test(clean));
  if (category && (!topic || topic.id === "products")) {
    return {
      text: "¡Tengo justo lo que buscas! Mira por aquí:",
      links: [{ label: category.label, href: category.href }, ...(terms ? [search] : [])],
    };
  }
  if (topic) return topicAnswer(topic.id, contact);
  if (/\bgracias\b/.test(clean))
    return { text: "¡De nada! Aquí estaré si me necesitas.", links: [] };
  if (!terms) {
    if (/\b(hola|buenas)\b/.test(clean)) return { text: GREETING, links: [] };
    return {
      text: "No te entendí bien. Prueba con una palabra, como «mesa» o «despacho», o mira el catálogo.",
      links: [{ label: "Ver catálogo", href: "/catalogo" }, REQUEST_FORM],
    };
  }
  return {
    text: "No estoy seguro, pero puedo buscarlo en el catálogo. Si no lo encuentras, pregúntale al equipo.",
    links: [search, REQUEST_FORM],
  };
}

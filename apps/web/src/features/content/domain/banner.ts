/**
 * Banners de la tienda (RF-28). Dominio puro.
 *
 * Un banner es un mensaje destacado con un enlace a una página de la propia
 * tienda. El destino solo puede ser una ruta interna: nada de http:,
 * javascript: ni rutas "//dominio" que el navegador trata como externas.
 */

export interface Banner {
  id: string;
  title: string;
  text: string;
  /** Ruta interna, p. ej. "/catalogo?categoria=junji". */
  href: string;
  /** Orden de aparición: 1 primero. Puede repetirse (se desempata por título). */
  order: number;
  active: boolean;
}

export type BannerDraft = Omit<Banner, "id">;

/** Datos del formulario tal como llegan (texto), antes de validar. */
export interface BannerInput {
  title: string;
  text: string;
  href: string;
  order: string;
  active: boolean;
}

export type FieldErrors = Partial<Record<string, string>>;

export const TITLE_MAX = 60;
export const TEXT_MAX = 140;
export const HREF_MAX = 200;
export const ORDER_MIN = 1;
export const ORDER_MAX = 99;

/** Destino usado cuando un enlace guardado no es seguro (como safeLink de la maqueta). */
export const FALLBACK_HREF = "/catalogo";

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Ruta interna de la tienda: empieza con "/" pero no con "//" (que sería otro
 * dominio), sin barras invertidas, espacios ni caracteres de control. Así se
 * descartan http:, javascript:, data: y similares.
 */
export function isInternalHref(href: string): boolean {
  if (href.length === 0 || href.length > HREF_MAX) return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (href.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\s\u0000-\u001f\u007f]/.test(href);
}

/** El destino si es interno; si no, el catálogo. Para no renderizar un enlace inseguro. */
export function safeBannerHref(href: string): string {
  return isInternalHref(href) ? href : FALLBACK_HREF;
}

export function validateBanner(
  input: BannerInput,
): { ok: true; draft: BannerDraft } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const title = squash(input.title);
  const text = squash(input.text);
  const href = input.href.trim();
  const orderText = input.order.trim();
  const order = /^\d+$/.test(orderText) ? Number(orderText) : null;

  if (title === "") errors.title = "Escribe el título del banner.";
  else if (title.length > TITLE_MAX) errors.title = `Usa ${TITLE_MAX} caracteres o menos.`;

  if (text === "") errors.text = "Escribe el texto de apoyo.";
  else if (text.length > TEXT_MAX) errors.text = `Usa ${TEXT_MAX} caracteres o menos.`;

  if (href === "") errors.href = "Escribe el destino, por ejemplo /catalogo.";
  else if (!isInternalHref(href)) {
    errors.href =
      "El destino debe ser una página de la tienda que empiece con «/» (p. ej. /catalogo). No se permiten enlaces externos.";
  }

  if (order === null || order < ORDER_MIN || order > ORDER_MAX) {
    errors.order = `El orden debe ser un número entero entre ${ORDER_MIN} y ${ORDER_MAX}.`;
  }

  if (Object.keys(errors).length > 0 || order === null) return { ok: false, errors };
  return { ok: true, draft: { title, text, href, order, active: input.active } };
}

/** Por orden de aparición y luego por título. */
export function sortBanners(banners: readonly Banner[]): Banner[] {
  return [...banners].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "es"));
}

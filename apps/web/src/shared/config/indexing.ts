import type { Route } from "next";

import { categoryNav } from "./routes";

/**
 * Qué se indexa (RNF-10). Las páginas públicas van al sitemap; carrito,
 * checkout, seguimiento de pedidos, baja del newsletter, panel y rutas internas
 * quedan fuera de los buscadores (además llevan `robots: noindex` en su metadata).
 */

/** Páginas públicas fijas del sitemap, con su prioridad relativa. */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/catalogo", priority: 0.9 },
  { path: "/servicios", priority: 0.7 },
  { path: "/servicios/solicitar", priority: 0.5 },
  { path: "/suscripcion", priority: 0.3 },
  { path: "/politicas", priority: 0.3 },
] as const satisfies readonly { path: Route; priority: number }[];

/** Rutas que no se rastrean. */
export const NOINDEX_PATHS = [
  "/carrito",
  "/checkout",
  "/seguimiento",
  "/suscripcion/baja",
  "/admin",
  "/api",
  "/dev",
] as const;

/** Catálogo por categoría (las del encabezado), como URLs del sitemap. */
export function categoryPaths(): `/${string}`[] {
  return categoryNav
    .map((item) => item.href as string)
    .filter((href) => href.startsWith("/catalogo?categoria="))
    .map((href) => href as `/${string}`);
}

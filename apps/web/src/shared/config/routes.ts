import type { Route } from "next";

export interface NavItem {
  href: Route;
  label: string;
}

/** Color de cada píldora de categoría (ver StoreHeader). */
export type CategoryTone =
  "blue" | "purple" | "green" | "yellow" | "red" | "navy" | "outline" | "offer";

export interface CategoryNavItem extends NavItem {
  tone: CategoryTone;
  icon?: "star";
}

/**
 * Categorías del encabezado. Provisional: cuando exista la API, las categorías
 * vendrán del catálogo administrable (RF-26) y estos enlaces apuntarán a sus slugs.
 */
export const categoryNav = [
  { href: "/catalogo?categoria=cunas", label: "Cunas y camas", tone: "purple" },
  { href: "/catalogo?categoria=mesas", label: "Mesas", tone: "blue" },
  { href: "/catalogo?categoria=sillas", label: "Sillas", tone: "red" },
  { href: "/catalogo?categoria=mudadores", label: "Mudadores", tone: "green" },
  { href: "/catalogo?categoria=almacenamiento", label: "Almacenamiento", tone: "yellow" },
  { href: "/catalogo?categoria=montessori-pikler", label: "Montessori y Pikler", tone: "navy" },
  { href: "/catalogo?categoria=junji", label: "Línea JUNJI", tone: "outline" },
  { href: "/servicios", label: "Servicios especiales", tone: "green", icon: "star" },
  { href: "/catalogo?ofertas=1", label: "Ofertas", tone: "offer" },
] as const satisfies readonly CategoryNavItem[];

/** Columna "Categorías" del pie de página. */
export const footerCategoryNav = [
  { href: "/catalogo?categoria=cunas", label: "Cunas y camas" },
  { href: "/catalogo?categoria=mesas", label: "Mesas" },
  { href: "/catalogo?categoria=sillas", label: "Sillas" },
  { href: "/catalogo?categoria=mudadores", label: "Mudadores" },
  { href: "/catalogo?categoria=almacenamiento", label: "Almacenamiento" },
  { href: "/catalogo?categoria=montessori-pikler", label: "Montessori y Pikler" },
] as const satisfies readonly NavItem[];

/** Columna "Ayuda" del pie de página. */
export const footerHelpNav = [
  { href: "/politicas#despacho", label: "Despachos y retiro" },
  { href: "/politicas#compra", label: "Medios de pago" },
  { href: "/politicas#cambios", label: "Cambios y garantía" },
  { href: "/servicios", label: "Guía de armado" },
  { href: "/politicas", label: "Preguntas frecuentes" },
] as const satisfies readonly NavItem[];

/** Grupos del menú lateral del panel, en el orden de la maqueta. */
export const ADMIN_NAV_GROUPS = ["Principal", "Tienda", "Relaciones", "Administración"] as const;
export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];

/** Ícono de cada enlace del panel (AdminShell lo traduce al componente). */
export type AdminNavIcon =
  | "grid"
  | "bag"
  | "card"
  | "box"
  | "tag"
  | "truck"
  | "image"
  | "mail"
  | "users"
  | "chart"
  | "clock";

export interface AdminNavItem extends NavItem {
  group: AdminNavGroup;
  icon: AdminNavIcon;
  /**
   * Sección del panel. Qué rol la ve lo decide features/users (canAccessSection);
   * el layout filtra antes de entregar el menú a AdminShell.
   */
  section: string;
}

/** Menú lateral del panel administrativo (todas las secciones, sin filtrar por rol). */
export const adminNav = [
  { href: "/admin", label: "Resumen", group: "Principal", icon: "grid", section: "resumen" },
  { href: "/admin/pedidos", label: "Pedidos", group: "Principal", icon: "bag", section: "pedidos" },
  {
    href: "/admin/pagos",
    label: "Pagos y conciliación",
    group: "Principal",
    icon: "card",
    section: "pagos",
  },
  {
    href: "/admin/productos",
    label: "Productos",
    group: "Tienda",
    icon: "box",
    section: "productos",
  },
  {
    href: "/admin/categorias",
    label: "Categorías",
    group: "Tienda",
    icon: "grid",
    section: "categorias",
  },
  {
    href: "/admin/inventario",
    label: "Inventario",
    group: "Tienda",
    icon: "box",
    section: "inventario",
  },
  { href: "/admin/cupones", label: "Cupones", group: "Tienda", icon: "tag", section: "cupones" },
  {
    href: "/admin/despacho",
    label: "Despacho y retiro",
    group: "Tienda",
    icon: "truck",
    section: "despacho",
  },
  { href: "/admin/banners", label: "Banners", group: "Tienda", icon: "image", section: "banners" },
  {
    href: "/admin/solicitudes",
    label: "Solicitudes",
    group: "Relaciones",
    icon: "mail",
    section: "solicitudes",
  },
  {
    href: "/admin/suscriptores",
    label: "Suscriptores",
    group: "Relaciones",
    icon: "users",
    section: "suscriptores",
  },
  {
    href: "/admin/correos",
    label: "Correos",
    group: "Relaciones",
    icon: "mail",
    section: "correos",
  },
  {
    href: "/admin/reportes",
    label: "Reportes",
    group: "Administración",
    icon: "chart",
    section: "reportes",
  },
  {
    href: "/admin/usuarios",
    label: "Usuarios y roles",
    group: "Administración",
    icon: "users",
    section: "usuarios",
  },
  {
    href: "/admin/actividad",
    label: "Historial de actividad",
    group: "Administración",
    icon: "clock",
    section: "actividad",
  },
] as const satisfies readonly AdminNavItem[];

/**
 * ¿El enlace del menú corresponde a la página actual? El resumen solo en /admin;
 * el resto también en sus subrutas (/admin/pedidos/[id], /admin/productos/nuevo).
 */
export function isActiveAdminHref(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname === "/admin/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

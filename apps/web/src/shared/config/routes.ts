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

/** Menú lateral del panel administrativo. */
export const adminNav = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/pagos", label: "Pagos y conciliación" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/cupones", label: "Cupones" },
  { href: "/admin/despacho", label: "Despacho y retiro" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/suscriptores", label: "Suscriptores" },
  { href: "/admin/correos", label: "Correos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/usuarios", label: "Usuarios y roles" },
  { href: "/admin/actividad", label: "Historial de actividad" },
] as const satisfies readonly NavItem[];

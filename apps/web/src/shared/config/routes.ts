import type { Route } from "next";

export interface NavItem {
  href: Route;
  label: string;
}

/** Navegación principal de la tienda. */
export const storeNav = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/servicios", label: "Servicios" },
] as const satisfies readonly NavItem[];

/** Enlaces del pie de página de la tienda. */
export const storeFooterNav = [
  { href: "/politicas", label: "Políticas" },
  { href: "/suscripcion", label: "Suscripción" },
] as const satisfies readonly NavItem[];

/** Navegación del área de cuenta del comprador. */
export const accountNav = [
  { href: "/ingresar", label: "Iniciar sesión" },
  { href: "/cuenta/pedidos", label: "Mis pedidos" },
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

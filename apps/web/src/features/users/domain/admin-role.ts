/**
 * Roles internos del panel y qué secciones ve cada uno (SRS 2.3, RF-31, CA-07).
 * Dominio puro: sin React, Next.js ni acceso a red.
 *
 * Esto decide qué se muestra en la interfaz. La autorización real la aplica el
 * backend en cada operación (RF-31); llega con la autenticación (LN-04).
 */
export const ADMIN_ROLES = ["admin", "operator"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  admin: "Administrador",
  operator: "Operador",
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Las 15 secciones del panel, en el orden del menú de la maqueta. */
export const ADMIN_SECTIONS = [
  "resumen",
  "pedidos",
  "pagos",
  "productos",
  "categorias",
  "inventario",
  "cupones",
  "despacho",
  "banners",
  "solicitudes",
  "suscriptores",
  "correos",
  "reportes",
  "usuarios",
  "actividad",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/**
 * El operador consulta y gestiona pedidos y solicitudes, sin catálogo,
 * configuración ni usuarios (SRS 2.3). El detalle de pedido es parte de "pedidos".
 */
export const OPERATOR_SECTIONS: readonly AdminSection[] = [
  "resumen",
  "pedidos",
  "pagos",
  "solicitudes",
  "correos",
  "reportes",
];

export function canAccessSection(role: AdminRole, section: AdminSection): boolean {
  return role === "admin" || OPERATOR_SECTIONS.includes(section);
}

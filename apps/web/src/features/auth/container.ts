// Raíz de composición de "auth": conecta los puertos con sus adaptadores.
// Solo el equipo del taller ingresa (panel /admin). Los compradores no tienen
// cuenta: compran como invitados y consultan su pedido con número y correo.
import type { AdminAuthGateway, AdminSessionReader } from "./application/admin-session";
import { apiAdminAuth, apiAdminSession } from "./infrastructure/api-admin-session";

const session: AdminSessionReader = apiAdminSession;

export const adminAuth: AdminAuthGateway = apiAdminAuth;

/**
 * Sesión actual del panel, o null si nadie ingresó o venció. Lanza
 * PanelApiError("unavailable") si la API no responde.
 */
export function getAdminSession() {
  return session.read();
}

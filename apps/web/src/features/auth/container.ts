// Raíz de composición de "auth": conecta los puertos con sus adaptadores actuales.
import type { AdminRole } from "@/features/users";

import type { AdminSessionReader, AdminSessionWriter } from "./application/admin-session";
import { demoAdminSession } from "./infrastructure/demo-admin-session";

// DEMO (ver infrastructure/demo-admin-session.ts). En LN-04 se cambia solo esta línea.
const session: AdminSessionReader & AdminSessionWriter = demoAdminSession;

/** Sesión actual del panel, o null si nadie ingresó. */
export function getAdminSession() {
  return session.read();
}

export function startAdminSession(role: AdminRole) {
  return session.start(role);
}

export function endAdminSession() {
  return session.end();
}

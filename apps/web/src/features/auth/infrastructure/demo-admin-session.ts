import "server-only";

import { cookies } from "next/headers";

import { isAdminRole } from "@/features/users";

import type { AdminSessionReader, AdminSessionWriter } from "../application/admin-session";

/**
 * ─── SESIÓN DE DEMOSTRACIÓN: SIN SEGURIDAD REAL ───────────────────────────────
 * La cookie solo guarda el rol elegido en /admin/ingresar ("admin" | "operator").
 * No hay contraseña, firma ni verificación: cualquiera puede escribirla y elegir
 * su rol. Sirve para recorrer el panel con datos de demostración.
 *
 * Se reemplaza en LN-04 por la autenticación real (RNF-01: cookies HttpOnly,
 * Secure, expiración y revocación; permisos aplicados en el backend, RF-31).
 * Solo cambia este adaptador: el resto usa los puertos de application/.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export const DEMO_ROLE_COOKIE = "tk_demo_rol";

export const demoAdminSession: AdminSessionReader & AdminSessionWriter = {
  async read() {
    const value = (await cookies()).get(DEMO_ROLE_COOKIE)?.value;
    return isAdminRole(value) ? { role: value } : null;
  },
  async start(role) {
    (await cookies()).set(DEMO_ROLE_COOKIE, role, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Sin maxAge: cookie de sesión, se borra al cerrar el navegador.
    });
  },
  async end() {
    (await cookies()).delete(DEMO_ROLE_COOKIE);
  },
};

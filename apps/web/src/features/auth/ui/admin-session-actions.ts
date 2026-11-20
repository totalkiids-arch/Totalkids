"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ADMIN_ROLES } from "@/features/users";

import { endAdminSession, startAdminSession } from "../container";

const SignInForm = z.object({ rol: z.enum(ADMIN_ROLES) });

/**
 * Ingreso de DEMOSTRACIÓN: guarda el rol elegido y entra al panel. No valida
 * credenciales (el formulario no envía correo ni contraseña). Se reemplaza en LN-04.
 */
export async function signInDemoAction(formData: FormData) {
  const parsed = SignInForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/ingresar");
  await startAdminSession(parsed.data.rol);
  redirect("/admin");
}

/** Cierra la sesión de demostración y vuelve al ingreso. */
export async function signOutDemoAction() {
  await endAdminSession();
  redirect("/admin/ingresar");
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { adminAuth } from "../container";
import { checkNewPassword, PASSWORD_MAX_LENGTH } from "../domain/password-policy";

/*
 * Ingreso, salida y recuperación de contraseña del panel. Las llamadas a la API
 * las hace el servidor de Next (features/auth/infrastructure): el navegador
 * nunca habla con la API. Los formularios funcionan sin JavaScript
 * (useActionState + redirect).
 */

const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";

const text = (max: number) => z.string().max(max);

export interface FormState {
  /** Mensaje general (credenciales, espera por intentos, API caída…). */
  message?: string;
  fieldErrors: Record<string, string>;
}

// ── Ingreso ────────────────────────────────────────────────────────────────

export interface SignInState extends FormState {
  email: string;
}

const SignInForm = z.object({ email: text(254), password: text(1024) });

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = SignInForm.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { email: "", message: UNREADABLE, fieldErrors: {} };

  const email = parsed.data.email.trim();
  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Ingresa tu correo";
  if (!parsed.data.password) fieldErrors.password = "Ingresa tu contraseña";
  if (Object.keys(fieldErrors).length > 0) return { email, fieldErrors };

  const result = await adminAuth.signIn(email, parsed.data.password);
  if (!result.ok) return { email, message: result.message, fieldErrors: result.fieldErrors };
  redirect("/admin");
}

/** Cierra la sesión (la API la revoca y borra la cookie) y vuelve al ingreso. */
export async function signOutAction() {
  await adminAuth.signOut();
  redirect("/admin/ingresar");
}

// ── Recuperación: pedir el enlace ─────────────────────────────────────────

export interface RequestResetState extends FormState {
  email: string;
  sent: boolean;
}

export async function requestResetAction(
  _previous: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const parsed = text(254).safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { email: "", sent: false, message: UNREADABLE, fieldErrors: {} };
  const email = parsed.data.trim();
  if (!email) return { email, sent: false, fieldErrors: { email: "Ingresa tu correo" } };

  const result = await adminAuth.requestPasswordReset(email);
  if (!result.ok)
    return { email, sent: false, message: result.message, fieldErrors: result.fieldErrors };
  // La API responde igual exista o no la cuenta: no se revela qué correos existen.
  return { email, sent: true, fieldErrors: {} };
}

// ── Definir contraseña (invitación o recuperación) ────────────────────────

export interface ResetPasswordState extends FormState {
  /** El enlace no sirve: se ofrece pedir otro. */
  invalidToken: boolean;
}

const ResetForm = z.object({
  token: text(200),
  password: text(PASSWORD_MAX_LENGTH * 4),
  confirmation: text(PASSWORD_MAX_LENGTH * 4),
});

export async function resetPasswordAction(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetForm.safeParse({
    token: formData.get("token") ?? "",
    password: formData.get("password") ?? "",
    confirmation: formData.get("confirmation") ?? "",
  });
  if (!parsed.success) return { invalidToken: false, message: UNREADABLE, fieldErrors: {} };

  const { token, password, confirmation } = parsed.data;
  const errors = checkNewPassword(password, confirmation);
  if (errors.password || errors.confirmation)
    return { invalidToken: false, fieldErrors: { ...errors } as Record<string, string> };

  const result = await adminAuth.resetPassword(token, password);
  if (!result.ok)
    return {
      invalidToken: result.invalidToken ?? false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  redirect("/admin/ingresar?aviso=contrasena");
}

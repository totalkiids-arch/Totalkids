import type { AdminRole } from "@/features/users";

/** Cuenta interna del equipo del taller que usa el panel. */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

/** Quién está usando el panel. El rol se lee de la API en cada petición. */
export interface AdminSession {
  user: AdminUser;
  role: AdminRole;
  /** Vencimiento absoluto (ISO); antes vence si pasan 2 h sin uso. */
  expiresAt: string;
}

/**
 * Puerto: lee la sesión del panel en el servidor. null = sin sesión (o vencida).
 * Lanza PanelApiError("unavailable") si la API no responde: no es lo mismo que
 * no tener sesión, y el panel lo muestra como un aviso.
 */
export interface AdminSessionReader {
  read(): Promise<AdminSession | null>;
}

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      /** Mensaje general para el formulario. */
      message: string;
      /** Errores por campo (email, password, token…). */
      fieldErrors: Record<string, string>;
      /** El enlace de restablecimiento no sirve (inválido, usado o vencido). */
      invalidToken?: boolean;
    };

/**
 * Puerto: ingreso, salida y recuperación de contraseña del equipo. Solo desde
 * Server Actions (escriben las cookies de sesión y CSRF en el navegador).
 */
export interface AdminAuthGateway {
  signIn(email: string, password: string): Promise<AuthResult>;
  /** Revoca la sesión en la API y borra la cookie. No falla si la API no responde. */
  signOut(): Promise<void>;
  /** La API responde igual exista o no la cuenta. */
  requestPasswordReset(email: string): Promise<AuthResult>;
  /** Sirve para la invitación de una cuenta nueva y para la recuperación. */
  resetPassword(token: string, password: string): Promise<AuthResult>;
}

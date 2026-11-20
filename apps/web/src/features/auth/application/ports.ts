import type { Buyer } from "../domain/session";

/**
 * Puerto: cuentas de compradores (RF-22). Con la API (LN-04): contraseñas con
 * hash, recuperación con token de un solo uso y vencimiento.
 */
export interface AccountGateway {
  /** null si el correo o la contraseña no coinciden (sin decir cuál). */
  login(email: string, password: string): Promise<Buyer | null>;
  register(name: string, email: string, password: string): Promise<Buyer>;
  /** Siempre responde igual, exista o no la cuenta (no revela quién está registrado). */
  requestRecovery(email: string): Promise<void>;
  /** false si el enlace venció o ya se usó. */
  resetPassword(token: string, password: string): Promise<boolean>;
}

/** Puerto: sesión del comprador en este navegador. */
export interface SessionStore {
  read(): Promise<Buyer | null>;
  write(buyer: Buyer): Promise<void>;
  clear(): Promise<void>;
}

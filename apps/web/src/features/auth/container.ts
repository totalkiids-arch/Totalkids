// Raíz de composición de "auth": conecta los puertos con sus adaptadores actuales.
import type { AccountGateway, SessionStore } from "./application/ports";
import {
  parseLogin,
  parsePasswordReset,
  parseRecovery,
  parseRegistration,
  type AuthErrors,
  type AuthInput,
} from "./domain/credentials";
import type { Buyer } from "./domain/session";
import { cookieSessionStore } from "./infrastructure/cookie-session-store";
import { DEMO_ACCOUNT, demoAccountGateway } from "./infrastructure/demo-account-gateway";

const accounts: AccountGateway = demoAccountGateway;
const sessions: SessionStore = cookieSessionStore;

/** Correo de la cuenta de ejemplo que tiene pedidos (lo muestra la pantalla de ingreso). */
export const DEMO_ACCOUNT_EMAIL = DEMO_ACCOUNT.email;

export type AuthResult = { ok: true } | { ok: false; errors: AuthErrors; message?: string };

/** Caso de uso: comprador con sesión iniciada, o null. */
export async function getCurrentBuyer(): Promise<Buyer | null> {
  return sessions.read();
}

/** Caso de uso: ingresar (RF-22). */
export async function login(input: AuthInput): Promise<AuthResult> {
  const parsed = parseLogin(input);
  if (!parsed.ok) return parsed;
  const buyer = await accounts.login(parsed.data.email, parsed.data.password);
  if (!buyer) {
    return { ok: false, errors: {}, message: "El correo o la contraseña no coinciden." };
  }
  await sessions.write(buyer);
  return { ok: true };
}

/** Caso de uso: crear cuenta e iniciar sesión (RF-22). */
export async function register(input: AuthInput): Promise<AuthResult> {
  const parsed = parseRegistration(input);
  if (!parsed.ok) return parsed;
  const { name, email, password } = parsed.data;
  await sessions.write(await accounts.register(name, email, password));
  return { ok: true };
}

/** Caso de uso: pedir el enlace de recuperación. Responde igual exista o no la cuenta. */
export async function requestRecovery(input: AuthInput): Promise<AuthResult> {
  const parsed = parseRecovery(input);
  if (!parsed.ok) return parsed;
  await accounts.requestRecovery(parsed.data.email);
  return { ok: true };
}

/** Caso de uso: elegir una nueva contraseña con el enlace recibido. */
export async function resetPassword(input: AuthInput): Promise<AuthResult> {
  const parsed = parsePasswordReset(input);
  if (!parsed.ok) return parsed;
  const done = await accounts.resetPassword(parsed.data.token, parsed.data.password);
  return done
    ? { ok: true }
    : { ok: false, errors: {}, message: "El enlace venció o ya se usó. Pide uno nuevo." };
}

/** Caso de uso: cerrar sesión. */
export async function logout() {
  await sessions.clear();
}

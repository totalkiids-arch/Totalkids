import { z } from "zod";

/**
 * Comprador con sesión iniciada (RF-22). Dominio puro.
 *
 * Provisional: hasta LN-04 la sesión es de DEMOSTRACIÓN y solo guarda nombre y
 * correo en una cookie httpOnly. No es una barrera de seguridad: con la API,
 * la cookie llevará un id de sesión opaco y revocable.
 */
export interface Buyer {
  name: string;
  email: string;
}

export const SESSION_COOKIE = "tk_demo_cuenta";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

const Stored = z.object({
  v: z.literal(1),
  n: z.string().min(1).max(120),
  e: z.email().max(254),
});

export function serializeSession(buyer: Buyer): string {
  return JSON.stringify({ v: 1, n: buyer.name, e: buyer.email });
}

/** Lee la cookie. Un formato irreconocible es "sin sesión". */
export function parseSession(raw: string | undefined): Buyer | null {
  if (!raw) return null;
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success ? { name: parsed.data.n, email: parsed.data.e } : null;
  } catch {
    return null;
  }
}

/** Primer nombre para el saludo ("Hola, Camila"). */
export function firstName(buyer: Buyer): string {
  return buyer.name.trim().split(/\s+/)[0] || buyer.name;
}

/** Nombre de cortesía a partir del correo ("camila.gonzalez@…" → "Camila"). */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0]?.split(/[._+-]/)[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Comprador";
}

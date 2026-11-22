import argon2 from "argon2";
import { z } from "zod";

/**
 * Contraseñas del equipo del panel (RNF-01). argon2id con los parámetros
 * mínimos recomendados por OWASP (19 MiB, 2 iteraciones, 1 hilo).
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Política de contraseñas: largo mínimo y máximo, sin reglas de composición (NIST 800-63B). */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`)
  .refine((value) => value.trim().length > 0, "La contraseña no puede ser solo espacios");

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** true si la contraseña corresponde al hash. Un hash mal formado cuenta como no válido. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** true si el hash usa parámetros más débiles que los actuales (se rehace al ingresar). */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Verifica contra un hash de relleno. Se usa cuando el correo no existe, para que
 * la respuesta tarde lo mismo y no revele qué cuentas existen.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("contraseña-de-relleno-que-nunca-coincide");
  await verifyPassword(await dummyHash, password);
}

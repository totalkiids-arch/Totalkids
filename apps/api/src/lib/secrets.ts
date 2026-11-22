import { createHash, randomBytes } from "node:crypto";

/** Bytes de entropía de los tokens opacos (sesión, recuperación). 32 bytes = 256 bits. */
const TOKEN_BYTES = 32;

/** Formato de un token opaco: 32 bytes en base64url (43 caracteres). */
export const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Token opaco no adivinable. Viaja al navegador (cookie) o por correo (enlace);
 * en la base solo se guarda su hash (`hashToken`).
 */
export function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256 en hex del token. Basta un hash rápido: el token ya tiene 256 bits de
 * entropía, así que no se puede adivinar a partir del hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

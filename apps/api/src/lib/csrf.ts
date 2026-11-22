import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tokens CSRF de doble envío firmado (RNF-04), sin estado en el servidor:
 *
 *   token = base64url(nonce de 32 bytes) + "." + base64url(HMAC-SHA256(secret, "v1|nonce|sesión"))
 *
 * El mismo valor viaja en la cookie (HttpOnly) y en la cabecera X-CSRF-Token.
 * La firma impide fabricar tokens válidos o inyectar una cookie propia, y la
 * clave de sesión ata el token a la sesión del panel o del carrito.
 */
export const CSRF_HEADER = "x-csrf-token";
export const CSRF_COOKIE_DEV = "tk_csrf";
/** En producción el prefijo __Host- obliga a Secure, Path=/ y sin Domain. */
export const CSRF_COOKIE_PROD = "__Host-tk_csrf";

const VERSION = "v1";
const NONCE_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;

export function csrfCookieName(isProduction: boolean): string {
  return isProduction ? CSRF_COOKIE_PROD : CSRF_COOKIE_DEV;
}

function sign(secret: string, nonce: string, sessionKey: string): string {
  return createHmac("sha256", secret)
    .update(`${VERSION}|${nonce}|${sessionKey}`)
    .digest("base64url");
}

/** Comparación en tiempo constante de dos cadenas (false si difieren en largo). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueCsrfToken(secret: string, sessionKey = ""): string {
  const nonce = randomBytes(NONCE_BYTES).toString("base64url");
  return `${nonce}.${sign(secret, nonce, sessionKey)}`;
}

export function verifyCsrfToken(secret: string, token: string, sessionKey = ""): boolean {
  if (!TOKEN_PATTERN.test(token)) return false;
  const [nonce = "", signature = ""] = token.split(".");
  return safeEqual(signature, sign(secret, nonce, sessionKey));
}

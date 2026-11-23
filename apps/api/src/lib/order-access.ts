import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Credencial de acceso a un pedido de invitado (RF-36, cabecera X-Order-Access).
 *
 * No hay cuentas de comprador: quien tiene esta credencial puede ver el pedido
 * y pagarlo. Es un HMAC-SHA256 del id del pedido con una clave del servidor
 * (derivada del secreto de la API), así que:
 * - no se puede adivinar ni fabricar sin el secreto;
 * - no se guarda en la base (no hay nada que filtrar) y se puede volver a
 *   entregar en la consulta por número y correo;
 * - si se rota el secreto, las credenciales anteriores dejan de servir.
 */

const LABEL = "tk-order-access-v1";

function accessKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(LABEL).digest();
}

/** Credencial del pedido (43 caracteres base64url). */
export function issueOrderAccess(secret: string, orderId: string): string {
  return createHmac("sha256", accessKey(secret)).update(orderId).digest("base64url");
}

/** ¿La credencial corresponde a este pedido? Comparación en tiempo constante. */
export function verifyOrderAccess(secret: string, orderId: string, credential: string): boolean {
  const expected = Buffer.from(issueOrderAccess(secret, orderId));
  const given = Buffer.from(credential);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

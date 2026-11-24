import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/** Cifrado de la URL de pago guardada en la base (AES-256-GCM, clave derivada). */
const key = (secret: string) => createHmac("sha256", secret).update("tk-flow-redirect-v1").digest();

export function seal(text: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** null si fue alterado o se cifró con otra clave. */
export function unseal(sealed: string, secret: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12), {
      authTagLength: 16,
    });
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

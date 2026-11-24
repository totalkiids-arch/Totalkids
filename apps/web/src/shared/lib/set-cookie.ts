/**
 * Lee una cabecera Set-Cookie de la API para reenviarla al navegador desde
 * Next.js (cookies().set). Puro: sin Next.js, para poder probarlo.
 *
 * Solo entiende los atributos que usa la API (Path, Max-Age, Expires, HttpOnly,
 * Secure, SameSite, Domain). Un par mal formado devuelve null.
 */
export interface ParsedSetCookie {
  name: string;
  value: string;
  options: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
}

export function parseSetCookie(header: string): ParsedSetCookie | null {
  const [pair = "", ...attributes] = header.split(";");
  const index = pair.indexOf("=");
  if (index <= 0) return null;
  const name = pair.slice(0, index).trim();
  if (!name) return null;

  let value = pair.slice(index + 1).trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Se deja el valor tal cual: la API no codifica sus tokens (base64url).
  }

  const options: ParsedSetCookie["options"] = {};
  for (const attribute of attributes) {
    const separator = attribute.indexOf("=");
    const key = (separator === -1 ? attribute : attribute.slice(0, separator)).trim().toLowerCase();
    const raw = separator === -1 ? "" : attribute.slice(separator + 1).trim();
    switch (key) {
      case "path":
        options.path = raw;
        break;
      case "domain":
        options.domain = raw;
        break;
      case "max-age": {
        const seconds = Number(raw);
        if (Number.isInteger(seconds)) options.maxAge = seconds;
        break;
      }
      case "expires": {
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime())) options.expires = date;
        break;
      }
      case "httponly":
        options.httpOnly = true;
        break;
      case "secure":
        options.secure = true;
        break;
      case "samesite": {
        const mode = raw.toLowerCase();
        if (mode === "lax" || mode === "strict" || mode === "none") options.sameSite = mode;
        break;
      }
    }
  }
  return { name, value, options };
}

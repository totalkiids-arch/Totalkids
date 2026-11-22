/**
 * Lee la cabecera Cookie sin dependencias. Next.js reenvía las cookies del
 * navegador a la API; aquí solo se leen (la API no confía en ninguna sin validarla).
 * Ignora pares mal formados y conserva la primera aparición de cada nombre.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in cookies) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

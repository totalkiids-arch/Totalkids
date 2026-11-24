import { z } from "zod";

/**
 * URL pública del sitio (NEXT_PUBLIC_SITE_URL), sin barra final. Es la base de
 * las URLs canónicas, el sitemap y Open Graph (RNF-10). Es pública: puede verse
 * en el navegador.
 */
export const siteUrl = z
  .url()
  .default("http://localhost:3000")
  .transform((url) => url.replace(/\/+$/, ""))
  .parse(process.env.NEXT_PUBLIC_SITE_URL || undefined);

/** URL absoluta de una ruta del sitio. */
export function absoluteUrl(path: `/${string}`): string {
  return `${siteUrl}${path}`;
}

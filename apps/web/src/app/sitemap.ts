import type { MetadataRoute } from "next";

import { listProductSlugs } from "@/features/catalog";
import { categoryPaths, PUBLIC_PAGES } from "@/shared/config/indexing";
import { absoluteUrl } from "@/shared/config/site-url";

/**
 * Sitemap de las páginas públicas activas (RNF-10): portada, catálogo y sus
 * categorías, fichas publicadas, servicios, suscripción y políticas. Carrito,
 * checkout, seguimiento y panel no se incluyen.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listProductSlugs();
  return [
    ...PUBLIC_PAGES.map(({ path, priority }) => ({ url: absoluteUrl(path), priority })),
    ...categoryPaths().map((path) => ({ url: absoluteUrl(path), priority: 0.8 })),
    ...slugs.map((slug) => ({ url: absoluteUrl(`/producto/${slug}`), priority: 0.6 })),
  ];
}

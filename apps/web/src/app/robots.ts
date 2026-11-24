import type { MetadataRoute } from "next";

import { NOINDEX_PATHS } from "@/shared/config/indexing";
import { absoluteUrl } from "@/shared/config/site-url";

/** robots.txt (RNF-10): carrito, checkout, seguimiento y panel fuera del rastreo. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...NOINDEX_PATHS] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

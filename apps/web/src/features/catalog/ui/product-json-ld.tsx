import { site } from "@/shared/config/site";

import type { ProductDetail } from "../domain/product-detail";

/**
 * Datos estructurados schema.org/Product (RNF-10). Las ofertas se publican solo
 * cuando hay precio: un marcador "[PRECIO]" no debe llegar a los buscadores.
 */
export function ProductJsonLd({ product }: { product: ProductDetail }) {
  const offers = product.variants
    .filter((v) => v.price !== null)
    .map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      price: v.price,
      priceCurrency: "CLP",
      availability:
        v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    }));

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    category: product.category,
    brand: { "@type": "Brand", name: site.name },
    sku: product.variants[0]?.sku,
    ...(offers.length > 0 ? { offers } : {}),
  };

  return (
    <script
      type="application/ld+json"
      // Escapa "<" para que ningún texto pueda cerrar la etiqueta <script>.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

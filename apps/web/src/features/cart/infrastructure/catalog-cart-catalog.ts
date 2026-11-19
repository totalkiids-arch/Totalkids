import { getProductDetail } from "@/features/catalog";

import type { CartCatalog } from "../application/ports";

/** Resuelve las líneas contra el catálogo vigente (feature catalog). */
export const catalogCartCatalog: CartCatalog = {
  async findVariant(slug, sku) {
    const product = await getProductDetail(slug);
    const variant = product?.variants.find((v) => v.sku === sku);
    if (!product || !variant) return null;
    return {
      slug: product.slug,
      name: product.name,
      image: product.image,
      sku: variant.sku,
      option: variant.option,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      available: variant.available,
      extras: product.extras.map((e) => ({
        id: e.id,
        label: e.label,
        price: e.price,
        personalization: e.personalization
          ? { label: e.personalization.label, maxLength: e.personalization.maxLength }
          : null,
      })),
    };
  },
};

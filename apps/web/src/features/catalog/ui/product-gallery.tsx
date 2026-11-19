"use client";

import { useState } from "react";

import type { ProductBadgeTone } from "../domain/product";
import type { ProductDetail } from "../domain/product-detail";
import { ProductPhoto } from "./product-photo";

const BADGE_TONE: Record<ProductBadgeTone, string> = {
  sale: "bg-brand-red text-white",
  line: "bg-brand-navy text-white",
  new: "bg-brand-green text-white",
  top: "bg-brand-blue text-white",
};

type ProductGalleryProps = {
  product: Pick<ProductDetail, "badge" | "categories" | "images">;
};

/** Foto principal y miniaturas para cambiarla. Con una sola foto no hay miniaturas. */
export function ProductGallery({ product }: ProductGalleryProps) {
  const [index, setIndex] = useState(0);
  const image = product.images[index] ?? null;
  const showJunji = product.categories.includes("junji");

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-[28px] border-2 border-border bg-surface p-4 sm:rounded-[36px] sm:p-6">
        {product.badge ? (
          <span
            className={`absolute top-5 left-5 z-10 -rotate-4 rounded-full px-3.5 py-1.5 text-[13px] font-extrabold ${BADGE_TONE[product.badge.tone]}`}
          >
            {product.badge.label}
          </span>
        ) : null}
        {showJunji ? (
          <span className="absolute top-5 right-5 z-10 rotate-4 rounded-full bg-brand-yellow px-3.5 py-1.5 text-[13px] font-extrabold text-brand-navy">
            Línea JUNJI
          </span>
        ) : null}
        <ProductPhoto image={image} sizes="(min-width: 1024px) 640px, 92vw" preload />
      </div>

      {product.images.length > 1 ? (
        <ul aria-label="Fotos del producto" className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {product.images.map((photo, i) => (
            <li key={photo.src}>
              <button
                type="button"
                aria-label={`Ver foto ${i + 1} de ${product.images.length}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={`block w-full overflow-hidden rounded-[18px] bg-surface p-1 ${i === index ? "border-3 border-brand-navy" : "border-2 border-chip-border hover:border-brand-navy"}`}
              >
                <span aria-hidden>
                  <ProductPhoto
                    image={{ ...photo, alt: "" }}
                    sizes="120px"
                    className="rounded-xl"
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

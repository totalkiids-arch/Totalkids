import Link from "next/link";

import { BagPlusIcon } from "@/shared/ui/icons";

import {
  formatClp,
  isOnSale,
  levelsLabel,
  type ProductBadgeTone,
  type ProductSummary,
} from "../domain/product";
import { ProductPhoto } from "./product-photo";

const BADGE_TONE: Record<ProductBadgeTone, string> = {
  sale: "bg-brand-red text-white",
  line: "bg-brand-navy text-white",
  new: "bg-brand-green text-white",
  top: "bg-brand-blue text-white",
};

/** Tarjeta de producto del catálogo (portada, listado, relacionados). */
export function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/producto/${product.slug}` as const;
  return (
    <article className="group relative flex w-full flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-[0_2px_0_var(--color-border)] motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_14px_30px_-12px_rgb(31_42_68/0.25)]">
      <div className="relative">
        {product.badge ? (
          <span
            className={`absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-xs font-extrabold ${BADGE_TONE[product.badge.tone]}`}
          >
            {product.badge.label}
          </span>
        ) : null}
        <ProductPhoto
          image={product.image}
          sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 90vw"
          className="rounded-[20px] border-2 border-border"
        />
      </div>

      <div className="flex flex-col gap-1 px-1">
        <p className="text-[13px] font-extrabold text-text-secondary">
          {[product.category, levelsLabel(product.levels)].filter(Boolean).join(" · ")}
        </p>
        <h3 className="text-[21px] leading-tight font-bold">
          {/* El enlace cubre toda la tarjeta (área táctil amplia). */}
          <Link
            href={href}
            className="rounded after:absolute after:inset-0 after:rounded-[28px] after:content-['']"
          >
            {product.name}
          </Link>
        </h3>
        <p className="line-clamp-3 text-sm text-text-secondary">{product.summary}</p>
        <p
          className={`flex items-center gap-1.5 text-[13px] font-extrabold ${product.inStock ? "text-brand-green" : "text-brand-blue"}`}
        >
          <span
            aria-hidden
            className={`size-2 rounded-full ${product.inStock ? "bg-brand-green" : "bg-brand-blue"}`}
          />
          {product.inStock ? "En stock" : "A pedido · se reserva"}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-1">
        <p className="flex flex-col">
          <span className="sr-only">Precio:</span>
          <strong className="text-[22px] font-extrabold">{formatClp(product.price)}</strong>
          {isOnSale(product) && product.compareAtPrice !== null ? (
            <span className="text-[13px] text-text-secondary line-through">
              <span className="sr-only">Antes: </span>
              {formatClp(product.compareAtPrice)}
            </span>
          ) : null}
        </p>
        {/* Variantes y extras se eligen en la ficha antes de agregar (UI-04). */}
        <span
          aria-hidden
          className="relative flex size-12 items-center justify-center rounded-2xl bg-brand-blue text-white group-hover:bg-brand-blue-deep"
        >
          <BagPlusIcon size={22} />
        </span>
      </div>
    </article>
  );
}

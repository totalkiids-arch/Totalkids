import Image from "next/image";

import { Tito } from "@/shared/ui/brand/tito";

import type { ProductImage } from "../domain/product";

interface ProductPhotoProps {
  image: ProductImage | null;
  /** Ancho que ocupa en pantalla, para que next/image elija el tamaño. */
  sizes: string;
  /** Precarga la foto (la principal de la ficha: mejora el LCP). */
  preload?: boolean;
  className?: string;
}

/**
 * Foto de producto en marco cuadrado. Las fotos del cliente tienen fondo blanco y
 * proporciones distintas: se muestran completas (object-contain), sin recortar.
 */
export function ProductPhoto({ image, sizes, preload = false, className = "" }: ProductPhotoProps) {
  return (
    <div className={`relative aspect-square overflow-hidden bg-surface ${className}`}>
      {image ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          preload={preload}
          className="object-contain"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-cream text-sm font-bold text-text-secondary">
          <Tito className="w-1/3" />
          Foto pronto
        </div>
      )}
    </div>
  );
}

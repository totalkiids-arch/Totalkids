import { ScreenPlaceholder } from "@/shared/ui/screen-placeholder";

/** Tienda y compra · Ficha de producto. */
export function ProductDetailScreen({ slug }: { slug: string }) {
  return (
    <ScreenPlaceholder
      section="Tienda y compra"
      title="Ficha de producto"
      description="Fotos, descripción, precio, stock y botón de agregar al carrito."
      detail={`slug: ${slug}`}
    />
  );
}

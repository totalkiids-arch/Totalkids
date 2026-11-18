import { ScreenPlaceholder } from "@/shared/ui/screen-placeholder";

/** Panel administrativo · Crear / editar producto. Sin productId, crea uno nuevo. */
export function ProductEditorScreen({ productId }: { productId?: string }) {
  return (
    <ScreenPlaceholder
      section="Panel administrativo"
      title={productId ? "Editar producto" : "Crear producto"}
      description="Formulario de producto: datos, precio, fotos, categorías y stock."
      {...(productId ? { detail: `id: ${productId}` } : {})}
    />
  );
}

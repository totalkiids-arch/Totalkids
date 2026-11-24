import Link from "next/link";
import { notFound } from "next/navigation";

import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";

import { adminCatalog } from "../container";
import {
  emptyProductFormValues,
  NEW_VARIANT_PREFIX,
  productToFormValues,
} from "../domain/admin-product-form";
import { param, type AdminSearchParams } from "./admin/admin-format";
import { ProductEditorForm } from "./admin/product-editor-form";

/** Avisos al volver a la ficha cuando el producto se guardó pero faltó un paso. */
const NOTICES: Record<string, string> = {
  "imagen-pendiente":
    "El producto se guardó, pero la imagen no se subió. Revisa el archivo y su descripción, y vuelve a intentarlo.",
  "sin-publicar":
    "El producto se guardó, pero no se pudo publicar: necesita categoría activa, precio en cada variante y al menos una imagen con descripción.",
};

/**
 * Panel administrativo · Crear / editar producto (RF-26). Sin productId, crea uno
 * nuevo; un id inexistente responde 404.
 */
export async function ProductEditorScreen({
  productId,
  searchParams = {},
}: {
  productId?: string;
  searchParams?: AdminSearchParams;
}) {
  const [product, categories, extraOptions] = await Promise.all([
    productId ? adminCatalog.getProduct(productId) : Promise.resolve(null),
    adminCatalog.listCategories(),
    adminCatalog.listExtraOptions(),
  ]);
  if (productId && !product) notFound();

  // Se ofrecen las categorías activas y las que el producto ya tenía (aunque estén inactivas).
  const options = categories
    .filter((c) => c.active || product?.categories.includes(c.id))
    .map((c) => ({ id: c.id, name: c.active ? c.name : `${c.name} (inactiva)` }));
  const firstActive = categories.find((c) => c.active)?.id ?? "";
  const initial = product
    ? productToFormValues(product, extraOptions)
    : emptyProductFormValues(
        firstActive,
        `${NEW_VARIANT_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
        extraOptions,
      );
  const notice = NOTICES[param(searchParams, "aviso")];

  return (
    <>
      <AdminPageHeading
        crumb={
          <>
            <Link
              href="/admin/productos"
              className="text-brand-blue underline-offset-4 hover:underline"
            >
              Productos
            </Link>{" "}
            / <span aria-current="page">{product ? "Editar" : "Nuevo"}</span>
          </>
        }
        title={product ? "Editar producto" : "Nuevo producto"}
        description="Configura la ficha, sus variantes y el stock. Editar no cambia los pedidos anteriores: conservan nombre, SKU, variante, extras y precios con que se compraron (RN-02)."
      />
      {notice ? <LiveNotice message={notice} tone="warning" /> : null}
      <ProductEditorForm productId={product?.id ?? ""} initial={initial} categories={options} />
    </>
  );
}

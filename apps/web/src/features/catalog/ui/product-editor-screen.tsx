import Link from "next/link";
import { notFound } from "next/navigation";

import { InfoNote } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";

import { adminCatalog } from "../container";
import { emptyProductFormValues, productToFormValues } from "../domain/admin-product-form";
import { DEMO_STORE_NOTE } from "./admin/admin-format";
import { ProductEditorForm } from "./admin/product-editor-form";

/**
 * Panel administrativo · Crear / editar producto (RF-26). Sin productId, crea uno
 * nuevo; un id inexistente responde 404.
 */
export async function ProductEditorScreen({ productId }: { productId?: string }) {
  const [product, categories] = await Promise.all([
    productId ? adminCatalog.getProduct(productId) : Promise.resolve(null),
    adminCatalog.listCategories(),
  ]);
  if (productId && !product) notFound();

  // Se ofrecen las categorías activas y las que el producto ya tenía (aunque estén inactivas).
  const options = categories
    .filter((c) => c.active || product?.categories.includes(c.slug))
    .map((c) => ({ slug: c.slug, name: c.active ? c.name : `${c.name} (inactiva)` }));
  const firstActive = categories.find((c) => c.active)?.slug ?? "";
  const initial = product
    ? productToFormValues(product)
    : emptyProductFormValues(firstActive, `nueva-${crypto.randomUUID().slice(0, 8)}`);

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
      <InfoNote>{DEMO_STORE_NOTE}</InfoNote>
      <ProductEditorForm productId={product?.id ?? ""} initial={initial} categories={options} />
    </>
  );
}

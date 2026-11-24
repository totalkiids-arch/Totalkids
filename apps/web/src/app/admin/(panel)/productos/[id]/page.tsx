import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { ProductEditorScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Editar producto" };

export default async function Page({ params, searchParams }: PageProps<"/admin/productos/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <AdminSectionGate section="productos">
      <ProductEditorScreen productId={id} searchParams={query} />
    </AdminSectionGate>
  );
}

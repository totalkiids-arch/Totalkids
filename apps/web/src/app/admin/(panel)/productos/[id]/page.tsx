import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { ProductEditorScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Editar producto" };

export default async function Page({ params }: PageProps<"/admin/productos/[id]">) {
  const { id } = await params;
  return (
    <AdminSectionGate section="productos">
      <ProductEditorScreen productId={id} />
    </AdminSectionGate>
  );
}

import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { ProductEditorScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Crear producto" };

export default function Page() {
  return (
    <AdminSectionGate section="productos">
      <ProductEditorScreen />
    </AdminSectionGate>
  );
}

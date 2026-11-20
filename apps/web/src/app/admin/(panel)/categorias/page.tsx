import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { CategoriesScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Categorías" };

export default function Page() {
  return (
    <AdminSectionGate section="categorias">
      <CategoriesScreen />
    </AdminSectionGate>
  );
}

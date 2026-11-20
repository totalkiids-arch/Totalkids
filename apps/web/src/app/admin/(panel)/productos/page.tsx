import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { AdminProductsScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Productos" };

export default function Page() {
  return (
    <AdminSectionGate section="productos">
      <AdminProductsScreen />
    </AdminSectionGate>
  );
}

import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { InventoryScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Inventario" };

export default function Page() {
  return (
    <AdminSectionGate section="inventario">
      <InventoryScreen />
    </AdminSectionGate>
  );
}

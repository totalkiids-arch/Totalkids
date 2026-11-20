import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { InventoryScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Inventario" };

export default async function Page({ searchParams }: PageProps<"/admin/inventario">) {
  return (
    <AdminSectionGate section="inventario">
      <InventoryScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

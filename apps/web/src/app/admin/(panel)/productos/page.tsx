import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { AdminProductsScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Productos" };

export default async function Page({ searchParams }: PageProps<"/admin/productos">) {
  return (
    <AdminSectionGate section="productos">
      <AdminProductsScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

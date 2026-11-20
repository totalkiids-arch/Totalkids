import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { CategoriesScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Categorías" };

export default async function Page({ searchParams }: PageProps<"/admin/categorias">) {
  return (
    <AdminSectionGate section="categorias">
      <CategoriesScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

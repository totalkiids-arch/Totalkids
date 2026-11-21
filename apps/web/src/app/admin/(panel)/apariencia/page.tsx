import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { ThemesScreen } from "@/features/themes";

export const metadata: Metadata = { title: "Apariencia de la tienda" };

export default async function Page({ searchParams }: PageProps<"/admin/apariencia">) {
  return (
    <AdminSectionGate section="apariencia">
      <ThemesScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

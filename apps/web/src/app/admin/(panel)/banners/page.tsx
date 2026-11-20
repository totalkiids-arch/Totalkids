import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { BannersScreen } from "@/features/content";

export const metadata: Metadata = { title: "Banners" };

export default async function Page({ searchParams }: PageProps<"/admin/banners">) {
  return (
    <AdminSectionGate section="banners">
      <BannersScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

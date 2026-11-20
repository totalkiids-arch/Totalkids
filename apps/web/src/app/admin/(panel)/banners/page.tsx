import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { BannersScreen } from "@/features/content";

export const metadata: Metadata = { title: "Banners" };

export default function Page() {
  return (
    <AdminSectionGate section="banners">
      <BannersScreen />
    </AdminSectionGate>
  );
}

import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { CouponsScreen } from "@/features/coupons";

export const metadata: Metadata = { title: "Cupones" };

export default async function Page({ searchParams }: PageProps<"/admin/cupones">) {
  return (
    <AdminSectionGate section="cupones">
      <CouponsScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

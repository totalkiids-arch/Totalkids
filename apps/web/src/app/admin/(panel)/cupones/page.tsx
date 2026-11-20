import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { CouponsScreen } from "@/features/coupons";

export const metadata: Metadata = { title: "Cupones" };

export default function Page() {
  return (
    <AdminSectionGate section="cupones">
      <CouponsScreen />
    </AdminSectionGate>
  );
}

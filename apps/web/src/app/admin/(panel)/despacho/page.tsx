import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { ShippingScreen } from "@/features/shipping";

export const metadata: Metadata = { title: "Despacho y retiro" };

export default function Page() {
  return (
    <AdminSectionGate section="despacho">
      <ShippingScreen />
    </AdminSectionGate>
  );
}

import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { ShippingScreen } from "@/features/shipping";

export const metadata: Metadata = { title: "Despacho y retiro" };

export default async function Page({ searchParams }: PageProps<"/admin/despacho">) {
  return (
    <AdminSectionGate section="despacho">
      <ShippingScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

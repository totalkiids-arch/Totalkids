import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { AdminOrdersScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Pedidos" };

export default async function Page({ searchParams }: PageProps<"/admin/pedidos">) {
  return (
    <AdminSectionGate section="pedidos">
      <AdminOrdersScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}

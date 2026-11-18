import type { Metadata } from "next";

import { AdminOrderDetailScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Detalle de pedido y reembolso" };

export default async function Page({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  return <AdminOrderDetailScreen id={id} />;
}

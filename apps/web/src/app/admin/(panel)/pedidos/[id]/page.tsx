import type { Metadata } from "next";

import { AdminOrderDetailScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Detalle de pedido y reembolso" };

export default async function Page({ params, searchParams }: PageProps<"/admin/pedidos/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <AdminOrderDetailScreen id={id} searchParams={query} />;
}

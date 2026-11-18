import type { Metadata } from "next";

import { OrderTrackingScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Detalle y seguimiento" };

export default async function Page({ params }: PageProps<"/cuenta/pedidos/[id]">) {
  const { id } = await params;
  return <OrderTrackingScreen id={id} />;
}

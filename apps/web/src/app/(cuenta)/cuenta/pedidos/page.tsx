import type { Metadata } from "next";

import { OrderHistoryScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Historial de pedidos" };

export default function Page() {
  return <OrderHistoryScreen />;
}

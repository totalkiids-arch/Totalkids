import type { Metadata } from "next";

import { AdminOrdersScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Pedidos" };

export default function Page() {
  return <AdminOrdersScreen />;
}

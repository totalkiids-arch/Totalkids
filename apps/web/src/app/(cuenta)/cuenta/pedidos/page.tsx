import type { Metadata } from "next";

import { logoutAction } from "@/features/auth";
import { OrderHistoryScreen } from "@/features/orders";

export const metadata: Metadata = { title: "Mis pedidos" };

export default function Page() {
  return <OrderHistoryScreen logoutAction={logoutAction} />;
}

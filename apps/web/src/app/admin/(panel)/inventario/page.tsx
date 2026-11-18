import type { Metadata } from "next";

import { InventoryScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Inventario" };

export default function Page() {
  return <InventoryScreen />;
}

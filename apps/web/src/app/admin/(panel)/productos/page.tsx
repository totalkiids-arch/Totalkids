import type { Metadata } from "next";

import { AdminProductsScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Productos" };

export default function Page() {
  return <AdminProductsScreen />;
}

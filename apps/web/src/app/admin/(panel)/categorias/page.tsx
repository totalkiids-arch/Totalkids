import type { Metadata } from "next";

import { CategoriesScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Categorías" };

export default function Page() {
  return <CategoriesScreen />;
}

import type { Metadata } from "next";

import { CatalogScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Catálogo y búsqueda" };

export default function Page() {
  return <CatalogScreen />;
}

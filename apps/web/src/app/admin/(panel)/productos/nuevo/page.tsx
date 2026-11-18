import type { Metadata } from "next";

import { ProductEditorScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Crear producto" };

export default function Page() {
  return <ProductEditorScreen />;
}

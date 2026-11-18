import type { Metadata } from "next";

import { ProductDetailScreen } from "@/features/catalog";

export const metadata: Metadata = { title: "Ficha de producto" };

export default async function Page({ params }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  return <ProductDetailScreen slug={slug} />;
}

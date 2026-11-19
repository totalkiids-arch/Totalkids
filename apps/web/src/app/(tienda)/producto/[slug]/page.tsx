import type { Metadata } from "next";

import { listProductSlugs, loadProductDetail, ProductDetailScreen } from "@/features/catalog";

/** Prerenderiza las fichas publicadas; un slug nuevo se genera al primer pedido. */
export async function generateStaticParams() {
  const slugs = await listProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProductDetail(slug);
  if (!product) return { title: "Producto no encontrado", robots: { index: false } };
  return {
    title: product.name,
    description: product.summary,
    alternates: { canonical: `/producto/${product.slug}` },
    openGraph: { title: product.name, description: product.summary, type: "website" },
  };
}

export default async function Page({ params }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  return <ProductDetailScreen slug={slug} />;
}

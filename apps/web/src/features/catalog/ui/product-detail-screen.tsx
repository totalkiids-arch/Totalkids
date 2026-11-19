import Link from "next/link";
import { notFound } from "next/navigation";

import { Tito } from "@/shared/ui/brand/tito";
import { Tabs, type TabItem } from "@/shared/ui/tabs";

import { listRelatedProducts } from "../container";
import { EMPTY_QUERY } from "../domain/catalog-query";
import { CATEGORIES, formatClp, type ProductSummary } from "../domain/product";
import type { ProductDetail } from "../domain/product-detail";
import { catalogHref } from "./catalog-href";
import { loadProductDetail } from "./product-detail-data";
import { ProductPhoto } from "./product-photo";
import { ProductJsonLd } from "./product-json-ld";
import { ProductShowcase, type AddToCart } from "./product-showcase";

/** Fondos de las tarjetas de medidas y beneficios, en el orden de la maqueta. */
const TILE_TINTS = ["bg-soft-blue", "bg-soft-green", "bg-cream", "bg-soft-red"] as const;
const LEARNING_TINTS = ["bg-cream", "bg-soft-purple", "bg-soft-green"] as const;

/** Tienda y compra · Ficha de producto (RF-03, RF-04). */
export async function ProductDetailScreen({
  slug,
  addToCart,
}: {
  slug: string;
  /** Server Action del carrito (feature cart), inyectada por la página. */
  addToCart: AddToCart;
}) {
  const product = await loadProductDetail(slug);
  if (!product) notFound();
  const related = await listRelatedProducts(slug);

  return (
    <>
      <ProductJsonLd product={product} />
      <Breadcrumbs product={product} />

      <section aria-label="Producto" className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <ProductShowcase product={product} addToCart={addToCart} />
      </section>

      <section aria-labelledby="info-producto" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h2 id="info-producto" className="sr-only">
          Información del producto
        </h2>
        <div className="rounded-[28px] bg-surface px-5 py-6 shadow-[0_2px_0_var(--color-border)] sm:rounded-[36px] sm:px-8 sm:py-7">
          <Tabs label="Información del producto" items={infoTabs(product)} />
        </div>
      </section>

      {related.length > 0 ? <RelatedProducts products={related} /> : null}
    </>
  );
}

function Breadcrumbs({ product }: { product: ProductDetail }) {
  const category = CATEGORIES.find((c) => c.slug === product.categories[0]);
  return (
    <nav
      aria-label="Ruta de navegación"
      className="mx-auto max-w-7xl px-4 pt-6 text-sm font-bold text-text-secondary sm:px-6"
    >
      <ol className="flex flex-wrap gap-x-1.5">
        <li>
          <Link href="/">Inicio</Link>
        </li>
        <li aria-hidden>/</li>
        <li>
          <Link href="/catalogo">Productos</Link>
        </li>
        {category ? (
          <>
            <li aria-hidden>/</li>
            <li>
              <Link href={catalogHref(EMPTY_QUERY, { category: category.slug })}>
                {category.label}
              </Link>
            </li>
          </>
        ) : null}
        <li aria-hidden>/</li>
        <li aria-current="page">{product.name}</li>
      </ol>
    </nav>
  );
}

function infoTabs(product: ProductDetail): TabItem[] {
  const tabs: (TabItem | null)[] = [
    {
      id: "descripcion",
      label: "Descripción",
      tone: "blue",
      content: (
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-[1_1_420px] flex-col gap-3 text-text-body">
            {product.description.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            {product.specs.length > 0 ? (
              <>
                <h3 className="pt-1 text-xl font-bold text-text-primary">Ficha técnica</h3>
                <dl className="flex flex-col gap-1.5">
                  {product.specs.map((spec, i) => (
                    <div key={i}>
                      <dt className="inline font-extrabold text-text-primary">{spec.label}: </dt>
                      <dd className="inline">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
          </div>
          {product.mascotQuote ? (
            <figure className="flex flex-[1_1_300px] items-center gap-3.5 self-start rounded-[28px] bg-brand-yellow p-5">
              <Tito className="w-20 shrink-0" />
              <blockquote className="font-heading text-[19px] leading-tight font-bold">
                Tito dice: “{product.mascotQuote}”
              </blockquote>
            </figure>
          ) : null}
        </div>
      ),
    },
    product.dimensions.length === 0
      ? null
      : {
          id: "medidas",
          label: "Medidas",
          tone: "green",
          content: (
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              {product.dimensions.map((measure, i) => (
                <div
                  key={measure.label}
                  className={`rounded-[20px] p-4 ${TILE_TINTS[i % TILE_TINTS.length]}`}
                >
                  <dt className="text-[13px] font-extrabold text-text-secondary">
                    {measure.label}
                  </dt>
                  <dd className="text-[22px] font-extrabold">{measure.value}</dd>
                </div>
              ))}
            </dl>
          ),
        },
    {
      id: "armado",
      label: "Armado y cuidado",
      tone: "red",
      content: (
        <ol className="flex list-decimal flex-col gap-2 pl-5.5 text-text-body">
          {product.care.map((step) => (
            <li key={step}>{step}</li>
          ))}
          <li>
            ¿Prefieres que lo armemos nosotros?{" "}
            <Link href="/servicios" className="font-extrabold">
              Agenda el armado a domicilio
            </Link>
            .
          </li>
        </ol>
      ),
    },
    product.learning.length === 0
      ? null
      : {
          id: "aprende",
          label: "Cómo aprende jugando",
          tone: "purple",
          content: (
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
              {product.learning.map((item, i) => (
                <li
                  key={item.title}
                  className={`rounded-[22px] p-4.5 ${LEARNING_TINTS[i % LEARNING_TINTS.length]}`}
                >
                  <h3 className="text-xl font-bold">{item.title}</h3>
                  <p className="mt-1 text-[15px] text-text-body">{item.text}</p>
                </li>
              ))}
            </ul>
          ),
        },
  ];
  return tabs.filter((tab): tab is TabItem => tab !== null);
}

function RelatedProducts({ products }: { products: ProductSummary[] }) {
  return (
    <section aria-labelledby="relacionados" className="mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6">
      <h2 id="relacionados" className="mb-4.5 text-[30px] font-extrabold sm:text-4xl">
        Completa su pieza
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] sm:gap-5">
        {products.map((p) => (
          <li key={p.slug} className="flex">
            <article className="relative flex w-full flex-col gap-2.5 rounded-[26px] bg-surface p-3.5 shadow-[0_2px_0_var(--color-border)] motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_14px_30px_-12px_rgb(31_42_68/0.25)]">
              <ProductPhoto
                image={p.image}
                sizes="(min-width: 640px) 280px, 45vw"
                className="rounded-[18px] border-2 border-border"
              />
              <h3 className="text-[19px] leading-tight font-bold">
                <Link
                  href={`/producto/${p.slug}`}
                  className="text-text-primary after:absolute after:inset-0 after:rounded-[26px] after:content-['']"
                >
                  {p.name}
                </Link>
              </h3>
              <p className="font-extrabold">
                <span className="sr-only">Precio: </span>
                {formatClp(p.price)}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

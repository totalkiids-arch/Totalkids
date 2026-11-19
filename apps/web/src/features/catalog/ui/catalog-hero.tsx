import Link from "next/link";

import type { CatalogQuery } from "../domain/catalog-query";
import { CATEGORIES } from "../domain/product";

function title(query: CatalogQuery) {
  if (query.q) return `Resultados para «${query.q}»`;
  const category = CATEGORIES.find((c) => c.slug === query.category);
  return category?.label ?? "¡Elige tu mueble favorito!";
}

/** Bloques ABC decorativos de la maqueta. */
function Blocks() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 140"
      className="relative hidden h-35 w-55 shrink-0 motion-safe:animate-float md:block"
    >
      <rect x="10" y="70" width="60" height="60" rx="12" className="fill-brand-yellow" />
      <text
        x="40"
        y="114"
        textAnchor="middle"
        className="fill-brand-navy font-heading text-[40px] font-extrabold"
      >
        A
      </text>
      <rect x="78" y="70" width="60" height="60" rx="12" className="fill-brand-red" />
      <text
        x="108"
        y="114"
        textAnchor="middle"
        className="fill-white font-heading text-[40px] font-extrabold"
      >
        B
      </text>
      <rect x="146" y="70" width="60" height="60" rx="12" className="fill-brand-green" />
      <text
        x="176"
        y="114"
        textAnchor="middle"
        className="fill-white font-heading text-[40px] font-extrabold"
      >
        C
      </text>
      <g transform="rotate(10 108 36)">
        <rect x="80" y="8" width="56" height="56" rx="12" className="fill-white" />
        <text
          x="108"
          y="50"
          textAnchor="middle"
          className="fill-brand-purple font-heading text-[36px] font-extrabold"
        >
          1
        </text>
      </g>
    </svg>
  );
}

/** Cabecera azul del catálogo con migas de pan y título según búsqueda o categoría. */
export function CatalogHero({ query }: { query: CatalogQuery }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <div className="on-dark relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[28px] bg-brand-blue px-6 py-7 text-white sm:rounded-[36px] sm:px-11 sm:py-9">
        <div className="relative flex flex-col gap-2">
          <nav aria-label="Ruta de navegación">
            <ol className="flex gap-1.5 text-sm font-bold text-on-blue">
              <li>
                <Link href="/" className="rounded hover:underline">
                  Inicio
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-white">
                Productos
              </li>
            </ol>
          </nav>
          <h1 className="text-[clamp(2.25rem,6vw,3.5rem)] leading-none font-extrabold text-white">
            {title(query)}
          </h1>
          <p className="max-w-140 text-lg text-on-blue">
            Mesas, camas, libreros y organizadores pensados para aprender jugando.
          </p>
        </div>
        <Blocks />
      </div>
    </section>
  );
}

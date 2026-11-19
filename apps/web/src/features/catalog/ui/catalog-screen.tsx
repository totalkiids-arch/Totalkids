import { searchCatalog } from "../container";
import type { CatalogQuery } from "../domain/catalog-query";
import { AdviceCard } from "./advice-card";
import { CatalogFilters } from "./catalog-filters";
import { CatalogHero } from "./catalog-hero";
import { CategoryLinks } from "./category-links";
import { EmptyResults } from "./empty-results";
import { MobileFilters } from "./mobile-filters";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";

/** Tienda y compra · Catálogo y búsqueda (RF-01, RF-02). El estado vive en la URL. */
export async function CatalogScreen({ query }: { query: CatalogQuery }) {
  const result = await searchCatalog(query);
  const count =
    result.total === 1 ? "1 producto encontrado" : `${result.total} productos encontrados`;

  return (
    <>
      <CatalogHero query={query} />
      <CategoryLinks query={query} />

      <div className="mx-auto flex max-w-7xl items-start gap-6 px-4 py-6 sm:px-6">
        <aside aria-label="Filtros" className="hidden w-70 shrink-0 flex-col gap-4 lg:flex">
          <div className="rounded-[28px] bg-surface p-6 shadow-[0_2px_0_var(--color-border)]">
            <h2 className="mb-4 text-2xl font-extrabold">Filtrar</h2>
            <CatalogFilters query={query} variant="aside" />
          </div>
          <AdviceCard />
        </aside>

        <section aria-labelledby="resultados" className="flex min-w-0 flex-1 flex-col gap-5">
          <h2 id="resultados" className="sr-only">
            Resultados
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* aria-live: anuncia el nuevo total al filtrar u ordenar. */}
            <p aria-live="polite" className="font-extrabold text-text-secondary">
              {count}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <MobileFilters query={query} />
              <SortSelect query={query} />
            </div>
          </div>

          {result.items.length === 0 ? (
            <EmptyResults query={query} />
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
              {result.items.map((product) => (
                <li key={product.slug} className="flex">
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}

          <Pagination query={query} page={result.page} pageCount={result.pageCount} />
        </section>
      </div>
    </>
  );
}

import Link from "next/link";

import type { CatalogQuery } from "../domain/catalog-query";
import { catalogHref } from "./catalog-href";

/** Páginas a mostrar: todas si son pocas; si no, primera, última y vecinas de la actual. */
export function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set(
    [1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount),
  );
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) =>
    i > 0 && p - (sorted[i - 1] ?? p) > 1 ? ["…" as const, p] : [p],
  );
}

const box = "flex size-11.5 items-center justify-center rounded-[14px] font-extrabold";

export function Pagination({
  query,
  page,
  pageCount,
}: {
  query: CatalogQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const arrow = (direction: "prev" | "next") => {
    const target = direction === "prev" ? page - 1 : page + 1;
    const label = direction === "prev" ? "Página anterior" : "Página siguiente";
    const path = direction === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6";
    const icon = (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    );
    if (target < 1 || target > pageCount) {
      return (
        <span
          aria-hidden
          className={`${box} border-2 border-chip-border text-text-secondary opacity-50`}
        >
          {icon}
        </span>
      );
    }
    return (
      <Link
        href={catalogHref(query, { page: target })}
        aria-label={label}
        className={`${box} ${direction === "next" ? "bg-brand-yellow text-brand-navy" : "border-2 border-chip-border bg-surface"}`}
      >
        {icon}
      </Link>
    );
  };

  return (
    <nav aria-label="Paginación" className="flex justify-center pt-3">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>{arrow("prev")}</li>
        {pageWindow(page, pageCount).map((p, i) =>
          p === "…" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 font-extrabold text-text-secondary">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={catalogHref(query, { page: p })}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Página ${p}`}
                className={`${box} ${p === page ? "bg-brand-navy text-white" : "border-2 border-chip-border bg-surface hover:border-brand-navy"}`}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>{arrow("next")}</li>
      </ul>
    </nav>
  );
}

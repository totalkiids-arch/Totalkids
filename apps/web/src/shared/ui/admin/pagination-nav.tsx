import type { Route } from "next";
import Link from "next/link";

/** Páginas a mostrar: todas si son pocas; si no, primera, última y vecinas de la actual. */
export function paginationWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set(
    [1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount),
  );
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) =>
    i > 0 && p - (sorted[i - 1] ?? p) > 1 ? ["…" as const, p] : [p],
  );
}

const box = "flex size-11 items-center justify-center rounded-xl text-sm font-extrabold";
const idle = "border-2 border-chip-border bg-surface hover:border-brand-navy";

/** Paginación por enlaces: el estado vive en la URL y funciona sin JavaScript. */
export function PaginationNav({
  page,
  pageCount,
  hrefFor,
  label = "Paginación",
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => Route;
  label?: string;
}) {
  if (pageCount <= 1) return null;
  const arrow = (target: number, text: string, symbol: string) =>
    target < 1 || target > pageCount ? (
      <span
        aria-hidden
        className={`${box} border-2 border-chip-border text-text-secondary opacity-50`}
      >
        {symbol}
      </span>
    ) : (
      <Link href={hrefFor(target)} aria-label={text} className={`${box} ${idle}`}>
        <span aria-hidden>{symbol}</span>
      </Link>
    );

  return (
    <nav aria-label={label} className="flex justify-center px-4 py-4">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>{arrow(page - 1, "Página anterior", "‹")}</li>
        {paginationWindow(page, pageCount).map((p, i) =>
          p === "…" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 font-extrabold text-text-secondary">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Página ${p}`}
                className={`${box} ${p === page ? "bg-brand-navy text-white" : idle}`}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>{arrow(page + 1, "Página siguiente", "›")}</li>
      </ul>
    </nav>
  );
}

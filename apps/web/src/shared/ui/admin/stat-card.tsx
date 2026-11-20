import type { ReactNode } from "react";

/**
 * Tarjeta de indicador del panel (resumen, pagos, reportes): rótulo, cifra
 * grande y una nota. Va dentro de `StatGrid`, que la rotula como lista.
 */
export function StatCard({
  label,
  value,
  note,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface p-5">
      <span className="text-sm font-extrabold text-text-secondary">{label}</span>
      <strong className="font-heading text-3xl font-extrabold break-words tabular-nums">
        {value}
      </strong>
      {note ? <span className="text-[13px] text-text-secondary">{note}</span> : null}
    </li>
  );
}

/** Grilla de indicadores: 1 columna en móvil, 2 en tableta y hasta 4 en escritorio. */
export function StatGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </ul>
  );
}

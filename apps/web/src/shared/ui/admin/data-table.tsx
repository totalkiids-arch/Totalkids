import type { ReactNode } from "react";

export interface DataTableColumn {
  key: string;
  label: ReactNode;
  /** Cifras a la derecha para compararlas. */
  align?: "start" | "end";
}

export interface DataTableRow {
  key: string;
  cells: Record<string, ReactNode>;
}

/**
 * Tabla accesible del panel: caption, encabezados con scope y desplazamiento
 * horizontal solo dentro de su contenedor (la página no se desborda, RNF-08).
 * El contenedor es enfocable para desplazarlo con el teclado.
 */
export function DataTable({
  caption,
  captionHidden = true,
  columns,
  rows,
  empty = "No hay resultados. Prueba con otros filtros.",
  footer,
}: {
  caption: string;
  /** Por defecto el caption es solo para lectores de pantalla (el panel ya tiene título). */
  captionHidden?: boolean;
  columns: readonly DataTableColumn[];
  rows: readonly DataTableRow[];
  empty?: ReactNode;
  /** Pie bajo la tabla; por defecto "N registros · Datos de demostración". */
  footer?: ReactNode;
}) {
  const align = (column: DataTableColumn) => (column.align === "end" ? "text-right" : "text-left");
  const [first, ...rest] = columns;
  const actions = rest.find((c) => c.key === "actions");
  const details = rest.filter((c) => c !== actions);
  return (
    <div className="min-w-0">
      {/*
        Teléfono: una tarjeta por fila, con todas las columnas a la vista (en una
        tabla, estado y acciones quedaban fuera de la pantalla). Desde sm: tabla.
        Solo una de las dos se muestra; la otra queda fuera del árbol de accesibilidad.
      */}
      <ul aria-label={caption} className="sm:hidden">
        {rows.length === 0 ? (
          <li className="px-5 py-10 text-center text-text-secondary">{empty}</li>
        ) : (
          rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-col gap-3 border-t border-border px-5 py-4 first:border-t-0"
            >
              {first ? <div className="min-w-0">{row.cells[first.key]}</div> : null}
              {details.length > 0 ? (
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
                  {details.map((column) => (
                    <div key={column.key} className="contents">
                      <dt className="text-[13px] font-bold text-text-secondary">{column.label}</dt>
                      <dd className="min-w-0 tabular-nums">{row.cells[column.key]}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {actions ? <div className="-ml-2">{row.cells[actions.key]}</div> : null}
            </li>
          ))
        )}
      </ul>
      <div
        role="region"
        aria-label={`${caption}. Desplázate horizontalmente para ver todas las columnas.`}
        tabIndex={0}
        className="hidden w-full overflow-x-auto focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-blue sm:block"
      >
        <table className="w-full border-collapse text-sm whitespace-nowrap">
          <caption className={captionHidden ? "sr-only" : "px-5 py-3 text-left font-extrabold"}>
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`bg-background px-5 py-3 text-[11px] font-extrabold tracking-[0.045em] text-text-secondary uppercase ${align(column)}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-text-secondary">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`border-t border-border px-5 py-3 align-middle tabular-nums ${align(column)}`}
                    >
                      {row.cells[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3.5 text-[13px] text-text-secondary">
        {footer ?? `${rows.length} registro${rows.length === 1 ? "" : "s"} · Datos de demostración`}
      </p>
    </div>
  );
}

/** Celda con título en negrita y detalle gris debajo (nombre + SKU · categoría). */
export function CellTitle({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="flex min-w-48 flex-col">
      <strong className="font-extrabold whitespace-normal">{title}</strong>
      {meta ? <small className="mt-0.5 text-xs text-text-secondary">{meta}</small> : null}
    </span>
  );
}

/** Estilo de los enlaces y botones de texto de una fila (área táctil de 44 px). */
export const TEXT_ACTION =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-sm font-extrabold text-brand-blue underline-offset-4 hover:underline";

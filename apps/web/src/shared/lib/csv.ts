/**
 * CSV seguro para exportaciones del panel (RF-29). Sin conocimiento de negocio.
 *
 * - Separador ";" y fin de línea CRLF: Excel en español lo abre en columnas.
 * - BOM UTF-8 al inicio: Excel muestra bien las tildes y la ñ.
 * - Cada celda va entre comillas y las comillas internas se duplican.
 * - Inyección de fórmulas: una celda que empieza con =, +, -, @, tabulador o
 *   retorno de carro se antepone con un apóstrofo, así la hoja de cálculo la
 *   trata como texto y no la ejecuta.
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export const CSV_BOM = "﻿";

/** Una celda lista para el CSV: neutralizada y entre comillas. */
export function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Archivo CSV completo (con BOM) a partir del encabezado y las filas. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return CSV_BOM + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

/** Respuesta de descarga para un Route Handler (sin caché: son datos internos). */
export function csvDownload(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

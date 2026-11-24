import type { Response } from "express";

/**
 * CSV seguro para las exportaciones del panel (RF-29, LN-16). Mismas reglas que
 * `apps/web/src/shared/lib/csv.ts`, así el archivo es igual venga de donde venga:
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

/** Nombre de archivo sin caracteres que rompan la cabecera Content-Disposition. */
export function safeFilename(name: string): string {
  return name.replace(/[^\w.-]/g, "_");
}

/** Responde la descarga (sin caché: son datos internos). */
export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(filename)}"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(csv);
}

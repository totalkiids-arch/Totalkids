import { describe, expect, it } from "vitest";

import { CSV_BOM, csvCell, safeFilename, toCsv } from "../src/lib/csv.js";

describe("CSV seguro (RF-29)", () => {
  it("neutraliza las celdas que empiezan con = + - @ tabulador o retorno", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${start}SUMA(A1)`)).toBe(`"'${start}SUMA(A1)"`);
    }
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
  });

  it("deja igual lo que no es fórmula y conserva tildes y ñ", () => {
    expect(csvCell("Ñuñoa, María José")).toBe('"Ñuñoa, María José"');
    expect(csvCell("a=b")).toBe('"a=b"');
    expect(csvCell(4990)).toBe('"4990"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it("duplica las comillas internas", () => {
    expect(csvCell('Silla "Mini"')).toBe('"Silla ""Mini"""');
  });

  it("arma el archivo con BOM, ';' y CRLF", () => {
    const csv = toCsv(
      ["Pedido", "Comuna"],
      [
        ["TK-1", "Ñuñoa"],
        ["TK-2", "-Peñalolén"],
      ],
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('"Pedido";"Comuna"\r\n"TK-1";"Ñuñoa"\r\n"TK-2";"\'-Peñalolén"');
  });

  it("limpia el nombre del archivo", () => {
    expect(safeFilename('ventas "2026".csv')).toBe("ventas__2026_.csv");
  });
});

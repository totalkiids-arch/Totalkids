import { describe, expect, it } from "vitest";

import { CSV_BOM, csvCell, csvDownload, toCsv } from "./csv";

describe("csvCell", () => {
  it("encierra en comillas y duplica las comillas internas", () => {
    expect(csvCell('Sala "Pikler"')).toBe('"Sala ""Pikler"""');
  });

  it.each(["=SUMA(A1)", "+56912345678", "-10", "@cmd", "\tx", "\rx"])(
    "neutraliza la fórmula potencial %j",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("no altera texto normal ni un signo que no está al inicio", () => {
    expect(csvCell("Camila González")).toBe('"Camila González"');
    expect(csvCell("a=b")).toBe('"a=b"');
  });

  it("acepta números, booleanos y vacíos", () => {
    expect(csvCell(54990)).toBe('"54990"');
    expect(csvCell(true)).toBe('"true"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("toCsv", () => {
  it("usa BOM, punto y coma y CRLF", () => {
    const csv = toCsv(["Correo", "Versión"], [["ana@example.com", "v1"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('"Correo";"Versión"\r\n"ana@example.com";"v1"');
  });

  it("con solo encabezado no agrega líneas vacías", () => {
    expect(toCsv(["A"], [])).toBe(`${CSV_BOM}"A"`);
  });
});

describe("csvDownload", () => {
  it("descarga como adjunto UTF-8 sin caché", async () => {
    const response = csvDownload("suscriptores.csv", "x");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="suscriptores.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("x");
  });
});

import { describe, expect, it } from "vitest";

import { cleanRut, formatRut, isValidRut, rutCheckDigit } from "./rut";

describe("rutCheckDigit", () => {
  it("calcula el verificador con módulo 11", () => {
    expect(rutCheckDigit("12345678")).toBe("5");
    expect(rutCheckDigit("76123456")).toBe("0");
    expect(rutCheckDigit("10000013")).toBe("K");
  });
});

describe("isValidRut", () => {
  it("acepta con o sin puntos y guion, y k minúscula", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("10.000.013-k")).toBe(true);
    expect(isValidRut(" 7.654.321-6 ")).toBe(true);
  });

  it("rechaza verificador incorrecto, largos inválidos y ceros a la izquierda", () => {
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("1-9")).toBe(false);
    expect(isValidRut("123.456.789-0")).toBe(false);
    expect(isValidRut("01234567-8")).toBe(false);
    expect(isValidRut("abc")).toBe(false);
  });
});

describe("cleanRut y formatRut", () => {
  it("normaliza y presenta con puntos y guion", () => {
    expect(cleanRut("12.345.678-k")).toBe("12345678K");
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("76123456-0")).toBe("76.123.456-0");
    expect(formatRut("7654321-6")).toBe("7.654.321-6");
  });

  it("deja tal cual un RUT inválido", () => {
    expect(formatRut(" 12-3 ")).toBe("12-3");
  });
});

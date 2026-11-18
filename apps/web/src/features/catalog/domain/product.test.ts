import { describe, expect, it } from "vitest";

import { formatClp } from "./product";

describe("formatClp", () => {
  it("formatea pesos chilenos sin decimales y con punto de miles", () => {
    expect(formatClp(129990)).toBe("$129.990");
    expect(formatClp(0)).toBe("$0");
  });

  it("muestra el marcador cuando el precio aún no está definido", () => {
    expect(formatClp(null)).toBe("$[PRECIO]");
  });
});

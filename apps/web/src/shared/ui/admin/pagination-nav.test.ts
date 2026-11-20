import { describe, expect, it } from "vitest";

import { paginationWindow } from "./pagination-nav";

describe("paginationWindow", () => {
  it("muestra todas las páginas si son pocas", () => {
    expect(paginationWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it("resume con … alrededor de la página actual", () => {
    expect(paginationWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });

  it("no repite la primera ni la última", () => {
    expect(paginationWindow(1, 10)).toEqual([1, 2, "…", 10]);
  });
});

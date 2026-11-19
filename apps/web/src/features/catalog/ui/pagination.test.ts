import { describe, expect, it } from "vitest";

import { pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("muestra todas las páginas si son pocas", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("resume con puntos suspensivos cuando son muchas", () => {
    expect(pageWindow(6, 20)).toEqual([1, "…", 5, 6, 7, "…", 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, "…", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "…", 19, 20]);
  });
});

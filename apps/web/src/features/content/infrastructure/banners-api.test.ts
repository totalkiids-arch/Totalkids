import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toApiBannerBody, toBannerList, toStoreBanners } from "./banners-api";

const banner = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  title: "Línea JUNJI",
  text: "Muebles certificados para salas cuna y jardines.",
  href: "/catalogo?categoria=junji",
  sortOrder: 2,
  active: true,
  startsAt: "2026-12-01T12:00:00.000Z",
  endsAt: null,
  visibility: "scheduled",
  visibilityLabel: "Programado",
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-20T12:00:00.000Z",
};

describe("banners-api", () => {
  it("traduce el orden y la visibilidad del panel", () => {
    expect(toBannerList({ items: [banner] })[0]).toMatchObject({
      order: 2,
      startsAt: "2026-12-01T12:00:00.000Z",
      visibility: "scheduled",
      visibilityLabel: "Programado",
    });
  });

  it("en el panel, un cuerpo inesperado cuenta como API no disponible", () => {
    expect(() => toBannerList({ items: [{ ...banner, visibility: "otra" }] })).toThrow(
      PANEL_MESSAGES.unavailable,
    );
  });

  it("envía el orden como sortOrder y la ventana tal cual", () => {
    expect(
      toApiBannerBody({
        title: "A",
        text: "B",
        href: "/",
        order: 3,
        active: false,
        startsAt: null,
        endsAt: "2026-12-31T12:00:00.000Z",
      }),
    ).toEqual({
      title: "A",
      text: "B",
      href: "/",
      sortOrder: 3,
      active: false,
      startsAt: null,
      endsAt: "2026-12-31T12:00:00.000Z",
    });
  });

  it("en la portada descarta destinos no internos y tolera respuestas inesperadas", () => {
    const items = [
      { id: "1", title: "Uno", text: "T", href: "/catalogo", sortOrder: 1 },
      { id: "2", title: "Dos", text: "T", href: "https://otro.cl", sortOrder: 2 },
    ];
    expect(toStoreBanners({ items }).map((b) => b.id)).toEqual(["1"]);
    expect(toStoreBanners({ nada: true })).toEqual([]);
  });
});

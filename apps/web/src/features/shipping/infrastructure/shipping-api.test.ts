import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import {
  toApiSettingsBody,
  toSettingsFormErrors,
  toShippingSettings,
  toZoneList,
} from "./shipping-api";

const zone = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  region: "RM",
  commune: "Ñuñoa",
  price: null,
  leadTime: "A coordinar con el taller",
  freeShippingEligible: true,
  active: true,
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-20T12:00:00.000Z",
};

describe("shipping-api", () => {
  it("traduce zonas con tarifa a coordinar", () => {
    expect(toZoneList({ items: [zone] })[0]).toMatchObject({
      commune: "Ñuñoa",
      price: null,
      freeShippingEligible: true,
    });
  });

  it("una región desconocida cuenta como API no disponible", () => {
    expect(() => toZoneList({ items: [{ ...zone, region: "XX" }] })).toThrow(
      PANEL_MESSAGES.unavailable,
    );
  });

  it("traduce las condiciones de retiro en ambos sentidos", () => {
    const settings = toShippingSettings({
      pickupEnabled: false,
      pickupDetails: "Taller Total Kids, Temuco",
      freeShippingThreshold: null,
      reservationMinutes: 30,
      updatedAt: null,
    });
    expect(settings).toEqual({
      pickupEnabled: false,
      pickup: "Taller Total Kids, Temuco",
      freeShippingThreshold: null,
      reservationMinutes: 30,
    });
    expect(toApiSettingsBody(settings)).toEqual({
      pickupEnabled: false,
      pickupDetails: "Taller Total Kids, Temuco",
      freeShippingThreshold: null,
      reservationMinutes: 30,
    });
  });

  it("el error de la dirección de retiro vuelve al campo del formulario", () => {
    expect(toSettingsFormErrors({ pickupDetails: "Obligatorio" })).toEqual({
      pickup: "Obligatorio",
    });
  });
});

import "server-only";

import { site } from "@/shared/config/site";

import type { ShippingAdmin } from "../application/ports";
import {
  validateSettings,
  validateZone,
  type ShippingSettings,
  type ShippingZone,
} from "../domain/shipping-zone";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar o
 *    redesplegar y no se comparte entre instancias.
 *  - Es solo del panel: el checkout todavía no lee estas zonas (sigue
 *    mostrando el despacho "por confirmar" y toma el umbral de site.ts).
 *  - LN-12 lo reemplaza por un adaptador que llama a la API, con la misma
 *    interfaz ShippingAdmin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  zones: ShippingZone[];
  settings: ShippingSettings;
  sequence: number;
}

const SEED_ZONES: readonly ShippingZone[] = [
  {
    id: "z1",
    region: "RM",
    commune: "Ñuñoa",
    price: 4990,
    leadTime: "3 a 5 días hábiles",
    active: true,
  },
  {
    id: "z2",
    region: "RM",
    commune: "Providencia",
    price: 4990,
    leadTime: "3 a 5 días hábiles",
    active: true,
  },
  {
    id: "z3",
    region: "RM",
    commune: "Santiago",
    price: 5990,
    leadTime: "3 a 5 días hábiles",
    active: true,
  },
  {
    id: "z4",
    region: "AR",
    commune: "Temuco",
    price: 9990,
    leadTime: "5 a 8 días hábiles",
    active: false,
  },
];

function seed(): DemoState {
  return {
    zones: SEED_ZONES.map((z) => ({ ...z })),
    settings: {
      pickup: `Tienda Total Kids · ${site.address} · ${site.hours}`,
      freeShippingThreshold: site.freeShippingThreshold,
      reservationMinutes: 15,
    },
    sequence: SEED_ZONES.length,
  };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoShipping?: DemoState };
const state = () => (holder.__tkDemoShipping ??= seed());

export const demoShippingAdmin: ShippingAdmin = {
  async listZones() {
    return state().zones.map((z) => ({ ...z }));
  },

  async saveZone(id, input) {
    const s = state();
    const existing = id ? s.zones.find((z) => z.id === id) : undefined;
    if (id && !existing) return { ok: false, errors: { form: "Esa zona ya no existe." } };
    const result = validateZone(
      input,
      s.zones.filter((z) => z.id !== id),
    );
    if (!result.ok) return result;
    if (existing) {
      Object.assign(existing, result.draft);
      return { ok: true, value: { ...existing } };
    }
    s.sequence += 1;
    const created = { id: `z${s.sequence}`, ...result.draft };
    s.zones.push(created);
    return { ok: true, value: { ...created } };
  },

  async setZoneActive(id, active) {
    const zone = state().zones.find((z) => z.id === id);
    if (!zone) return null;
    zone.active = active;
    return { ...zone };
  },

  async getSettings() {
    return { ...state().settings };
  },

  async saveSettings(input) {
    const result = validateSettings(input);
    if (!result.ok) return result;
    state().settings = result.settings;
    return { ok: true, value: { ...result.settings } };
  },
};

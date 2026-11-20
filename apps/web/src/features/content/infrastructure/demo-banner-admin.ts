import "server-only";

import type { BannerAdmin } from "../application/ports";
import { validateBanner, type Banner } from "../domain/banner";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar o
 *    redesplegar y no se comparte entre instancias.
 *  - Es solo del panel: la portada de la tienda no lee estos banners y no
 *    cambia.
 *  - LN-12/LN-13 lo reemplazan por un adaptador que llama a la API
 *    (/admin/banners), con la misma interfaz BannerAdmin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  banners: Banner[];
  sequence: number;
}

const SEED_BANNERS: readonly Banner[] = [
  {
    id: "b1",
    title: "Pequeños espacios, grandes aventuras",
    text: "Muebles para aprender jugando.",
    href: "/catalogo",
    order: 1,
    active: true,
  },
  {
    id: "b2",
    title: "Diseñamos tu sala",
    text: "Te ayudamos a planificar salas cuna y jardines infantiles.",
    href: "/servicios",
    order: 2,
    active: true,
  },
  {
    id: "b3",
    title: "Línea JUNJI",
    text: "Mobiliario que cumple las especificaciones para jardines JUNJI.",
    href: "/catalogo?categoria=junji",
    order: 3,
    active: false,
  },
];

function seed(): DemoState {
  return { banners: SEED_BANNERS.map((b) => ({ ...b })), sequence: SEED_BANNERS.length };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoBanners?: DemoState };
const state = () => (holder.__tkDemoBanners ??= seed());

export const demoBannerAdmin: BannerAdmin = {
  async list() {
    return state().banners.map((b) => ({ ...b }));
  },

  async save(id, input) {
    const s = state();
    const existing = id ? s.banners.find((b) => b.id === id) : undefined;
    if (id && !existing) return { ok: false, errors: { form: "Ese banner ya no existe." } };
    const result = validateBanner(input);
    if (!result.ok) return result;
    if (existing) {
      Object.assign(existing, result.draft);
      return { ok: true, value: { ...existing } };
    }
    s.sequence += 1;
    const created: Banner = { id: `b${s.sequence}`, ...result.draft };
    s.banners.push(created);
    return { ok: true, value: { ...created } };
  },

  async setActive(id, active) {
    const banner = state().banners.find((b) => b.id === id);
    if (!banner) return null;
    banner.active = active;
    return { ...banner };
  },
};

import "server-only";

import type { CouponAdmin } from "../application/ports";
import {
  addDays as shiftDay,
  canDeleteCoupon,
  chileToday,
  validateCoupon,
  type Coupon,
} from "../domain/coupon";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar o
 *    redesplegar y no se comparte entre instancias.
 *  - Es solo del panel: el carrito no lee estos cupones y sigue respondiendo
 *    que no hay cupones vigentes. Los usos son ficticios.
 *  - LN-12/LN-13 lo reemplazan por un adaptador que llama a la API
 *    (/admin/coupons), con la misma interfaz CouponAdmin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  coupons: Coupon[];
  sequence: number;
}

// Fechas relativas al día en que arranca el servidor, para que cada ejemplo
// conserve su estado (vigente, vencido, agotado, programado) con el tiempo.
function seed(): DemoState {
  const today = chileToday();
  const coupons: Coupon[] = [
    {
      id: "c1",
      code: "APRENDER10",
      kind: "percent",
      value: 10,
      startsOn: shiftDay(today, -20),
      endsOn: shiftDay(today, 40),
      maxUses: 100,
      uses: 12,
      active: true,
    },
    {
      id: "c2",
      code: "INVIERNO5000",
      kind: "amount",
      value: 5000,
      startsOn: shiftDay(today, -150),
      endsOn: shiftDay(today, -60),
      maxUses: 200,
      uses: 87,
      active: true,
    },
    {
      id: "c3",
      code: "BIENVENIDA15",
      kind: "percent",
      value: 15,
      startsOn: shiftDay(today, -45),
      endsOn: shiftDay(today, 15),
      maxUses: 50,
      uses: 50,
      active: true,
    },
    {
      id: "c4",
      code: "NAVIDAD20",
      kind: "percent",
      value: 20,
      startsOn: shiftDay(today, 10),
      endsOn: shiftDay(today, 35),
      maxUses: 150,
      uses: 0,
      active: true,
    },
    {
      id: "c5",
      code: "SALAS30000",
      kind: "amount",
      value: 30000,
      startsOn: shiftDay(today, -5),
      endsOn: shiftDay(today, 60),
      maxUses: 20,
      uses: 0,
      active: false,
    },
  ];
  return { coupons, sequence: coupons.length };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoCoupons?: DemoState };
const state = () => (holder.__tkDemoCoupons ??= seed());

export const demoCouponAdmin: CouponAdmin = {
  async list() {
    return state().coupons.map((c) => ({ ...c }));
  },

  async save(id, input) {
    const s = state();
    const existing = id ? (s.coupons.find((c) => c.id === id) ?? null) : null;
    if (id && !existing) return { ok: false, errors: { form: "Ese cupón ya no existe." } };
    const result = validateCoupon(
      input,
      s.coupons.filter((c) => c.id !== id),
      existing,
    );
    if (!result.ok) return result;
    if (existing) {
      Object.assign(existing, result.draft);
      return { ok: true, value: { ...existing } };
    }
    s.sequence += 1;
    const created: Coupon = { id: `c${s.sequence}`, ...result.draft, uses: 0 };
    s.coupons.push(created);
    return { ok: true, value: { ...created } };
  },

  async setActive(id, active) {
    const coupon = state().coupons.find((c) => c.id === id);
    if (!coupon) return null;
    coupon.active = active;
    return { ...coupon };
  },

  async remove(id) {
    const s = state();
    const coupon = s.coupons.find((c) => c.id === id);
    if (!coupon) return { ok: false, reason: "not-found" };
    if (!canDeleteCoupon(coupon)) return { ok: false, reason: "in-use" };
    s.coupons = s.coupons.filter((c) => c.id !== id);
    return { ok: true };
  },
};

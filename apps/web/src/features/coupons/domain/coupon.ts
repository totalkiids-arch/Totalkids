/**
 * Cupones de descuento (RF-07, RF-28, RN-01, RN-02). Dominio puro.
 *
 * Un cupón por pedido, de porcentaje o de monto fijo, con vigencia y máximo de
 * usos. Editar o desactivar un cupón afecta solo compras nuevas: cada pedido
 * guarda su propio descuento. Un cupón con usos no se elimina (solo se
 * desactiva) y no cambia su código, tipo ni valor, para no romper la
 * trazabilidad de los canjes (coupon_redemptions) ni de los reportes.
 */

export const COUPON_KINDS = ["percent", "amount"] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export interface Coupon {
  id: string;
  /** Normalizado: mayúsculas, sin espacios. Único sin distinguir mayúsculas. */
  code: string;
  kind: CouponKind;
  /** Porcentaje entero (1–100) o monto en CLP entero (> 0). */
  value: number;
  /** Primer día de vigencia (AAAA-MM-DD, hora de Chile). */
  startsOn: string;
  /** Último día de vigencia, inclusive (AAAA-MM-DD). */
  endsOn: string;
  maxUses: number;
  /** Usos ya consumidos (pedidos pagados). Solo los cambia el checkout. */
  uses: number;
  active: boolean;
}

export type CouponDraft = Omit<Coupon, "id" | "uses">;

/** Datos del formulario tal como llegan (texto), antes de validar. */
export interface CouponInput {
  code: string;
  kind: string;
  value: string;
  startsOn: string;
  endsOn: string;
  maxUses: string;
  active: boolean;
}

export type FieldErrors = Partial<Record<string, string>>;

export const CODE_MIN = 3;
export const CODE_MAX = 20;
export const PERCENT_MAX = 100;
export const AMOUNT_MAX = 10_000_000;
export const MAX_USES_LIMIT = 1_000_000;

export const LOCKED_BY_USES = "Tiene usos: para otro descuento crea un cupón nuevo.";
export const IN_USE_CANNOT_DELETE = "Este cupón tiene usos: solo se puede desactivar.";

/** "aprender 10" → "APRENDER10". */
export function normalizeCouponCode(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase();
}

/** Un cupón con usos tiene historial: solo se desactiva. */
export function canDeleteCoupon(coupon: Pick<Coupon, "uses">): boolean {
  return coupon.uses === 0;
}

/** Con usos, el código, el tipo y el valor quedan fijos. */
export function hasLockedTerms(coupon: Pick<Coupon, "uses"> | null): boolean {
  return coupon !== null && coupon.uses > 0;
}

export function isCouponKind(value: unknown): value is CouponKind {
  return typeof value === "string" && (COUPON_KINDS as readonly string[]).includes(value);
}

/** AAAA-MM-DD que existe en el calendario (rechaza 2026-02-30). */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const CHILE_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario en Chile (AAAA-MM-DD). La vigencia se cuenta en hora de Chile. */
export function chileToday(now: Date = new Date()): string {
  return CHILE_DAY.format(now);
}

/** Día AAAA-MM-DD desplazado `days` días (negativo hacia atrás). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Monto en pesos: "5000", "5.000" o "$5.000". null si no es un entero
 * (con decimales como "4990,5" o "4990.5", o con otros caracteres).
 */
export function parseClpAmount(text: string): number | null {
  const cleaned = text.replace(/\s/g, "").replace(/^\$/, "");
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(/\./g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

function parseWhole(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/** Porcentaje entero: "10" o "10%". */
function parsePercent(text: string): number | null {
  return parseWhole(text.replace(/\s/g, "").replace(/%$/, ""));
}

/**
 * Valida un cupón contra las reglas y contra los demás cupones (código único).
 * `existing` es el cupón que se edita (null al crear): aporta los usos ya
 * consumidos y, si tiene usos, fija código, tipo y valor.
 */
export function validateCoupon(
  input: CouponInput,
  others: readonly Coupon[],
  existing: Coupon | null = null,
): { ok: true; draft: CouponDraft } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const code = normalizeCouponCode(input.code);
  const kind = isCouponKind(input.kind) ? input.kind : null;
  const value = kind === "amount" ? parseClpAmount(input.value) : parsePercent(input.value);
  const maxUses = parseWhole(input.maxUses);
  const usesSoFar = existing?.uses ?? 0;
  const locked = hasLockedTerms(existing);

  if (code === "") errors.code = "Escribe el código del cupón.";
  else if (code.length < CODE_MIN || code.length > CODE_MAX) {
    errors.code = `El código debe tener entre ${CODE_MIN} y ${CODE_MAX} caracteres.`;
  } else if (!/^[A-Z0-9_-]+$/.test(code)) {
    errors.code = "Usa solo letras sin tilde (A–Z), números, guion (-) o guion bajo (_).";
  } else if (locked && existing && code !== existing.code) {
    errors.code = LOCKED_BY_USES;
  } else if (others.some((c) => c.code.toUpperCase() === code)) {
    errors.code = "Ese código ya existe. Usa otro o edita el cupón existente.";
  }

  if (kind === null) errors.kind = "Elige el tipo de descuento.";
  else if (locked && existing && kind !== existing.kind) errors.kind = LOCKED_BY_USES;

  if (kind === "percent") {
    if (value === null || value < 1 || value > PERCENT_MAX) {
      errors.value = "El porcentaje debe ser un número entero entre 1 y 100.";
    }
  } else if (kind === "amount") {
    if (value === null) {
      errors.value = "Escribe el monto en pesos, entero y sin decimales (p. ej. 5000).";
    } else if (value <= 0) errors.value = "El monto debe ser mayor que 0.";
    else if (value > AMOUNT_MAX) errors.value = "El monto parece demasiado alto. Revísalo.";
  }
  if (!errors.value && !errors.kind && locked && existing && value !== existing.value) {
    errors.value = LOCKED_BY_USES;
  }

  const startValid = isIsoDate(input.startsOn);
  const endValid = isIsoDate(input.endsOn);
  if (!startValid) errors.startsOn = "Elige la fecha de inicio.";
  if (!endValid) errors.endsOn = "Elige la fecha de término.";
  if (startValid && endValid && input.endsOn < input.startsOn) {
    errors.endsOn = "La fecha de término no puede ser anterior al inicio.";
  }

  if (maxUses === null || maxUses < 1) {
    errors.maxUses = "El máximo de usos debe ser un número entero de al menos 1.";
  } else if (maxUses > MAX_USES_LIMIT) {
    errors.maxUses = "El máximo de usos parece demasiado alto. Revísalo.";
  } else if (maxUses < usesSoFar) {
    errors.maxUses = `El máximo no puede ser menor que los ${usesSoFar} usos ya consumidos.`;
  }

  if (Object.keys(errors).length > 0 || kind === null || value === null || maxUses === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    draft: {
      code,
      kind,
      value,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      maxUses,
      active: input.active,
    },
  };
}

export type CouponStatus = "active" | "scheduled" | "expired" | "exhausted" | "inactive";

/**
 * Estado para mostrar en el panel. Prioridad: inactivo > agotado > vencido >
 * programado > activo. `today` es el día en Chile (ver chileToday).
 */
export function couponStatus(
  coupon: Pick<Coupon, "active" | "uses" | "maxUses" | "startsOn" | "endsOn">,
  today: string,
): CouponStatus {
  if (!coupon.active) return "inactive";
  if (coupon.uses >= coupon.maxUses) return "exhausted";
  if (today > coupon.endsOn) return "expired";
  if (today < coupon.startsOn) return "scheduled";
  return "active";
}

/**
 * Descuento en CLP sobre el subtotal elegible (sin despacho), RN-01 y RF-07:
 * el porcentaje se redondea al peso más cercano y el descuento nunca supera
 * el subtotal. No revisa vigencia ni cupo (eso es couponStatus y el backend).
 *
 * Lista para LN-12: hoy no la usa el carrito, que sigue respondiendo que no
 * hay cupones vigentes.
 */
export function couponDiscount(
  eligibleSubtotal: number,
  coupon: Pick<Coupon, "kind" | "value">,
): number {
  if (!Number.isFinite(eligibleSubtotal) || eligibleSubtotal <= 0) return 0;
  const raw =
    coupon.kind === "percent" ? Math.round((eligibleSubtotal * coupon.value) / 100) : coupon.value;
  return Math.max(0, Math.min(raw, eligibleSubtotal));
}

/** Por estado útil (activos primero) y luego por código. */
export function sortCoupons(coupons: readonly Coupon[], today: string): Coupon[] {
  const rank: Record<CouponStatus, number> = {
    active: 0,
    scheduled: 1,
    exhausted: 2,
    expired: 3,
    inactive: 4,
  };
  return [...coupons].sort(
    (a, b) =>
      rank[couponStatus(a, today)] - rank[couponStatus(b, today)] || a.code.localeCompare(b.code),
  );
}

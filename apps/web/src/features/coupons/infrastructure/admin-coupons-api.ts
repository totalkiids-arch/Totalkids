import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import type { CouponList } from "../application/ports";
import { COUPON_KINDS, COUPON_STATUSES, type Coupon, type CouponDraft } from "../domain/coupon";

/*
 * Traducción de /admin/coupons (apps/api/openapi.yaml) al panel. Puro (sin
 * server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta como
 * API no disponible.
 */

const ApiCoupon = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(COUPON_KINDS),
  value: z.number().int(),
  startsOn: z.string(),
  endsOn: z.string(),
  maxUses: z.number().int(),
  uses: z.number().int(),
  active: z.boolean(),
  status: z.enum(COUPON_STATUSES),
  statusLabel: z.string(),
  termsLocked: z.boolean(),
  canDelete: z.boolean(),
});

const ApiCouponList = z.object({ today: z.string(), items: z.array(ApiCoupon) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const toCoupon = (c: z.infer<typeof ApiCoupon>): Coupon => ({
  id: c.id,
  code: c.code,
  kind: c.kind,
  value: c.value,
  startsOn: c.startsOn,
  endsOn: c.endsOn,
  maxUses: c.maxUses,
  uses: c.uses,
  active: c.active,
  status: c.status,
  statusLabel: c.statusLabel,
  termsLocked: c.termsLocked,
  canDelete: c.canDelete,
});

export function toCouponList(body: unknown): CouponList {
  const data = parse(ApiCouponList, body);
  return { today: data.today, coupons: data.items.map(toCoupon) };
}

export function toAdminCoupon(body: unknown): Coupon {
  return toCoupon(parse(ApiCoupon, body));
}

/**
 * Cuerpo de POST o PATCH. Con los términos bloqueados (cupón con usos) no se
 * envían código, tipo ni valor: la API los rechazaría aunque no cambien.
 */
export function toApiCouponBody(draft: CouponDraft, termsLocked: boolean) {
  const terms = termsLocked ? {} : { code: draft.code, kind: draft.kind, value: draft.value };
  return {
    ...terms,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    maxUses: draft.maxUses,
    active: draft.active,
  };
}

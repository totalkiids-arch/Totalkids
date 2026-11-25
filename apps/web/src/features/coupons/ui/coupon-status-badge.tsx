import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import type { CouponStatus } from "../domain/coupon";

const TONE: Record<CouponStatus, StatusTone> = {
  active: "green",
  scheduled: "blue",
  exhausted: "yellow",
  expired: "neutral",
  inactive: "red",
};

/** Estado del cupón que calcula la API, con su texto: no depende solo del color. */
export function CouponStatusBadge({ status, label }: { status: CouponStatus; label: string }) {
  return <StatusBadge tone={TONE[status]}>{label}</StatusBadge>;
}

import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import type { CouponStatus } from "../domain/coupon";

const STATUS: Record<CouponStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Activo", tone: "green" },
  scheduled: { label: "Programado", tone: "blue" },
  exhausted: { label: "Agotado", tone: "yellow" },
  expired: { label: "Vencido", tone: "neutral" },
  inactive: { label: "Inactivo", tone: "red" },
};

/** Estado derivado del cupón (ver couponStatus): el texto no depende solo del color. */
export function CouponStatusBadge({ status }: { status: CouponStatus }) {
  const { label, tone } = STATUS[status];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

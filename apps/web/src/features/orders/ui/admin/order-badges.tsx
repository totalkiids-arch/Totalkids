import { PaymentStatusBadge, type PaymentStatus } from "@/features/payments";
import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import {
  ORDER_STATUS_LABEL,
  orderTone,
  type OrderStatus,
  type OrderTone,
} from "../../domain/order";

const ORDER_TONE: Record<OrderTone, StatusTone> = {
  success: "green",
  progress: "blue",
  waiting: "yellow",
  closed: "red",
};

/** Estado del pedido con los colores del listado del panel. */
export function AdminOrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <StatusBadge tone={ORDER_TONE[orderTone(status)]}>{ORDER_STATUS_LABEL[status]}</StatusBadge>
  );
}

/** Estado del pago del pedido (el de su último intento en Flow). */
export function AdminPaymentBadge({ status }: { status: PaymentStatus | null }) {
  return <PaymentStatusBadge status={status} srPrefix="Pago: " />;
}

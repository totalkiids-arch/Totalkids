import { ORDER_STATUS_LABEL, orderTone, type OrderStatus } from "../domain/order";

const DATE = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});
const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});

/** "10 de noviembre de 2026". */
export const formatDate = (iso: string) => DATE.format(new Date(iso));
/** "10 nov, 11:05". */
export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

const TONE = {
  success: "bg-soft-green text-brand-green",
  progress: "bg-soft-blue text-brand-blue",
  waiting: "bg-soft-yellow text-on-yellow",
  closed: "bg-soft-red text-brand-red-deep",
} as const;

/** Insignia con el estado del pedido. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-extrabold whitespace-nowrap ${TONE[orderTone(status)]}`}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

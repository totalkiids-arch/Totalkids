// API pública de la feature "orders". app/ y otras features importan solo desde aquí.
export { OrderTrackingScreen } from "./ui/order-tracking-screen";
export { GuestOrderLookup } from "./ui/guest-order-lookup";
export { AdminOrdersScreen } from "./ui/admin-orders-screen";
export { AdminOrderDetailScreen } from "./ui/admin-order-detail-screen";
export { exportAdminOrders } from "./container";

// Checkout (LN-11): credencial del pedido recién creado y su estado al volver de Flow.
export { getOrderForViewer, rememberGuestOrder } from "./container";
export { GuestOrderUnavailableError } from "./application/ports";
export type { Order, GuestPaymentStatus } from "./domain/order";

// Panel: resumen (lo muestra la feature "dashboard").
export { getPanelSummary } from "./container";
export { ORDER_STATUS_LABEL, ORDER_STATUSES, orderTotal, type OrderStatus } from "./domain/order";
export { AdminOrderStatusBadge, AdminPaymentBadge } from "./ui/admin/order-badges";

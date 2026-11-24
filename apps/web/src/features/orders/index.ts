// API pública de la feature "orders". app/ y otras features importan solo desde aquí.
export { OrderTrackingScreen } from "./ui/order-tracking-screen";
export { GuestOrderLookup } from "./ui/guest-order-lookup";
export { AdminOrdersScreen } from "./ui/admin-orders-screen";
export { AdminOrderDetailScreen } from "./ui/admin-order-detail-screen";
export { exportAdminOrdersCsv } from "./container";

// Checkout (LN-11): credencial del pedido recién creado y su estado al volver de Flow.
export { getOrderForViewer, rememberGuestOrder } from "./container";
export { GuestOrderUnavailableError } from "./application/ports";
export type { Order, GuestPaymentStatus } from "./domain/order";

// Panel: resumen (transitorio hasta la etapa 3 de LN-16).
export { getAdminOrdersOverview } from "./container";

// Panel: reportes de ventas (lo compone la página de /admin/reportes).
export { listSalesForReports } from "./container";

// Panel: historial de actividad (lo compone la página de /admin/actividad).
export { listActivity as listOrderActivity } from "./container";
export { ORDER_STATUS_LABEL, ORDER_STATUSES, orderTotal, type OrderStatus } from "./domain/order";
export { AdminOrderStatusBadge, AdminPaymentBadge } from "./ui/admin/order-badges";

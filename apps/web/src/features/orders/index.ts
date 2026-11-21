// API pública de la feature "orders". app/ y otras features importan solo desde aquí.
export { OrderHistoryScreen } from "./ui/order-history-screen";
export { OrderTrackingScreen } from "./ui/order-tracking-screen";
export { GuestOrderLookup } from "./ui/guest-order-lookup";
export { AdminOrdersScreen } from "./ui/admin-orders-screen";
export { AdminOrderDetailScreen } from "./ui/admin-order-detail-screen";
export { exportAdminOrdersCsv } from "./container";

// Panel: pagos y resumen (Tanda A).
export { getAdminOrdersOverview, listPaymentAttempts } from "./container";

// Panel: reportes de ventas (lo compone la página de /admin/reportes).
export { listSalesForReports } from "./container";
export { reconcilePaymentAction } from "./ui/admin-order-actions";
export { ORDER_STATUS_LABEL, ORDER_STATUSES, orderTotal, type OrderStatus } from "./domain/order";
export { AdminOrderStatusBadge, AdminPaymentBadge } from "./ui/admin/order-badges";

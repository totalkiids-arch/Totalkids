// API pública de la feature "newsletter". app/ y otras features importan solo desde aquí.
export { SubscriptionScreen } from "./ui/subscription-screen";
export { SubscribersScreen } from "./ui/subscribers-screen";
export { exportSubscribersCsv } from "./container";

// Panel: historial de actividad (lo compone la página de /admin/actividad).
export { listActivity as listSubscriberActivity } from "./container";

// API pública de la feature "emails". app/ y otras features importan solo desde aquí.
export { EmailsScreen } from "./ui/emails-screen";

// Panel: historial de actividad (lo compone la página de /admin/actividad).
export { listActivity as listEmailActivity } from "./container";

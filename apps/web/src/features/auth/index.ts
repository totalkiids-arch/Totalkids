// API pública de la feature "auth": solo el ingreso del equipo al panel.
// app/ y otras features importan solo desde aquí.
export { AdminLoginScreen } from "./ui/admin-login-screen";
export { getAdminSession } from "./container";
export { AdminSignOutButton } from "./ui/admin-sign-out-button";
export { AdminSectionGate } from "./ui/admin-section-gate";
export type { AdminSession } from "./application/admin-session";

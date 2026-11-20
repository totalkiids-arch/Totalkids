// API pública de la feature "auth". app/ y otras features importan solo desde aquí.
export { LoginScreen } from "./ui/login-screen";
export { RegisterScreen } from "./ui/register-screen";
export { RecoverAccessScreen } from "./ui/recover-access-screen";
export { ResetPasswordScreen } from "./ui/reset-password-screen";
export { AdminLoginScreen } from "./ui/admin-login-screen";
export { getAdminSession, getCurrentBuyer } from "./container";
export { logoutAction } from "./ui/auth-actions";
export { firstName, type Buyer } from "./domain/session";
export { AdminSignOutButton } from "./ui/admin-sign-out-button";
export { AdminSectionGate } from "./ui/admin-section-gate";
export type { AdminSession } from "./application/admin-session";

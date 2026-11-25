// API pública de la feature "users". app/ y otras features importan solo desde aquí.
export { UsersScreen } from "./ui/users-screen";
export { handleSaveUser, handleToggleUser, type UserFormState } from "./ui/user-form-handlers";
export {
  ADMIN_ROLE_LABEL,
  ADMIN_ROLES,
  ADMIN_SECTIONS,
  canAccessSection,
  isAdminRole,
  OPERATOR_SECTIONS,
  type AdminRole,
  type AdminSection,
} from "./domain/admin-role";

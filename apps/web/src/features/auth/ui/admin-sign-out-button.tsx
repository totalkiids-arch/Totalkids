import { ExitIcon } from "@/shared/ui/icons";

import { signOutDemoAction } from "./admin-session-actions";

/**
 * «Cerrar sesión» del pie del menú. Es un formulario: funciona sin JavaScript.
 * El layout del panel lo entrega a AdminShell (shared no depende de features).
 */
export function AdminSignOutButton() {
  return (
    <form action={signOutDemoAction}>
      <button
        type="submit"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-3.5 text-sm font-extrabold text-brand-red hover:bg-soft-red"
      >
        <ExitIcon size={18} />
        Cerrar sesión
      </button>
    </form>
  );
}

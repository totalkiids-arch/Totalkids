import type { ReactNode } from "react";

import { canAccessSection, type AdminSection } from "@/features/users";
import { ButtonLink } from "@/shared/ui/button";

import { getAdminSession } from "../container";

/**
 * Muestra la pantalla solo si el rol puede ver la sección; si no, un aviso
 * (p. ej. el operador que escribe /admin/usuarios en la barra, CA-07).
 * Es interfaz: la autorización real la aplica el backend (RF-31, LN-04).
 */
export async function AdminSectionGate({
  section,
  children,
}: {
  section: AdminSection;
  children: ReactNode;
}) {
  const session = await getAdminSession();
  if (session && canAccessSection(session.role, section)) return children;

  return (
    <section aria-labelledby="acceso-restringido" className="flex max-w-2xl flex-col gap-4">
      <h1 id="acceso-restringido" className="font-heading text-3xl font-extrabold sm:text-4xl">
        Acceso restringido en la demo
      </h1>
      <p className="text-lg text-text-body">
        El rol Operador gestiona pedidos y solicitudes. Catálogo, configuración y usuarios requieren
        el rol Administrador.
      </p>
      <ButtonLink href="/admin" className="self-start">
        Volver al resumen
      </ButtonLink>
    </section>
  );
}

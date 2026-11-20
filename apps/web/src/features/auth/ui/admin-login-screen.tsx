import { ADMIN_ROLE_LABEL, ADMIN_ROLES } from "@/features/users";
import { Logo } from "@/shared/ui/brand/logo";
import { Button, ButtonLink } from "@/shared/ui/button";
import { SelectField, TextField } from "@/shared/ui/form";
import { AlertIcon } from "@/shared/ui/icons";

import { signInDemoAction } from "./admin-session-actions";

const ROLE_OPTIONS = ADMIN_ROLES.map((role) => ({ value: role, label: ADMIN_ROLE_LABEL[role] }));

/**
 * Panel administrativo · Acceso por rol (DEMOSTRACIÓN).
 * Solo se envía el rol elegido. Correo y contraseña son de ejemplo: no llevan
 * `name`, así que no salen del navegador. El ingreso real llega en LN-04.
 */
export function AdminLoginScreen() {
  return (
    <div className="mx-auto grid w-full max-w-[960px] items-center gap-4 min-[761px]:grid-cols-2 min-[761px]:gap-16">
      <section aria-labelledby="bienvenida-panel" className="flex flex-col gap-4">
        <Logo size="lg" className="max-[760px]:hidden" />
        <h1
          id="bienvenida-panel"
          className="font-heading text-[33px] leading-[1.05] font-extrabold min-[761px]:text-[52px]"
        >
          Todo para hacer crecer tu tienda.
        </h1>
        <p className="text-[15px] text-text-body min-[761px]:text-lg">
          Pedidos, muebles y pequeños detalles. Administra Total Kids desde un mismo lugar.
        </p>
        <p className="text-sm text-text-secondary">Elige un rol para recorrer sus pantallas.</p>
        <ButtonLink href="/" variant="light" className="self-start">
          Ver tienda
        </ButtonLink>
      </section>

      <section
        aria-labelledby="titulo-ingreso"
        className="rounded-[22px] bg-surface p-[22px] shadow-[0_2px_0_var(--color-border),0_10px_30px_-22px_rgb(31_42_68/0.35)] min-[761px]:rounded-[28px] min-[761px]:p-8"
      >
        <h2 id="titulo-ingreso" className="font-heading text-[30px] leading-tight font-extrabold">
          Bienvenido al panel
        </h2>
        <p
          role="note"
          className="mt-3 flex items-start gap-2 rounded-2xl bg-cream px-4 py-3 text-sm font-bold text-on-yellow"
        >
          <AlertIcon size={18} className="mt-0.5 shrink-0 text-yellow-ink" />
          Acceso simulado: no hay usuarios ni contraseñas reales y no protege datos. Solo se guarda
          el rol elegido en este navegador.
        </p>
        <form action={signInDemoAction} className="mt-5 flex flex-col gap-4">
          <SelectField
            label="Entrar a la demo como"
            name="rol"
            options={ROLE_OPTIONS}
            defaultValue="admin"
            required
            className="[&_select]:w-full"
          />
          <TextField
            label="Correo electrónico"
            type="email"
            defaultValue="admin@example.com"
            autoComplete="email"
            required
          />
          <TextField
            label="Contraseña de ejemplo"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            hint="Escribe cualquier texto de 8 caracteres o más. No se envía ni se guarda."
          />
          <Button type="submit" className="mt-1 w-full">
            Entrar a la demo
          </Button>
        </form>
      </section>
    </div>
  );
}

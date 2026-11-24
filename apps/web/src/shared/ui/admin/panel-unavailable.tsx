import { buttonClasses } from "@/shared/ui/button";
import { AlertIcon } from "@/shared/ui/icons";

/**
 * El servidor del panel (API) no responde: aviso a pantalla completa, sin menú
 * ni datos. No manda al ingreso, porque la sesión puede seguir vigente.
 * «Reintentar» es un enlace normal: recarga la página sin JavaScript.
 */
export function PanelUnavailable({ retryHref = "/admin" }: { retryHref?: string }) {
  return (
    <div className="flex min-h-dvh items-center bg-background pattern-dots px-[18px] py-10">
      <main
        id="contenido"
        aria-labelledby="panel-no-disponible"
        className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-[28px] bg-surface p-8 shadow-[0_2px_0_var(--color-border),0_10px_30px_-22px_rgb(31_42_68/0.35)]"
      >
        <AlertIcon size={32} className="text-yellow-ink" />
        <h1 id="panel-no-disponible" className="font-heading text-3xl font-extrabold">
          El panel no está disponible
        </h1>
        <p className="text-lg text-text-body">
          No pudimos conectar con el servidor del panel. Tus datos no se modificaron. Intenta de
          nuevo en unos minutos.
        </p>
        <a href={retryHref} className={buttonClasses({ className: "self-start" })}>
          Reintentar
        </a>
      </main>
    </div>
  );
}

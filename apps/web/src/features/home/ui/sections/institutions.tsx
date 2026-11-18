import { site } from "@/shared/config/site";
import { ButtonLink } from "@/shared/ui/button";
import { ChatIcon } from "@/shared/ui/icons";

import { Classroom } from "../illustrations";

/** Llamado para jardines, salas cuna y colegios (servicios especiales, RF-24). */
export function Institutions() {
  return (
    <section aria-labelledby="instituciones" className="mx-auto max-w-7xl px-4 pt-12 pb-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-8 rounded-[28px] bg-surface px-6 py-8 shadow-[0_2px_0_var(--color-border)] sm:rounded-[40px] sm:px-12 sm:py-10">
        <Classroom
          label="Sala de clases infantil con mesa hexagonal y sillas"
          className="h-auto w-[320px] max-w-full flex-[0_1_320px]"
        />
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
          <p className="self-start rounded-full bg-cream px-3.5 py-1.5 text-[13px] font-extrabold tracking-[1.5px] text-yellow-ink uppercase">
            Jardines · Salas cuna · Colegios
          </p>
          <h2
            id="instituciones"
            className="text-[clamp(1.875rem,4vw,2.5rem)] leading-[1.08] font-extrabold"
          >
            ¿Equipas una sala de clases o un jardín infantil?
          </h2>
          <p className="text-[17px] text-text-body">
            Armamos tu proyecto completo: mesas grupales, sillas apilables, casilleros y rincones de
            lectura. Cotización formal con factura.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <ButtonLink href="/servicios/solicitar" variant="danger">
              Solicitar cotización
            </ButtonLink>
            {site.whatsapp ? (
              <a
                href={`https://wa.me/${site.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-extrabold text-text-primary hover:bg-soft-green"
              >
                <ChatIcon size={20} className="text-brand-green" />
                Escríbenos por WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";

import { site } from "@/shared/config/site";
import { Tito } from "@/shared/ui/brand/tito";
import { ArrowLeftIcon, ClockIcon, MailIcon, PhoneIcon } from "@/shared/ui/icons";

import { isServiceId } from "../domain/services";
import { ServiceRequestForm } from "./service-request-form";

/**
 * Tienda y compra · Solicitar servicio (RF-24). `servicio` llega desde la
 * tarjeta elegida en /servicios y deja preseleccionado el servicio.
 */
export function ServiceRequestScreen({ service }: { service?: string }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-6 px-4 py-8 sm:px-6">
      <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
        <Link href="/servicios" className="flex items-center gap-1.5 self-start font-extrabold">
          <ArrowLeftIcon size={18} />
          Servicios especiales
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-[38px] leading-tight font-extrabold sm:text-[46px]">
            Cuéntanos tu idea
          </h1>
          <p className="text-text-secondary">
            Armado, diseño, personalización, instituciones, regalos y garantía.
          </p>
        </div>
        <section
          aria-label="Formulario de solicitud"
          className="rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7"
        >
          <ServiceRequestForm initialService={isServiceId(service) ? service : null} />
        </section>
      </div>

      <aside
        aria-labelledby="prefieres-hablar"
        className="flex max-w-full flex-[1_1_320px] flex-col gap-3 rounded-[32px] bg-brand-yellow p-7 lg:sticky lg:top-6"
      >
        <Tito className="w-20" />
        <h2 id="prefieres-hablar" className="text-[26px] font-extrabold">
          ¿Prefieres hablar?
        </h2>
        <p className="flex items-center gap-2.5 font-bold">
          <PhoneIcon className="shrink-0" /> {site.phone}
        </p>
        <p className="flex items-center gap-2.5 font-bold">
          <MailIcon className="shrink-0" /> {site.email}
        </p>
        <p className="flex items-center gap-2.5 font-bold">
          <ClockIcon className="shrink-0" /> {site.hours}
        </p>
      </aside>
    </div>
  );
}

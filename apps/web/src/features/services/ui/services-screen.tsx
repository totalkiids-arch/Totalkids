import Link from "next/link";
import type { ComponentType } from "react";

import { site } from "@/shared/config/site";
import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";
import {
  ArrowRightIcon,
  ChatIcon,
  ClockIcon,
  GridIcon,
  HeartIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  SchoolIcon,
  StarIcon,
  ToolIcon,
} from "@/shared/ui/icons";

import { SERVICE_STEPS, SERVICES, type ServiceId } from "../domain/services";

/** Ícono y colores de cada tarjeta, como en la maqueta. */
const LOOK: Record<
  ServiceId,
  { Icon: ComponentType<{ size?: number }>; card: string; tile: string }
> = {
  armado: { Icon: ToolIcon, card: "bg-soft-red", tile: "bg-brand-red text-white" },
  diseno: { Icon: GridIcon, card: "bg-soft-blue", tile: "bg-brand-blue text-white" },
  personalizacion: {
    Icon: PencilIcon,
    card: "bg-cream",
    tile: "bg-brand-yellow text-brand-navy",
  },
  instituciones: { Icon: SchoolIcon, card: "bg-soft-green", tile: "bg-brand-green text-white" },
  regalos: { Icon: HeartIcon, card: "bg-soft-purple", tile: "bg-brand-purple text-white" },
  garantia: { Icon: StarIcon, card: "bg-surface", tile: "bg-brand-navy text-white" },
};

const FAQ = [
  { question: "¿Arman en regiones?", answer: "[INDICA LAS ZONAS DE COBERTURA]" },
  { question: "¿Cuánto demora el armado?", answer: "Depende del mueble: [TIEMPOS ESTIMADOS]." },
  {
    question: "¿Puedo personalizar colores?",
    answer: "Sí, en los productos marcados como personalizables. [CONDICIONES]",
  },
] as const;

/** Tienda y compra · Servicios especiales (RF-24). */
export function ServicesScreen() {
  return (
    <>
      <section aria-labelledby="servicios-titulo" className="bg-soft-yellow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-12 sm:px-6">
          <div className="flex max-w-xl flex-col items-start gap-4">
            <p className="text-sm font-extrabold tracking-[2px] text-brand-red uppercase">
              Más que muebles
            </p>
            <h1
              id="servicios-titulo"
              className="text-[clamp(2.5rem,6vw,4rem)] leading-none font-extrabold"
            >
              Servicios especiales
            </h1>
            <p className="text-lg text-text-body">
              Armamos, diseñamos y personalizamos espacios infantiles para que aprender jugando
              empiece desde el primer día.
            </p>
            <ButtonLink href="/servicios/solicitar" variant="danger" size="lg">
              Agenda tu servicio
              <ArrowRightIcon size={20} />
            </ButtonLink>
          </div>
          <div className="flex flex-col items-center gap-2 motion-safe:animate-float">
            <span className="rounded-2xl bg-surface px-4 py-2 font-heading text-lg font-bold shadow-[0_4px_0_var(--color-ochre)]">
              ¡Yo traigo las herramientas!
            </span>
            <Tito className="w-40" />
          </div>
        </div>
      </section>

      <section aria-labelledby="en-que-ayudamos" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h2
          id="en-que-ayudamos"
          className="mb-6 text-[clamp(2rem,4vw,2.625rem)] leading-tight font-extrabold"
        >
          ¿En qué te ayudamos?
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {SERVICES.map((service) => {
            const { Icon, card, tile } = LOOK[service.id];
            return (
              <li key={service.id}>
                <article
                  aria-labelledby={`servicio-${service.id}`}
                  className={`flex h-full flex-col gap-3 rounded-[32px] p-6 shadow-[0_2px_0_var(--color-border)] transition-transform motion-safe:hover:-translate-y-1 ${card}`}
                >
                  <span
                    aria-hidden
                    className={`flex size-14 items-center justify-center rounded-2xl ${tile}`}
                  >
                    <Icon size={30} />
                  </span>
                  <h3 id={`servicio-${service.id}`} className="text-2xl font-extrabold">
                    {service.title}
                  </h3>
                  <p className="text-text-body">{service.description}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {service.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span aria-hidden className="font-extrabold text-brand-green">
                          ✓
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                    <strong className="font-heading text-lg">{service.price}</strong>
                    <ButtonLink
                      href={{ pathname: "/servicios/solicitar", query: { servicio: service.id } }}
                      variant="dark"
                    >
                      Lo quiero<span className="sr-only">: {service.title}</span>
                    </ButtonLink>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="como-funciona" className="bg-brand-navy text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <h2
            id="como-funciona"
            className="mb-6 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-extrabold"
          >
            Así de fácil, como contar 1, 2, 3… ¡4!
          </h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
            {SERVICE_STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span
                  aria-hidden
                  className="flex size-12 items-center justify-center rounded-2xl bg-brand-yellow font-heading text-2xl font-extrabold text-brand-navy"
                >
                  {i + 1}
                </span>
                <strong className="font-heading text-xl">{step.title}</strong>
                <span className="text-on-dark">{step.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-6 px-4 py-12 sm:px-6">
        <section
          aria-labelledby="prefieres-hablar"
          className="flex flex-[1_1_320px] flex-col gap-3 rounded-[32px] bg-brand-yellow p-7"
        >
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
          {site.whatsapp ? (
            <a
              href={`https://wa.me/${site.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-brand-navy px-6 font-extrabold text-white"
            >
              <ChatIcon />
              Escribir por WhatsApp
            </a>
          ) : (
            <Link
              href="/servicios/solicitar"
              className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-brand-navy px-6 font-extrabold text-white"
            >
              <ChatIcon />
              Escríbenos
            </Link>
          )}
        </section>

        <section
          aria-labelledby="preguntas-frecuentes"
          className="flex flex-[999_1_480px] flex-col gap-3 rounded-[32px] bg-surface p-7 shadow-[0_2px_0_var(--color-border)]"
        >
          <h2 id="preguntas-frecuentes" className="text-[26px] font-extrabold">
            Preguntas frecuentes
          </h2>
          {FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border-2 border-chip-border px-4 py-3 open:border-brand-blue"
            >
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-extrabold [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden className="text-xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pt-2 text-text-body">{item.answer}</p>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}

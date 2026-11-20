import { ButtonLink } from "@/shared/ui/button";
import { AlertIcon, MailIcon, ToolIcon } from "@/shared/ui/icons";

import { POLICY_SECTIONS } from "../domain/policies";

/** Enlaces a cada sección. Área táctil de 44 px (RNF-09). */
function SectionLinks({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-col ${className}`}>
      {POLICY_SECTIONS.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex min-h-11 items-center rounded-xl px-3 font-bold hover:bg-soft-blue"
          >
            {section.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Tienda y compra · Políticas: condiciones de compra, despacho y privacidad. */
export function PoliciesScreen() {
  return (
    <>
      <section aria-labelledby="politicas-titulo" className="bg-soft-blue">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-12 sm:px-6">
          <h1
            id="politicas-titulo"
            className="text-[clamp(2.25rem,5vw,3.5rem)] leading-none font-extrabold"
          >
            Condiciones y privacidad
          </h1>
          <p className="max-w-2xl text-lg text-text-body">
            Cómo compras, recibes y cuidamos tus datos en Total Kids.
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[240px_1fr]">
        {/* Teléfono: índice plegable, para no empujar el contenido. Escritorio: fijo al costado. */}
        <details className="group rounded-2xl border-2 border-chip-border bg-surface lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-extrabold [&::-webkit-details-marker]:hidden">
            En esta página
            <span aria-hidden className="text-xl transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <SectionLinks className="px-2 pb-2" />
        </details>
        <nav
          aria-label="En esta página"
          className="hidden lg:sticky lg:top-6 lg:block lg:self-start"
        >
          <p className="mb-2 px-3 font-extrabold text-text-secondary">En esta página</p>
          <SectionLinks />
        </nav>

        <article className="flex max-w-[65ch] flex-col gap-8">
          <p
            role="note"
            className="flex gap-3 rounded-2xl border-2 border-brand-yellow bg-soft-yellow p-4 text-text-body"
          >
            <AlertIcon className="mt-0.5 shrink-0 text-brand-navy" />
            Contenido provisional. Total Kids debe aportar y aprobar las políticas definitivas antes
            de publicar el sitio.
          </p>

          {POLICY_SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-titulo`}
              className="flex scroll-mt-6 flex-col gap-3"
            >
              <h2 id={`${section.id}-titulo`} className="text-[26px] leading-tight font-extrabold">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-text-body">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <div className="flex flex-wrap gap-4 rounded-[32px] bg-surface p-6 shadow-[0_2px_0_var(--color-border)]">
            <ButtonLink href="/suscripcion" variant="light">
              <MailIcon />
              Gestionar suscripción
            </ButtonLink>
            <ButtonLink
              href={{ pathname: "/servicios/solicitar", query: { servicio: "garantia" } }}
              variant="dark"
            >
              <ToolIcon />
              Solicitar ayuda o garantía
            </ButtonLink>
          </div>
        </article>
      </div>
    </>
  );
}

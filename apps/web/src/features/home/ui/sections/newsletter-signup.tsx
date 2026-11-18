import Form from "next/form";

/**
 * Alta al newsletter. Lleva a /suscripcion con el correo y el consentimiento, donde se
 * completa el alta (UI-08). El consentimiento NO viene marcado (RF-35).
 */
export function NewsletterSignup() {
  return (
    <section aria-labelledby="newsletter" className="mx-auto max-w-7xl px-4 pt-14 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-brand-yellow px-6 py-8 sm:rounded-[40px] sm:px-12 sm:py-10">
        <div className="min-w-0 flex-[1_1_380px]">
          <h2
            id="newsletter"
            className="text-[clamp(1.75rem,3.5vw,2.25rem)] leading-tight font-extrabold"
          >
            Súmate al club Total Kids
          </h2>
          <p className="mt-1.5 text-[17px] text-on-yellow">
            Recibe ofertas, lanzamientos e ideas para aprender jugando en casa.
          </p>
        </div>
        <Form action="/suscripcion" className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-[1_1_240px] flex-col gap-1.5 text-sm font-extrabold">
              Tu correo
              <input
                name="correo"
                type="email"
                required
                autoComplete="email"
                placeholder="nombre@correo.cl"
                className="h-13 rounded-full border-2 border-brand-navy bg-surface px-5 text-base text-text-primary placeholder:text-text-secondary"
              />
            </label>
            <button
              type="submit"
              className="h-13 rounded-full bg-brand-navy px-7 font-extrabold text-white"
            >
              Suscribirme
            </button>
          </div>
          <label className="flex items-start gap-2.5 text-sm font-bold text-brand-navy">
            <input
              name="consentimiento"
              type="checkbox"
              value="si"
              required
              className="mt-0.5 size-5 shrink-0 accent-brand-navy"
            />
            Acepto recibir correos de Total Kids. Puedo darme de baja cuando quiera.
          </label>
        </Form>
      </div>
    </section>
  );
}

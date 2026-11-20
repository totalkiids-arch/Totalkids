import { Tito } from "@/shared/ui/brand/tito";

import { isConsentGiven } from "../domain/subscription";
import { SubscribeForm, UnsubscribeForm } from "./subscription-forms";

interface SubscriptionScreenProps {
  /** Correo escrito en la portada o en el enlace de baja de un correo. */
  email?: string;
  /** Casilla de consentimiento tal como la dejó el comprador en la portada. */
  consent?: string;
  /** "1" cuando se llega desde el enlace "darme de baja" de un correo. */
  unsubscribe?: string;
}

/** Tienda y compra · Suscripción y baja del newsletter (RF-25, RF-35). */
export function SubscriptionScreen({ email, consent, unsubscribe }: SubscriptionScreenProps) {
  const initialEmail = (email ?? "").slice(0, 254);
  const leaving = unsubscribe === "1";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-5 rounded-[32px] bg-brand-yellow px-6 py-7 sm:px-9">
        <Tito className="w-20 shrink-0" />
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-tight font-extrabold">
            Novedades para crecer jugando
          </h1>
          <p className="text-lg text-on-yellow">
            Ofertas, lanzamientos e ideas para aprender jugando. Solo con tu permiso y con baja
            cuando quieras.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-6">
        {leaving ? (
          <>
            <UnsubscribeForm initialEmail={initialEmail} />
            <SubscribeForm initialEmail="" initialConsent={false} />
          </>
        ) : (
          <>
            <SubscribeForm initialEmail={initialEmail} initialConsent={isConsentGiven(consent)} />
            <UnsubscribeForm initialEmail="" />
          </>
        )}
      </div>
    </div>
  );
}

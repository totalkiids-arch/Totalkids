import Link from "next/link";

import { Tito } from "@/shared/ui/brand/tito";

/** Invitación a pedir asesoría (servicios especiales). */
export function AdviceCard() {
  return (
    <div className="flex items-center gap-3 rounded-[28px] bg-brand-yellow p-5">
      <Tito className="w-18 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-heading text-lg leading-tight font-extrabold">
          ¿No sabes qué altura elegir?
        </p>
        <Link
          href="/servicios"
          className="rounded font-extrabold text-brand-navy underline underline-offset-2"
        >
          Pide asesoría gratis
        </Link>
      </div>
    </div>
  );
}

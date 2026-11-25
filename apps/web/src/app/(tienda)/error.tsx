"use client";

import { Tito } from "@/shared/ui/brand/tito";
import { Button, ButtonLink } from "@/shared/ui/button";

/**
 * Error de una página de la tienda (p. ej. la API del catálogo no responde).
 * Nunca se muestran precios ni productos inventados: se ofrece reintentar.
 */
export default function StoreError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6"
    >
      <Tito className="w-28" />
      <h1 className="text-4xl font-extrabold">No pudimos cargar esta página</h1>
      <p className="text-[17px] text-text-body">
        Tuvimos un problema para mostrar el catálogo. Intenta de nuevo en unos segundos.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={reset}>
          Reintentar
        </Button>
        <ButtonLink href="/" variant="light" size="lg">
          Ir al inicio
        </ButtonLink>
      </div>
    </section>
  );
}

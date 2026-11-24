"use client";

import { Button } from "@/shared/ui/button";

/**
 * Una sección del panel no pudo cargar (API caída, timeout o respuesta
 * inesperada). En producción Next oculta el detalle del error, así que el
 * mensaje es general; nunca se muestran datos de reemplazo.
 */
export default function PanelSectionError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section aria-labelledby="seccion-con-error" className="flex max-w-2xl flex-col gap-4">
      <h1 id="seccion-con-error" className="font-heading text-3xl font-extrabold sm:text-4xl">
        No pudimos cargar esta sección
      </h1>
      <p className="text-lg text-text-body">
        El servidor del panel no respondió o tuvo un problema. Intenta de nuevo en unos minutos.
      </p>
      <Button onClick={() => retry()} className="self-start">
        Reintentar
      </Button>
    </section>
  );
}

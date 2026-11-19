import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";

/** Ficha inexistente o despublicada: devuelve al catálogo sin callejón sin salida. */
export function ProductNotFound() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
      <Tito className="w-28" />
      <h1 className="text-4xl font-extrabold">No encontramos este producto</h1>
      <p className="text-[17px] text-text-body">
        Puede que ya no esté disponible o que el enlace tenga un error. Te ayudamos a encontrar otro
        mueble para su pieza.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/catalogo" size="lg">
          Ver catálogo
        </ButtonLink>
        <ButtonLink href="/" variant="light" size="lg">
          Ir al inicio
        </ButtonLink>
      </div>
    </section>
  );
}

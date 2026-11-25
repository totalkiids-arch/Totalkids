import { ButtonLink } from "@/shared/ui/button";

export default function NotFound() {
  return (
    <section aria-labelledby="producto-no-encontrado" className="flex max-w-2xl flex-col gap-4">
      <h1 id="producto-no-encontrado" className="font-heading text-3xl font-extrabold sm:text-4xl">
        No encontramos este producto
      </h1>
      <p className="text-lg text-text-body">
        El enlace no corresponde a ningún producto del catálogo. Búscalo en el listado de productos.
      </p>
      <ButtonLink href="/admin/productos" className="self-start">
        Volver a productos
      </ButtonLink>
    </section>
  );
}

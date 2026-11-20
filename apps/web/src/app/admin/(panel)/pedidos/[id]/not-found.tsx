import { ButtonLink } from "@/shared/ui/button";

export default function NotFound() {
  return (
    <section aria-labelledby="pedido-no-encontrado" className="flex max-w-2xl flex-col gap-4">
      <h1 id="pedido-no-encontrado" className="font-heading text-3xl font-extrabold sm:text-4xl">
        No encontramos este pedido
      </h1>
      <p className="text-lg text-text-body">
        El enlace no corresponde a ningún pedido de demostración. Revisa el número en el listado.
      </p>
      <ButtonLink href="/admin/pedidos" className="self-start">
        Volver a pedidos
      </ButtonLink>
    </section>
  );
}

import { ElephantWithRope, JumpingLion, PeekingGiraffe, SwingingMonkey } from "./parade-animals";

/**
 * Pantalla de carga de la tienda: en vez de la rueda típica, los animales del
 * logo en fila (la jirafa, el mono en su liana, el león saltando y el elefante
 * tirando de los banderines). Con prefers-reduced-motion quedan quietos.
 */
export function PageLoader() {
  return (
    <div
      role="status"
      className="mx-auto flex min-h-[55vh] max-w-7xl flex-col items-center justify-center gap-5 px-4 py-12"
    >
      <div aria-hidden className="loader-animals flex items-end justify-center gap-3 sm:gap-5">
        <span className="loader-animal loader-animal--giraffe">
          <PeekingGiraffe />
        </span>
        <span className="loader-animal loader-animal--monkey">
          <SwingingMonkey />
        </span>
        <span className="loader-animal loader-animal--lion">
          <JumpingLion />
        </span>
        <span className="loader-animal loader-animal--elephant">
          <ElephantWithRope />
        </span>
      </div>
      <p className="font-heading text-xl font-extrabold text-text-primary">
        Cargando
        <span className="loader-dots" aria-hidden />
      </p>
    </div>
  );
}

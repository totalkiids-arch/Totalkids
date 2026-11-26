"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ElephantWithRope, JumpingLion, PeekingGiraffe, SwingingMonkey } from "./parade-animals";

/** Duración del desfile más largo (ver las clases parade-* en globals.css). */
const PARADE_MS = 2_600;

/** Un animal distinto en cada cambio de página, en este orden. */
const ACTS = [
  { id: "elefante", className: "parade-act parade-act--walk", Animal: ElephantWithRope },
  { id: "leon", className: "parade-act parade-act--hop", Animal: JumpingLion },
  { id: "mono", className: "parade-act parade-act--swing", Animal: SwingingMonkey },
  { id: "jirafa", className: "parade-act parade-act--peek", Animal: PeekingGiraffe },
] as const;

/**
 * Última página vista y desfiles hechos, fuera del componente: la tienda y la
 * consulta de pedidos tienen layouts distintos y al pasar de uno a otro el
 * componente se vuelve a montar.
 */
let lastPath: string | null = null;
let paradesDone = 0;

/**
 * Desfile de animales al cambiar de página en la tienda. Es decorativo: no
 * bloquea clics, los lectores de pantalla lo ignoran y no aparece al cargar
 * la primera página ni si el usuario prefiere menos movimiento.
 */
export function AnimalParade() {
  const pathname = usePathname();
  // Primera carga del sitio: se toma la página actual como vista, sin desfile.
  const [seenPath, setSeenPath] = useState(() => lastPath ?? pathname);
  const [run, setRun] = useState(() => paradesDone);
  const [finished, setFinished] = useState(() => paradesDone);

  // Cambió la página: arranca el siguiente animal (ajuste durante el render).
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setRun(run + 1);
  }

  useEffect(() => {
    lastPath = pathname;
    paradesDone = run;
  }, [pathname, run]);

  useEffect(() => {
    if (run === finished) return;
    const timer = setTimeout(() => setFinished(run), PARADE_MS);
    return () => clearTimeout(timer);
  }, [run, finished]);

  if (run === 0 || finished === run) return null;
  const act = ACTS[(run - 1) % ACTS.length] ?? ACTS[0];
  return (
    <div aria-hidden className="parade" key={run}>
      <div className={act.className} data-animal={act.id}>
        <act.Animal />
      </div>
    </div>
  );
}

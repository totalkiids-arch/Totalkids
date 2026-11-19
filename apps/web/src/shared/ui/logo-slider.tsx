"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";

import { PauseIcon, PlayIcon } from "./icons";

export interface LogoItem {
  src: StaticImageData;
  alt: string;
}

interface LogoSliderProps {
  /** Nombre accesible de la lista de logos. */
  label: string;
  logos: readonly LogoItem[];
  /** Milisegundos entre avances automáticos. */
  interval?: number;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** Ancho de un logo más el espacio entre logos: lo que avanza cada paso. */
function measureStep(track: HTMLElement | null) {
  const first = track?.firstElementChild as HTMLElement | null;
  if (!track || !first) return 0;
  return first.offsetWidth + parseFloat(getComputedStyle(track).columnGap || "0");
}

/**
 * Fila de logos con desplazamiento por "snap" (1 a 3 visibles según el ancho) y
 * un punto por posición. Avanza sola; se detiene al pasar el mouse, al enfocar o
 * con el botón Pausar, y no se mueve con prefers-reduced-motion. También se
 * puede deslizar con el dedo o con la rueda/trackpad.
 */
export function LogoSlider({ label, logos, interval = 3500 }: LogoSliderProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [positions, setPositions] = useState(logos.length);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const goTo = (index: number) => {
    trackRef.current?.scrollTo({
      left: index * measureStep(trackRef.current),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  // Posiciones posibles = logos - visibles + 1; cambia con el ancho.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      const width = measureStep(track);
      if (!width) return;
      const visible = Math.max(1, Math.round(track.clientWidth / width));
      setPositions(Math.max(1, logos.length - visible + 1));
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [logos.length]);

  const paused = userPaused || hovered || focused || reducedMotion;

  useEffect(() => {
    if (paused || positions <= 1) return;
    const timer = window.setInterval(() => {
      const track = trackRef.current;
      const width = measureStep(track);
      if (!width || !track) return;
      const current = Math.round(track.scrollLeft / width);
      track.scrollTo({
        left: (current + 1 >= positions ? 0 : current + 1) * width,
        behavior: "smooth",
      });
    }, interval);
    return () => window.clearInterval(timer);
  }, [paused, positions, interval]);

  const onScroll = () => {
    const track = trackRef.current;
    const width = measureStep(track);
    if (width && track) setActive(Math.min(positions - 1, Math.round(track.scrollLeft / width)));
  };

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  return (
    <div
      className="flex flex-col items-center gap-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <ul
        ref={trackRef}
        aria-label={label}
        onScroll={onScroll}
        className="scrollbar-none flex w-full snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain"
      >
        {logos.map((logo) => (
          <li
            key={logo.alt}
            className="flex h-32 shrink-0 basis-[calc((100%-1.5rem)/2)] snap-start items-center justify-center sm:h-36 lg:basis-[calc((100%-3rem)/3)]"
          >
            <Image
              src={logo.src}
              alt={logo.alt}
              sizes="(min-width: 1024px) 220px, 160px"
              className="max-h-24 w-auto max-w-[85%] object-contain sm:max-h-28"
            />
          </li>
        ))}
      </ul>

      {positions > 1 ? (
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap justify-center">
            {Array.from({ length: positions }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Ver logos desde el ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                className="group grid size-7 cursor-pointer place-items-center rounded-full"
              >
                <span
                  className={`block size-3 rounded-full border-2 border-brand-navy transition-colors ${
                    i === active ? "bg-brand-navy" : "bg-transparent group-hover:bg-brand-navy/30"
                  }`}
                />
              </button>
            ))}
          </div>
          {reducedMotion ? null : (
            <button
              type="button"
              onClick={() => setUserPaused((value) => !value)}
              aria-label={userPaused ? "Reanudar logos" : "Pausar logos"}
              className="grid size-9 cursor-pointer place-items-center rounded-full text-text-primary hover:bg-soft-yellow"
            >
              {userPaused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

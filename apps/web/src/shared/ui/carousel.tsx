"use client";

import { useRef, useState, type FocusEvent, type ReactNode, type TouchEvent } from "react";

import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "./icons";

export interface CarouselSlide {
  id: string;
  /** Nombre corto de la diapositiva para los puntos de navegación. */
  label: string;
  /** Clases del panel (normalmente el color de fondo). */
  className?: string;
  content: ReactNode;
}

interface CarouselProps {
  /** Nombre accesible del carrusel. */
  label: string;
  slides: readonly CarouselSlide[];
  /** Milisegundos por diapositiva en la rotación automática. */
  interval?: number;
  className?: string;
}

const SWIPE_THRESHOLD = 50;

/**
 * Carrusel accesible (patrón APG):
 * - Rota solo; se detiene al pasar el mouse, al enfocar un control o con el botón
 *   Pausar (WCAG 2.2.2). Con prefers-reduced-motion no rota ni anima.
 * - El avance lo marca la barra del punto activo: al terminar su animación se pasa
 *   a la siguiente, así pausar congela exactamente el tiempo restante.
 * - Las diapositivas se apilan en la misma celda: el alto lo fija la más alta y no
 *   hay saltos. Las ocultas quedan inert (sin foco ni lectura).
 */
export function Carousel({ label, slides, interval = 7000, className = "" }: CarouselProps) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = slides.length;
  const paused = userPaused || hovered || focused;
  const go = (next: number) => setIndex((next + count) % count);

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };
  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStartX.current;
    const end = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (start === null || end === undefined) return;
    const delta = end - start;
    if (Math.abs(delta) >= SWIPE_THRESHOLD) go(index + (delta < 0 ? 1 : -1));
  };

  return (
    <section
      aria-roledescription="carrusel"
      aria-label={label}
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <div
        aria-live={paused ? "polite" : "off"}
        className="grid"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${count}: ${slide.label}`}
              aria-hidden={!active}
              inert={!active}
              className={`col-start-1 row-start-1 transition-[opacity,visibility] duration-700 motion-reduce:transition-none ${
                active ? "visible opacity-100" : "invisible opacity-0"
              } ${slide.className ?? ""}`}
            >
              {slide.content}
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-6 pb-5 sm:px-12 sm:pb-8">
        <div className="flex items-center gap-1">
          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <button
                key={slide.id}
                type="button"
                aria-label={`Ver diapositiva ${i + 1}: ${slide.label}`}
                aria-current={active ? "true" : undefined}
                onClick={() => go(i)}
                className="group grid h-6 min-w-6 cursor-pointer place-items-center rounded-full px-0.5"
              >
                <span
                  className={`relative block h-2.5 overflow-hidden rounded-full transition-[width] duration-300 ${
                    active
                      ? "w-9 bg-surface"
                      : "w-2.5 bg-brand-navy/25 group-hover:bg-brand-navy/50"
                  }`}
                >
                  {active ? (
                    <span
                      key={index}
                      aria-hidden
                      onAnimationEnd={() => go(index + 1)}
                      style={{
                        animationDuration: `${interval}ms`,
                        animationPlayState: paused ? "paused" : "running",
                      }}
                      className="absolute inset-0 origin-left rounded-full bg-brand-navy motion-safe:animate-progress motion-reduce:hidden"
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUserPaused((value) => !value)}
            aria-label={userPaused ? "Reanudar carrusel" : "Pausar carrusel"}
            className={`${CONTROL} motion-reduce:hidden`}
          >
            {userPaused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
          </button>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Diapositiva anterior"
            className={CONTROL}
          >
            <ChevronLeftIcon size={20} />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Diapositiva siguiente"
            className={CONTROL}
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}

const CONTROL =
  "grid size-11 cursor-pointer place-items-center rounded-full bg-surface text-text-primary " +
  "shadow-[0_4px_0_var(--color-ochre)] transition-transform motion-safe:active:translate-y-1 active:shadow-none";

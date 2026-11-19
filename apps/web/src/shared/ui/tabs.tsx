"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** Color de la pestaña activa (texto blanco, contraste AA). */
const TONE = {
  blue: "aria-selected:bg-brand-blue",
  green: "aria-selected:bg-brand-green",
  red: "aria-selected:bg-brand-red",
  purple: "aria-selected:bg-brand-purple",
  navy: "aria-selected:bg-brand-navy",
} as const;

export interface TabItem {
  id: string;
  label: string;
  tone?: keyof typeof TONE;
  content: ReactNode;
}

interface TabsProps {
  /** Nombre del grupo para lectores de pantalla. */
  label: string;
  items: readonly TabItem[];
  className?: string;
}

/**
 * Pestañas accesibles (patrón APG con activación automática): las flechas,
 * Inicio y Fin mueven el foco y la selección; solo la pestaña activa entra en el
 * orden de tabulación. Todos los paneles se renderizan en el servidor y los
 * inactivos quedan `hidden`, así el contenido existe aunque falle JavaScript.
 */
export function Tabs({ label, items, className = "" }: TabsProps) {
  const baseId = useId();
  const [active, setActive] = useState(items[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const item = items[index];
    if (!item) return;
    setActive(item.id);
    tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((item) => item.id === active);
    const last = items.length - 1;
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="mb-5 flex flex-wrap gap-2"
      >
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              className={`min-h-11.5 rounded-full bg-cream px-5 py-2.5 text-[15px] font-extrabold text-text-primary not-aria-selected:hover:bg-soft-yellow aria-selected:text-white ${TONE[item.tone ?? "blue"]}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          tabIndex={0}
          hidden={item.id !== active}
          className="rounded-2xl"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

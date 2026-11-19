"use client";

import { useState } from "react";

import { Modal } from "@/shared/ui/modal";

import { countActiveFilters, toQueryString, type CatalogQuery } from "../domain/catalog-query";
import { CatalogFilters } from "./catalog-filters";

/** Botón "Filtrar" de móvil y tablet: abre los filtros en un modal desde abajo. */
export function MobileFilters({ query }: { query: CatalogQuery }) {
  const active = countActiveFilters(query);
  const current = toQueryString(query);
  // El modal recuerda la URL con que se abrió: cuando la navegación cambia la URL
  // (filtros aplicados), queda cerrado solo, sin competir con la navegación.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === current;
  const close = () => setOpenedAt(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedAt(current)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-2 rounded-full border-2 border-brand-navy bg-surface px-5 font-extrabold lg:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filtrar
        {active > 0 ? (
          <span className="rounded-full bg-brand-navy px-2 text-sm text-white">
            {active}
            <span className="sr-only"> activos</span>
          </span>
        ) : null}
      </button>
      <Modal open={open} onClose={close} title="Filtrar" variant="sheet">
        <CatalogFilters
          query={query}
          variant="modal"
          // Si no cambió nada, la URL no cambia: cerrar igual tras enviar.
          onApply={() => setTimeout(close, 0)}
        />
      </Modal>
    </>
  );
}

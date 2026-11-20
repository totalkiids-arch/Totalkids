import type { ReactNode } from "react";

import { Button } from "@/shared/ui/button";

/**
 * Barra de filtros: formulario GET, así los filtros viven en la URL y funcionan
 * sin JavaScript. `hidden` conserva parámetros que no se editan aquí.
 */
export function FilterBar({
  label,
  hidden = {},
  submitLabel = "Filtrar",
  children,
}: {
  label: string;
  hidden?: Record<string, string>;
  submitLabel?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      role="search"
      aria-label={label}
      className="mb-5 flex flex-wrap items-end gap-3.5"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <Button type="submit" variant="dark">
        {submitLabel}
      </Button>
    </form>
  );
}

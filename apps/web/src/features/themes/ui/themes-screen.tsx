import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { Button } from "@/shared/ui/button";

import { storeThemeAdmin } from "../container";
import { storeThemes } from "../domain/store-theme";
import { setStoreThemeAction } from "./theme-actions";
import { ThemePreview } from "./theme-preview";

type Params = Record<string, string | string[] | undefined>;
const param = (params: Params, name: string) => {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
};

/** Panel administrativo para elegir la apariencia pública vigente. */
export async function ThemesScreen({ searchParams = {} }: { searchParams?: Params }) {
  const active = await storeThemeAdmin.getActive();
  const notice = param(searchParams, "aviso");

  return (
    <>
      <AdminPageHeading
        title="Apariencia de la tienda"
        description="Elige la plantilla estacional que verá el público en la tienda."
      />
      {notice === "guardada" ? (
        <LiveNotice message="Plantilla aplicada a la tienda." tone="success" />
      ) : null}
      {notice === "invalida" ? (
        <LiveNotice message="La plantilla elegida no está disponible." tone="warning" />
      ) : null}

      <AdminPanel
        title="Plantillas estacionales"
        description="Hay una sola plantilla activa. El cambio se refleja en la tienda y en Mi cuenta."
      >
        <form action={setStoreThemeAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {storeThemes.map((theme) => {
            const selected = theme.id === active;
            return (
              <label
                key={theme.id}
                className={`theme-preview theme-preview--${theme.id} flex cursor-pointer flex-col gap-4 rounded-xl border-2 p-4 transition has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-blue ${selected ? "border-brand-blue ring-2 ring-brand-blue/20" : "border-border hover:border-brand-blue"}`}
              >
                <ThemePreview theme={theme.id} />
                <span className="flex items-start justify-between gap-3">
                  <span className="font-heading text-xl font-extrabold">{theme.name}</span>
                  <input
                    type="radio"
                    name="theme"
                    value={theme.id}
                    defaultChecked={selected}
                    className="mt-1 size-5 accent-brand-blue"
                  />
                </span>
                <span className="-mt-3 text-sm font-bold opacity-75">{theme.season}</span>
                <span className="text-sm leading-relaxed">{theme.description}</span>
              </label>
            );
          })}
          <div className="sm:col-span-2 xl:col-span-3">
            <Button type="submit">Aplicar plantilla</Button>
          </div>
        </form>
      </AdminPanel>
    </>
  );
}

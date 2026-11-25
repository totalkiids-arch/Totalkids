import type { Route } from "next";
import Link from "next/link";

import { regionName } from "@/shared/config/regions";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { ActiveBadge } from "@/shared/ui/admin/status-badge";
import { ButtonLink } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";
import { PlusIcon } from "@/shared/ui/icons";

import { shippingAdmin } from "../container";
import type { ShippingZone } from "../domain/shipping-zone";
import { toggleZoneAction } from "./shipping-actions";
import { ShippingSettingsForm } from "./shipping-settings-form";
import { ZoneForm } from "./zone-form";

type Params = Record<string, string | string[] | undefined>;

const param = (params: Params, name: string) => {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
};

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  "zona-creada": { message: "Zona creada.", tone: "success" },
  "zona-guardada": {
    message: "Zona guardada. Los pedidos ya hechos conservan su costo.",
    tone: "success",
  },
  "zona-activada": { message: "Zona activada: se ofrece en nuevas compras.", tone: "success" },
  "zona-desactivada": {
    message: "Zona desactivada: ya no se ofrece en nuevas compras. Los pedidos hechos no cambian.",
    tone: "success",
  },
  "condiciones-guardadas": {
    message: "Condiciones de despacho y retiro guardadas.",
    tone: "success",
  },
  "no-existe": { message: "Esa zona ya no existe.", tone: "warning" },
  error: {
    message: "No pudimos completar el cambio. Revisa tu sesión o intenta de nuevo en unos minutos.",
    tone: "warning",
  },
};

const priceLabel = (zone: ShippingZone) =>
  zone.price === null ? "A coordinar" : zone.price === 0 ? "Sin costo" : formatPrice(zone.price);

/** Panel administrativo · Despacho y retiro (RF-08, RF-11, RF-27). */
export async function ShippingScreen({ searchParams = {} }: { searchParams?: Params }) {
  const [zones, settings] = await Promise.all([
    shippingAdmin.listZones(),
    shippingAdmin.getSettings(),
  ]);
  const editing = zones.find((z) => z.id === param(searchParams, "editar")) ?? null;
  const notice = NOTICES[param(searchParams, "aviso")];
  const activeCount = zones.filter((z) => z.active).length;

  return (
    <>
      <AdminPageHeading
        title="Despacho y retiro"
        description="Cobertura, tarifas y plazos para nuevas compras."
        actions={
          <ButtonLink href={"/admin/despacho#editor" as Route}>
            <PlusIcon size={18} />
            Agregar zona
          </ButtonLink>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      <AdminPanel
        flush
        title="Zonas de despacho"
        description={`${activeCount} de ${zones.length} activa${zones.length === 1 ? "" : "s"}. Una comuna por zona.`}
      >
        <DataTable
          caption="Zonas de despacho"
          columns={[
            { key: "zone", label: "Región / comuna" },
            { key: "price", label: "Tarifa", align: "end" },
            { key: "leadTime", label: "Plazo" },
            { key: "free", label: "Despacho gratis" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acciones" },
          ]}
          rows={zones.map((zone) => ({
            key: zone.id,
            cells: {
              zone: <CellTitle title={zone.commune} meta={regionName(zone.region)} />,
              price: priceLabel(zone),
              leadTime: zone.leadTime,
              free: zone.freeShippingEligible ? "Cuenta" : "No cuenta",
              status: <ActiveBadge active={zone.active} feminine />,
              actions: (
                <span className="flex items-center gap-1">
                  <Link
                    href={`/admin/despacho?editar=${encodeURIComponent(zone.id)}#editor` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Editar ${zone.commune}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleZoneAction}>
                    <input type="hidden" name="id" value={zone.id} />
                    <input type="hidden" name="active" value={zone.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className={TEXT_ACTION}
                      aria-label={`${zone.active ? "Desactivar" : "Activar"} ${zone.commune}`}
                    >
                      {zone.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </span>
              ),
            },
          }))}
          empty="Todavía no hay zonas: el despacho a domicilio queda «a coordinar» en todas las comunas."
          footer={`${zones.length} zona${zones.length === 1 ? "" : "s"}`}
        />
      </AdminPanel>

      <AdminPanel id="editor" title={editing ? `Editar «${editing.commune}»` : "Nueva zona"}>
        {/* key: al cambiar de zona el formulario parte con sus datos. */}
        <ZoneForm key={editing?.id ?? "nueva"} editing={editing} />
      </AdminPanel>

      <AdminPanel id="condiciones" title="Retiro y condiciones generales">
        <ShippingSettingsForm settings={settings} />
      </AdminPanel>
    </>
  );
}

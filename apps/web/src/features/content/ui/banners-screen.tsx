import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { formatChileDateTime } from "@/shared/lib/chile-time";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";
import { ButtonLink } from "@/shared/ui/button";
import { PlusIcon } from "@/shared/ui/icons";

import { bannerAdmin } from "../container";
import { ORDER_MAX, type Banner, type BannerVisibility } from "../domain/banner";
import { toggleBannerAction } from "./banner-actions";
import { BannerCard } from "./banner-card";
import { BannerForm } from "./banner-form";

type Params = Record<string, string | string[] | undefined>;

const param = (params: Params, name: string) => {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
};

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  creado: { message: "Banner creado.", tone: "success" },
  guardado: { message: "Banner guardado.", tone: "success" },
  activado: { message: "Banner activado.", tone: "success" },
  desactivado: { message: "Banner desactivado: ya no se muestra.", tone: "success" },
  "no-existe": { message: "Ese banner ya no existe.", tone: "warning" },
  error: {
    message: "No pudimos completar el cambio. Revisa tu sesión o intenta de nuevo en unos minutos.",
    tone: "warning",
  },
};

const VISIBILITY_TONE: Record<BannerVisibility, StatusTone> = {
  visible: "green",
  scheduled: "blue",
  ended: "neutral",
  inactive: "red",
};

/** "Desde 1 dic 2026, 09:00 · hasta …" o null si no tiene ventana. */
function windowLabel(banner: Banner): string | null {
  const parts = [
    banner.startsAt ? `Desde ${formatChileDateTime(banner.startsAt)}` : null,
    banner.endsAt ? `hasta ${formatChileDateTime(banner.endsAt)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Panel administrativo · Banners (RF-28). */
export async function BannersScreen({ searchParams = {} }: { searchParams?: Params }) {
  const banners = await bannerAdmin.list();
  const visible = banners.filter((b) => b.visibility === "visible");
  const editing = banners.find((b) => b.id === param(searchParams, "editar")) ?? null;
  const notice = NOTICES[param(searchParams, "aviso")];
  const nextOrder = Math.min(ORDER_MAX, Math.max(0, ...banners.map((b) => b.order)) + 1);

  return (
    <>
      <AdminPageHeading
        title="Banners"
        description="Administra los mensajes y enlaces destacados de la tienda."
        actions={
          <ButtonLink href={"/admin/banners#editor" as Route}>
            <PlusIcon size={18} />
            Agregar banner
          </ButtonLink>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      <AdminPanel
        flush
        title="Banners"
        description={`${visible.length} de ${banners.length} visible${banners.length === 1 ? "" : "s"} hoy en la tienda. Los banners no se eliminan: se desactivan.`}
      >
        <DataTable
          caption="Banners de la tienda"
          columns={[
            { key: "title", label: "Título" },
            { key: "href", label: "Destino" },
            { key: "order", label: "Orden", align: "end" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acciones" },
          ]}
          rows={banners.map((banner) => ({
            key: banner.id,
            cells: {
              title: <CellTitle title={banner.title} meta={banner.text} />,
              href: <code className="text-sm break-all">{banner.href}</code>,
              order: banner.order,
              status: (
                <CellTitle
                  title={
                    <StatusBadge tone={VISIBILITY_TONE[banner.visibility]}>
                      {banner.visibilityLabel}
                    </StatusBadge>
                  }
                  meta={windowLabel(banner)}
                />
              ),
              actions: (
                <span className="flex flex-wrap items-center gap-1">
                  <Link
                    href={`/admin/banners?editar=${encodeURIComponent(banner.id)}#editor` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Editar ${banner.title}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleBannerAction}>
                    <input type="hidden" name="id" value={banner.id} />
                    <input type="hidden" name="active" value={banner.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className={TEXT_ACTION}
                      aria-label={`${banner.active ? "Desactivar" : "Activar"} ${banner.title}`}
                    >
                      {banner.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </span>
              ),
            },
          }))}
          empty="Todavía no hay banners. Agrega el primero."
          footer={`${banners.length} banner${banners.length === 1 ? "" : "s"}`}
        />
      </AdminPanel>

      <AdminPanel
        title="Vista previa"
        description="Los banners que la portada muestra hoy, en su orden."
      >
        {visible.length === 0 ? (
          <AdminMuted>Hoy no hay banners visibles en la tienda.</AdminMuted>
        ) : (
          <ul className="flex flex-col gap-4">
            {visible.map((banner) => (
              <li key={banner.id}>
                <BannerCard banner={banner} />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel id="editor" title={editing ? `Editar «${editing.title}»` : "Nuevo banner"}>
        {/* key: al cambiar de banner el formulario parte con sus datos. */}
        <BannerForm key={editing?.id ?? "nuevo"} editing={editing} nextOrder={nextOrder} />
      </AdminPanel>
    </>
  );
}

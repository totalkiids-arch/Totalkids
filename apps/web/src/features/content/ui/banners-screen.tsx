import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { ActiveBadge } from "@/shared/ui/admin/status-badge";
import { ButtonLink } from "@/shared/ui/button";
import { PlusIcon } from "@/shared/ui/icons";

import { bannerAdmin } from "../container";
import { ORDER_MAX, safeBannerHref, sortBanners } from "../domain/banner";
import { toggleBannerAction } from "./banner-actions";
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
};

/** Panel administrativo · Banners (RF-28). */
export async function BannersScreen({ searchParams = {} }: { searchParams?: Params }) {
  const banners = sortBanners(await bannerAdmin.list());
  const active = banners.filter((b) => b.active);
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
      <InfoNote>
        Datos de ejemplo: los cambios se borran al reiniciar el sistema. La portada de la tienda
        todavía no usa estos banners y no cambia.
      </InfoNote>

      <AdminPanel
        flush
        title="Banners"
        description={`${active.length} de ${banners.length} activo${banners.length === 1 ? "" : "s"}. Los banners no se eliminan: se desactivan.`}
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
              status: <ActiveBadge active={banner.active} />,
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
          footer={`${banners.length} banner${banners.length === 1 ? "" : "s"} · Datos de demostración`}
        />
      </AdminPanel>

      <AdminPanel
        title="Vista previa"
        description="Banners activos, en el orden en que aparecerían."
      >
        {active.length === 0 ? (
          <AdminMuted>No hay banners activos.</AdminMuted>
        ) : (
          <ul className="flex flex-col gap-4">
            {active.map((banner) => (
              <li
                key={banner.id}
                className="flex flex-wrap items-center justify-between gap-5 rounded-[10px] bg-cream p-6"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <h3 className="mb-2 font-heading text-2xl font-extrabold break-words sm:text-[30px] sm:leading-tight">
                    {banner.title}
                  </h3>
                  <p className="break-words text-on-yellow">{banner.text}</p>
                </div>
                <ButtonLink
                  href={safeBannerHref(banner.href) as Route}
                  variant="accent"
                  aria-label={`Ver destino de «${banner.title}»`}
                >
                  Ver destino
                </ButtonLink>
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

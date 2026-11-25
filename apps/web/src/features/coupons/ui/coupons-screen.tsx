import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { Button, ButtonLink, buttonClasses } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";
import { PlusIcon } from "@/shared/ui/icons";

import { couponAdmin } from "../container";
import { addDays, IN_USE_CANNOT_DELETE, type Coupon } from "../domain/coupon";
import { deleteCouponAction, toggleCouponAction } from "./coupon-actions";
import { CouponForm } from "./coupon-form";
import { CouponStatusBadge } from "./coupon-status-badge";

type Params = Record<string, string | string[] | undefined>;

const param = (params: Params, name: string) => {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
};

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  creado: { message: "Cupón creado. Se puede usar en nuevas compras.", tone: "success" },
  guardado: {
    message: "Cupón guardado. Los pedidos anteriores conservan su descuento.",
    tone: "success",
  },
  activado: { message: "Cupón activado.", tone: "success" },
  desactivado: {
    message: "Cupón desactivado: ya no se acepta en nuevas compras. Los pedidos hechos no cambian.",
    tone: "success",
  },
  eliminado: { message: "Cupón eliminado.", tone: "success" },
  "con-usos": { message: IN_USE_CANNOT_DELETE, tone: "warning" },
  "no-existe": { message: "Ese cupón ya no existe.", tone: "warning" },
  error: {
    message: "No pudimos completar el cambio. Revisa tu sesión o intenta de nuevo en unos minutos.",
    tone: "warning",
  },
};

/** "2026-11-20" → "20-11-2026" (formato chileno, sin depender de la zona horaria). */
const formatDay = (iso: string) => iso.split("-").reverse().join("-");

const discountLabel = (coupon: Coupon) =>
  coupon.kind === "percent" ? `${coupon.value} %` : formatPrice(coupon.value);

/** Panel administrativo · Cupones (RF-07, RF-28). */
export async function CouponsScreen({ searchParams = {} }: { searchParams?: Params }) {
  const { coupons, today } = await couponAdmin.list();
  const editing = coupons.find((c) => c.id === param(searchParams, "editar")) ?? null;
  const deleting = coupons.find((c) => c.id === param(searchParams, "eliminar")) ?? null;
  const notice = NOTICES[param(searchParams, "aviso")];
  const usable = coupons.filter((c) => c.status === "active").length;

  return (
    <>
      <AdminPageHeading
        title="Cupones"
        description="Descuentos para nuevas compras, con vigencia y límite de uso."
        actions={
          <ButtonLink href={"/admin/cupones#editor" as Route}>
            <PlusIcon size={18} />
            Agregar cupón
          </ButtonLink>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      {deleting?.canDelete ? (
        <AdminPanel id="eliminar" title={`¿Eliminar el cupón «${deleting.code}»?`}>
          <AdminMuted>
            No tiene usos, así que se puede eliminar. Esta acción no se puede deshacer; si solo
            quieres pausarlo, desactívalo.
          </AdminMuted>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={deleteCouponAction}>
              <input type="hidden" name="id" value={deleting.id} />
              <Button type="submit" variant="danger">
                Eliminar cupón
              </Button>
            </form>
            <Link href="/admin/cupones" className={buttonClasses({ variant: "outline" })}>
              Cancelar
            </Link>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel
        flush
        title="Cupones"
        description={`${usable} de ${coupons.length} vigente${coupons.length === 1 ? "" : "s"} hoy. Un cupón por pedido; no aplica al despacho.`}
      >
        <DataTable
          caption="Cupones de descuento"
          columns={[
            { key: "code", label: "Código" },
            { key: "discount", label: "Descuento", align: "end" },
            { key: "validity", label: "Vigencia" },
            { key: "uses", label: "Usos", align: "end" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acciones" },
          ]}
          rows={coupons.map((coupon) => ({
            key: coupon.id,
            cells: {
              code: (
                <CellTitle
                  title={<span className="font-mono">{coupon.code}</span>}
                  meta={coupon.kind === "percent" ? "Porcentaje" : "Monto fijo"}
                />
              ),
              discount: discountLabel(coupon),
              validity: (
                <span className="whitespace-nowrap">
                  {formatDay(coupon.startsOn)} al {formatDay(coupon.endsOn)}
                </span>
              ),
              uses: (
                <span className="whitespace-nowrap">
                  {coupon.uses} / {coupon.maxUses}
                </span>
              ),
              status: <CouponStatusBadge status={coupon.status} label={coupon.statusLabel} />,
              actions: (
                <span className="flex flex-wrap items-center gap-1">
                  <Link
                    href={`/admin/cupones?editar=${encodeURIComponent(coupon.id)}#editor` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Editar ${coupon.code}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleCouponAction}>
                    <input type="hidden" name="id" value={coupon.id} />
                    <input type="hidden" name="active" value={coupon.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className={TEXT_ACTION}
                      aria-label={`${coupon.active ? "Desactivar" : "Activar"} ${coupon.code}`}
                    >
                      {coupon.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                  {coupon.canDelete ? (
                    <Link
                      href={
                        `/admin/cupones?eliminar=${encodeURIComponent(coupon.id)}#eliminar` as Route
                      }
                      className={TEXT_ACTION}
                      aria-label={`Eliminar ${coupon.code}`}
                    >
                      Eliminar
                    </Link>
                  ) : null}
                </span>
              ),
            },
          }))}
          empty="Todavía no hay cupones. Agrega el primero."
          footer={`${coupons.length} cupón${coupons.length === 1 ? "" : "es"} · Un cupón con usos no se elimina: se desactiva`}
        />
      </AdminPanel>

      <AdminPanel
        id="editor"
        title={editing ? `Editar «${editing.code}»` : "Nuevo cupón"}
        description="Editar no cambia pedidos anteriores: cada pedido conserva su descuento."
      >
        {/* key: al cambiar de cupón el formulario parte con sus datos. */}
        <CouponForm
          key={editing?.id ?? "nuevo"}
          editing={editing}
          defaultStart={today}
          defaultEnd={addDays(today, 30)}
        />
      </AdminPanel>
    </>
  );
}

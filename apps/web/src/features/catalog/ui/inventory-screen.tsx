import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge } from "@/shared/ui/admin/status-badge";

import { adminCatalog } from "../container";
import { availableStock, inventoryStatus, normalizeSku } from "../domain/admin-product";
import {
  DEMO_STORE_NOTE,
  formatDateTime,
  param,
  units,
  type AdminSearchParams,
} from "./admin/admin-format";
import { StockAdjustForm } from "./admin/stock-adjust-form";

const RECENT_ADJUSTMENTS = 20;

/** Panel administrativo · Inventario (RN-03, RF-34). */
export async function InventoryScreen({ searchParams = {} }: { searchParams?: AdminSearchParams }) {
  const [rows, adjustments] = await Promise.all([
    adminCatalog.listInventory(),
    adminCatalog.listAdjustments(RECENT_ADJUSTMENTS),
  ]);
  const requested = normalizeSku(param(searchParams, "sku"));
  const preselected = rows.find((r) => normalizeSku(r.sku) === requested)?.sku ?? "";
  const saved = param(searchParams, "aviso") === "ajuste";
  const low = rows.filter((r) => inventoryStatus(r) !== "ok").length;

  return (
    <>
      <AdminPageHeading
        title="Inventario"
        description="Disponible = stock físico − reservas. Los ajustes quedan registrados con fecha, responsable y motivo."
      />
      {saved ? <LiveNotice message="Ajuste registrado con responsable, fecha y motivo." /> : null}
      <InfoNote>
        {DEMO_STORE_NOTE} El stock físico y reservado de partida es ficticio: el sitio del cliente
        no informa unidades.
      </InfoNote>

      <AdminPanel
        flush
        title="Stock por variante"
        description={`${low} variante${low === 1 ? "" : "s"} con stock bajo o agotada${low === 1 ? "" : "s"}.`}
      >
        <DataTable
          caption="Stock por variante"
          columns={[
            { key: "product", label: "Producto / variante" },
            { key: "physical", label: "Físico", align: "end" },
            { key: "reserved", label: "Reservado", align: "end" },
            { key: "available", label: "Disponible", align: "end" },
            { key: "actions", label: "Ajuste" },
          ]}
          rows={rows.map((row) => {
            const status = inventoryStatus(row);
            return {
              key: row.variantId,
              cells: {
                product: (
                  <CellTitle
                    title={row.productName}
                    meta={[row.sku, row.option].filter(Boolean).join(" · ")}
                  />
                ),
                physical: row.physical,
                reserved: row.reserved,
                available: (
                  <span className="inline-flex items-center gap-2">
                    {status === "out" ? <StatusBadge tone="red">Agotado</StatusBadge> : null}
                    {status === "low" ? <StatusBadge tone="yellow">Stock bajo</StatusBadge> : null}
                    {units(availableStock(row))}
                  </span>
                ),
                actions: (
                  <Link
                    href={`/admin/inventario?sku=${encodeURIComponent(row.sku)}#ajuste` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Ajustar stock de ${row.productName} (${row.sku})`}
                  >
                    Ajustar stock
                  </Link>
                ),
              },
            };
          })}
          footer={`${rows.length} variantes · Datos de demostración`}
        />
      </AdminPanel>

      <AdminPanel
        id="ajuste"
        title="Ajuste de inventario"
        description="El nuevo stock físico no puede ser menor que las unidades reservadas por pedidos en curso."
      >
        <StockAdjustForm
          key={preselected || "inicio"}
          preselected={preselected}
          options={rows.map((r) => ({
            sku: r.sku,
            label: `${r.sku} · ${r.productName}${r.option ? ` (${r.option})` : ""}`,
            physical: r.physical,
            reserved: r.reserved,
          }))}
        />
      </AdminPanel>

      <AdminPanel
        id="ajustes"
        flush
        title="Ajustes recientes"
        description="Ajustes hechos desde que se inició el sistema."
      >
        <DataTable
          caption="Ajustes de inventario recientes"
          columns={[
            { key: "at", label: "Fecha" },
            { key: "actor", label: "Responsable" },
            { key: "variant", label: "Variante" },
            { key: "change", label: "Antes → después", align: "end" },
            { key: "reason", label: "Motivo" },
          ]}
          rows={adjustments.map((a) => ({
            key: a.id,
            cells: {
              at: <time dateTime={a.at}>{formatDateTime(a.at)}</time>,
              actor: `${a.actor} (demo)`,
              variant: <CellTitle title={a.productName} meta={a.sku} />,
              change: (
                <span>
                  {a.before} <span aria-hidden>→</span>
                  <span className="sr-only">a</span> {a.after}
                </span>
              ),
              reason: <span className="whitespace-normal">{a.reason}</span>,
            },
          }))}
          empty="Aún no hay ajustes. Los que registres aparecerán aquí hasta que se reinicie el servidor."
          footer={`${adjustments.length} ajuste${adjustments.length === 1 ? "" : "s"} · Datos de demostración`}
        />
      </AdminPanel>
    </>
  );
}

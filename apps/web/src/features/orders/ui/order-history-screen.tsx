import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Tito } from "@/shared/ui/brand/tito";
import { Button, ButtonLink } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";

import { getMyOrders } from "../container";
import { orderTotal, orderUnits } from "../domain/order";
import { formatDate, OrderStatusBadge } from "./order-format";

const units = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

/**
 * Cuenta del comprador · Historial de pedidos (RF-23). Solo muestra los
 * pedidos propios; sin sesión, lleva a "Iniciar sesión". `logoutAction` la
 * entrega la página (para que orders no dependa de la UI de auth).
 */
export async function OrderHistoryScreen({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const mine = await getMyOrders();
  if (!mine) redirect("/ingresar");
  const { buyer, orders } = mine;
  const firstName = buyer.name.trim().split(/\s+/)[0] || buyer.name;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(2.25rem,5vw,3rem)] leading-tight font-extrabold">
            Hola, {firstName}
          </h1>
          <p className="text-text-secondary">Aquí puedes seguir cada uno de tus pedidos.</p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </form>
      </div>

      <section
        aria-labelledby="mis-pedidos"
        className="flex flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="mis-pedidos" className="text-[26px] font-extrabold">
            Mis pedidos
          </h2>
          <Link href="/catalogo" className="font-extrabold text-brand-blue underline">
            Seguir explorando
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Tito className="w-20" />
            <p className="font-heading text-2xl font-extrabold">Todavía no tienes pedidos</p>
            <p className="text-text-secondary">
              Cuando compres, aquí verás su estado y seguimiento.
            </p>
            <ButtonLink href="/catalogo">Ir al catálogo</ButtonLink>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-border p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2.5">
                    <strong className="font-heading text-xl">#{order.id}</strong>
                    <OrderStatusBadge status={order.status} />
                  </p>
                  <p className="text-sm text-text-secondary">
                    {formatDate(order.createdAt)} · {units(orderUnits(order))} ·{" "}
                    <strong className="text-text-primary">{formatPrice(orderTotal(order))}</strong>
                  </p>
                </div>
                <ButtonLink href={`/cuenta/pedidos/${order.id}`} variant="dark">
                  Ver detalle y seguimiento
                  <span className="sr-only"> del pedido {order.id}</span>
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="mi-informacion"
        className="flex flex-col gap-3 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7"
      >
        <h2 id="mi-informacion" className="text-[26px] font-extrabold">
          Mi información
        </h2>
        <Info term="Nombre">{buyer.name}</Info>
        <Info term="Correo">{buyer.email}</Info>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink href="/recuperar" variant="outline">
            Cambiar contraseña
          </ButtonLink>
          <ButtonLink href="/suscripcion" variant="outline">
            Gestionar suscripción
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

function Info({ term, children }: { term: string; children: ReactNode }) {
  return (
    <p className="flex flex-wrap gap-x-2">
      <span className="font-extrabold text-text-secondary">{term}:</span>
      <span className="break-all">{children}</span>
    </p>
  );
}

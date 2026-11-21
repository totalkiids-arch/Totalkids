import Form from "next/form";
import type { ReactNode } from "react";
import Link from "next/link";

import { categoryNav, type CategoryTone } from "@/shared/config/routes";
import { site } from "@/shared/config/site";
import { Logo } from "@/shared/ui/brand/logo";
import {
  CardIcon,
  MailIcon,
  PhoneIcon,
  SearchIcon,
  StarIcon,
  TruckIcon,
  UserIcon,
} from "@/shared/ui/icons";

const PILL_TONE: Record<CategoryTone, string> = {
  blue: "bg-brand-blue text-white",
  purple: "bg-brand-purple text-white",
  green: "bg-brand-green text-white",
  yellow: "bg-brand-yellow text-brand-navy",
  red: "bg-brand-red text-white",
  navy: "bg-brand-navy text-white",
  outline: "border-2 border-brand-navy bg-surface text-brand-navy",
  offer: "bg-offer text-offer-ink",
};

/** Franja arcoíris superior con los colores del logo. */
function RainbowStripe() {
  return (
    <div aria-hidden className="store-stripe flex h-2">
      {[
        "bg-brand-red",
        "bg-logo-orange",
        "bg-brand-yellow",
        "bg-logo-green",
        "bg-logo-sky",
        "bg-brand-purple",
      ].map((color) => (
        <span key={color} className={`flex-1 ${color}`} />
      ))}
    </div>
  );
}

function TopBar() {
  return (
    <div className="on-dark bg-brand-navy text-[13px] font-bold text-white">
      <div className="mx-auto scrollbar-none flex max-w-7xl items-center justify-between gap-x-6 gap-y-2 overflow-x-auto px-4 py-2 sm:flex-wrap sm:px-6">
        <ul className="flex shrink-0 gap-4 whitespace-nowrap sm:gap-5">
          <li className="flex items-center gap-1.5">
            <TruckIcon size={16} className="text-brand-yellow" />
            Despachos a todo Chile
          </li>
          <li className="flex items-center gap-1.5 max-[430px]:hidden">
            <CardIcon size={16} className="text-brand-yellow" />
            {site.installments}
          </li>
        </ul>
        {/* En móvil y tablet el contacto vive en el pie de página. */}
        <ul className="hidden shrink-0 gap-5 whitespace-nowrap lg:flex">
          <li className="flex items-center gap-1.5">
            <PhoneIcon size={16} />
            {site.phone}
          </li>
          <li className="flex items-center gap-1.5">
            <MailIcon size={16} />
            {site.email}
          </li>
          <li>
            <Link href="/politicas" className="rounded">
              Ayuda
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

function SearchForm() {
  return (
    <Form
      action="/catalogo"
      role="search"
      className="order-3 flex min-w-0 basis-full items-center rounded-full border-2 border-input-border bg-input py-1 pr-1 pl-4 sm:pl-5 lg:order-none lg:flex-[1_1_320px] lg:basis-auto"
    >
      <label htmlFor="buscar" className="sr-only">
        Buscar productos
      </label>
      <input
        id="buscar"
        name="q"
        type="search"
        placeholder="Busca mesas, camas, libreros…"
        className="h-10 min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-secondary"
      />
      <button
        type="submit"
        aria-label="Buscar"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white"
      >
        <SearchIcon size={20} />
      </button>
    </Form>
  );
}

function HeaderActions({ cartLink }: { cartLink: ReactNode }) {
  return (
    <div className="order-2 ml-auto flex shrink-0 items-center gap-1 sm:gap-3 lg:order-none lg:ml-0">
      <Link
        href="/ingresar"
        aria-label="Mi cuenta"
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-0 font-extrabold text-text-primary hover:bg-soft-yellow sm:px-3"
      >
        <UserIcon size={22} className="text-brand-blue" />
        <span aria-hidden className="hidden sm:inline">
          Mi cuenta
        </span>
      </Link>
      {cartLink}
    </div>
  );
}

function CategoryPills() {
  return (
    <nav aria-label="Categorías" className="mx-auto max-w-7xl">
      <ul className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3.5 sm:flex-wrap sm:gap-2.5 sm:overflow-visible sm:px-6 sm:pb-4">
        {categoryNav.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-4.5 text-sm font-extrabold whitespace-nowrap motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 sm:min-h-0 sm:py-2.5 ${PILL_TONE[item.tone]}`}
            >
              {"icon" in item ? <StarIcon size={16} /> : null}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Encabezado completo de la tienda, fiel a la maqueta aprobada. */
/**
 * `cartLink` lo entrega la feature "cart" desde el layout (shared no depende de
 * features): el botón del carrito con su cantidad.
 */
export function StoreHeader({ cartLink }: { cartLink: ReactNode }) {
  return (
    <>
      <RainbowStripe />
      <TopBar />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:gap-x-8 sm:gap-y-4 sm:px-6 sm:py-4">
          <Link href="/" aria-label="Total Kids, inicio" className="shrink-0 rounded-full">
            <Logo size="md" preload />
          </Link>
          <SearchForm />
          <HeaderActions cartLink={cartLink} />
        </div>
        <CategoryPills />
      </header>
    </>
  );
}

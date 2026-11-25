"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";

import { isActiveAdminHref, type AdminNavIcon, type AdminNavItem } from "@/shared/config/routes";
import { Logo } from "@/shared/ui/brand/logo";
import {
  ArrowRightIcon,
  BagIcon,
  BoxIcon,
  CardIcon,
  ChartIcon,
  ClockIcon,
  CloseIcon,
  GridIcon,
  ImageIcon,
  MailIcon,
  MenuIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
} from "@/shared/ui/icons";

const ICONS: Record<AdminNavIcon, ComponentType<{ size?: number; className?: string }>> = {
  grid: GridIcon,
  bag: BagIcon,
  card: CardIcon,
  box: BoxIcon,
  tag: TagIcon,
  truck: TruckIcon,
  image: ImageIcon,
  mail: MailIcon,
  users: UsersIcon,
  chart: ChartIcon,
  clock: ClockIcon,
};

/** Cuadrito de color de cada grupo (como en la maqueta). */
const GROUP_DOT = ["bg-brand-blue", "bg-brand-yellow", "bg-brand-green", "bg-brand-purple"];

/** Mismo corte que la maqueta: en ≤760 px el menú se vuelve un panel desplegable. */
const MOBILE_QUERY = "(max-width: 760px)";

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export interface AdminNavGroupView {
  group: string;
  items: readonly Pick<AdminNavItem, "href" | "label" | "icon">[];
}

interface AdminFrameProps {
  groups: readonly AdminNavGroupView[];
  roleLabel: string;
  signOut: ReactNode;
  children: ReactNode;
}

/** Parte interactiva del panel: enlace activo y menú móvil accesible. */
export function AdminFrame({ groups, roleLabel, signOut, children }: AdminFrameProps) {
  const pathname = usePathname();
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  // Al navegar o al cambiar de tamaño de pantalla, el menú vuelve a cerrarse.
  const [seen, setSeen] = useState({ pathname, isMobile });
  if (seen.pathname !== pathname || seen.isMobile !== isMobile) {
    setSeen({ pathname, isMobile });
    setOpen(false);
  }

  const menuOpen = isMobile && open;
  const hidden = isMobile && !open;

  useEffect(() => {
    if (!menuOpen) return;
    const current =
      sidebar.current?.querySelector<HTMLElement>('nav [aria-current="page"]') ??
      sidebar.current?.querySelector<HTMLElement>("nav a");
    current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-brand-navy px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>

      <aside
        id="menu-panel"
        ref={sidebar}
        inert={hidden}
        className={`fixed inset-y-0 left-0 z-40 flex w-[238px] flex-col overflow-y-auto border-r border-border bg-surface px-4 pt-6 pb-4.5 max-[760px]:motion-safe:transition-[transform,visibility] max-[760px]:motion-safe:duration-200 ${
          menuOpen
            ? "translate-x-0 shadow-[20px_0_80px_rgb(31_42_68/0.2)]"
            : "max-[760px]:invisible max-[760px]:-translate-x-full"
        }`}
      >
        <Link
          href="/"
          aria-label="Total Kids, ir a la tienda"
          className="self-start rounded-full px-2 pb-2"
        >
          <Logo size="sm" />
        </Link>
        <nav aria-label="Administración">
          {groups.map(({ group, items }, index) => (
            <div key={group}>
              <p
                id={`grupo-${index}`}
                className="flex items-center gap-2 px-3 pt-5 pb-2 text-[11px] font-extrabold tracking-[1.5px] text-text-secondary uppercase"
              >
                <span aria-hidden className={`size-[9px] rounded-[3px] ${GROUP_DOT[index % 4]}`} />
                {group}
              </p>
              <ul aria-labelledby={`grupo-${index}`} className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = isActiveAdminHref(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-bold motion-safe:transition-transform ${
                          active
                            ? "bg-brand-blue text-white shadow-[0_3px_0_var(--color-brand-blue-deep)]"
                            : "text-text-body hover:bg-input motion-safe:hover:translate-x-0.5"
                        }`}
                      >
                        <Icon size={20} className={active ? "text-white" : "text-brand-blue"} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          <Link
            href="/"
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-input-border bg-input px-3.5 text-sm font-extrabold text-text-primary hover:bg-soft-yellow"
          >
            <ArrowRightIcon size={18} className="text-brand-blue" />
            Ver tienda
          </Link>
          {signOut}
        </div>
      </aside>

      {menuOpen ? (
        // Fondo para cerrar con el mouse o el dedo; con teclado se cierra con Escape o el botón.
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-brand-navy/30"
        />
      ) : null}

      <div className="min-w-0 min-[761px]:ml-[238px]">
        <header className="flex min-h-[70px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-[18px] py-3 min-[761px]:h-[77px] min-[761px]:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButton}
              type="button"
              aria-controls="menu-panel"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setOpen(!menuOpen)}
              className="relative z-50 flex size-11 items-center justify-center rounded-full border-2 border-input-border bg-surface text-text-primary min-[761px]:hidden"
            >
              {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
            </button>
            <p className="text-sm font-extrabold">
              Total Kids <span className="text-text-secondary">/ Administración</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-full bg-brand-yellow text-xs font-extrabold text-brand-navy shadow-[0_2px_0_var(--color-brand-yellow-deep)]"
            >
              TK
            </span>
            <span className="text-[13px] font-bold max-[760px]:sr-only">
              <span className="sr-only">Rol: </span>
              {roleLabel}
            </span>
          </div>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="px-[18px] pt-6 pb-11 min-[761px]:px-9 min-[761px]:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

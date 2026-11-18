import Link from "next/link";
import type { ReactNode } from "react";

import { footerCategoryNav, footerHelpNav, type NavItem } from "@/shared/config/routes";
import { site } from "@/shared/config/site";
import { Logo } from "@/shared/ui/brand/logo";
import { ClockIcon, MailIcon, PhoneIcon, PinIcon } from "@/shared/ui/icons";

function LinkColumn({ title, items }: { title: string; items: readonly NavItem[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3.5 text-xl font-bold text-white">{title}</h2>
      <ul className="flex flex-col gap-2 text-[15px]">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="rounded hover:text-white hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ContactLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {icon}
      {children}
    </li>
  );
}

export function StoreFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="on-dark bg-brand-navy text-on-dark">
      <div className="mx-auto grid max-w-7xl grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8 px-4 pt-14 pb-10 sm:px-6">
        <div className="flex flex-col gap-3.5">
          <Logo size="footer" />
          <p className="text-[15px]">{site.description}</p>
        </div>
        <LinkColumn title="Categorías" items={footerCategoryNav} />
        <LinkColumn title="Ayuda" items={footerHelpNav} />
        <div>
          <h2 className="mb-3.5 text-xl font-bold text-white">Contacto</h2>
          <ul className="flex flex-col gap-2.5 text-[15px]">
            <ContactLine icon={<PinIcon size={18} className="shrink-0 text-brand-yellow" />}>
              {site.address}
            </ContactLine>
            <ContactLine icon={<PhoneIcon size={18} className="shrink-0 text-brand-yellow" />}>
              {site.phone}
            </ContactLine>
            <ContactLine icon={<MailIcon size={18} className="shrink-0 text-brand-yellow" />}>
              {site.email}
            </ContactLine>
            <ContactLine icon={<ClockIcon size={18} className="shrink-0 text-brand-yellow" />}>
              {site.hours}
            </ContactLine>
          </ul>
        </div>
      </div>
      <div className="border-t border-navy-line">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-4.5 text-[13px] text-on-dark-muted sm:px-6">
          <p>
            © {year} {site.name}. Todos los derechos reservados.
          </p>
          <p className="flex gap-3">
            <Link href="/politicas#terminos" className="rounded hover:underline">
              Términos y condiciones
            </Link>
            <Link href="/politicas#privacidad" className="rounded hover:underline">
              Política de privacidad
            </Link>
          </p>
        </div>
      </div>
      <p className="px-4 pb-4 text-center">
        <Link href="/suscripcion" className="rounded text-brand-yellow hover:underline">
          Suscribirme o darme de baja del newsletter
        </Link>
      </p>
    </footer>
  );
}

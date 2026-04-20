import Link from "next/link";
import Image from "next/image";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { company, mailtoLink, telLink, whatsappLink, googleMapsLink } from "@/lib/company";

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const links = [
    { href: `/${locale}`, label: dict.nav.home },
    { href: `/${locale}/hosting`, label: dict.nav.hosting },
    { href: `/${locale}/services`, label: dict.nav.services },
    { href: `/${locale}/about`, label: dict.nav.about },
    { href: `/${locale}/contact`, label: dict.nav.contact },
  ];

  return (
    <footer className="mt-24 border-t border-ink-100 bg-ink-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="SPEEDX AUTO" width={32} height={32} className="rounded" />
              <span className="text-base font-bold tracking-tight text-ink-900">
                SPEEDX <span className="text-brand-500">AUTO</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink-500">{dict.footer.tagline}</p>
            <Link
              href={company.turoHostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              {dict.nav.turoListings} ↗
            </Link>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">{dict.footer.quickLinks}</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">{dict.footer.contactInfo}</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li>
                <a href={telLink} className="hover:text-ink-900">
                  {company.phoneDisplay}
                </a>
              </li>
              <li>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="hover:text-ink-900">
                  WhatsApp
                </a>
              </li>
              <li>
                <a href={mailtoLink} className="hover:text-ink-900 break-all">
                  {company.email}
                </a>
              </li>
              <li>
                WeChat: <span className="font-semibold text-ink-700">{company.wechatId}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">{dict.footer.address}</h3>
            <a
              href={googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-sm text-ink-500 hover:text-ink-900"
            >
              {company.addressLine1}
              <br />
              {company.addressLine2}
            </a>
            <h3 className="mt-6 text-sm font-semibold text-ink-900">{dict.footer.hours}</h3>
            <p className="mt-2 text-sm text-ink-500">{dict.footer.hoursValue}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-ink-100 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {company.name}. {dict.footer.rights}
          </p>
          <p>
            {company.name} · Richmond, BC · Est. {company.foundedYear}
          </p>
        </div>
      </div>
    </footer>
  );
}

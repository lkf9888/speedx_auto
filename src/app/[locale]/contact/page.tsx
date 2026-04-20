import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Container } from "@/components/Container";
import { company, mailtoLink, telLink, whatsappLink, googleMapsLink } from "@/lib/company";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: dict.nav.contact,
    description: dict.contact.heroSubtitle,
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);
  const c = dict.contact;

  return (
    <>
      <section className="bg-hero-gradient">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {dict.nav.contact}
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl">
              {c.heroTitle}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">{c.heroSubtitle}</p>
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-5 md:grid-cols-2">
            {/* WeChat */}
            <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                <WeChatIcon />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-ink-900">{c.wechat.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-500">{c.wechat.body}</p>
              <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-brand-100">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {c.wechat.scanLabel}
                  </div>
                  <div className="font-mono text-2xl font-bold text-ink-900">
                    {company.wechatId}
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp */}
            <ContactCard
              title={c.whatsapp.title}
              body={c.whatsapp.body}
              href={whatsappLink}
              external
              value={company.phoneDisplay}
              cta={dict.cta.whatsapp}
              icon={<WhatsAppIcon />}
              accent="mint"
            />

            {/* Phone */}
            <ContactCard
              title={c.phone.title}
              body={c.phone.body}
              href={telLink}
              value={company.phoneDisplay}
              cta={dict.cta.callNow}
              icon={<PhoneIcon />}
              accent="coral"
            />

            {/* Email */}
            <ContactCard
              title={c.email.title}
              body={c.email.body}
              href={mailtoLink}
              value={company.email}
              cta={dict.cta.email}
              icon={<MailIcon />}
              accent="brand"
            />
          </div>

          {/* Location */}
          <div className="mt-10 overflow-hidden rounded-3xl border border-ink-100 bg-white">
            <div className="grid md:grid-cols-[1fr_1.1fr]">
              <div className="p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-700">
                  <PinIcon />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-ink-900">{c.location.title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-500">{c.location.body}</p>
                <div className="mt-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {dict.footer.hours}
                  </div>
                  <div className="mt-1 text-base font-semibold text-ink-900">
                    {c.location.hours}
                  </div>
                </div>
                <Link
                  href={googleMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-1 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Open in Google Maps ↗
                </Link>
              </div>
              <div className="relative min-h-[280px] bg-ink-50">
                <iframe
                  title="SPEEDX AUTO location map"
                  src={`https://www.google.com/maps?q=${company.googleMapsQuery}&output=embed`}
                  width="100%"
                  height="100%"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0, position: "absolute", inset: 0 }}
                />
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function ContactCard({
  title,
  body,
  href,
  value,
  cta,
  icon,
  external,
  accent,
}: {
  title: string;
  body: string;
  href: string;
  value: string;
  cta: string;
  icon: React.ReactNode;
  external?: boolean;
  accent: "brand" | "mint" | "coral";
}) {
  const accentClasses = {
    brand: "bg-brand-50 text-brand-700",
    mint: "bg-[#dcfce7] text-[#006b4a]",
    coral: "bg-[#ffe4e1] text-[#b42c1a]",
  }[accent];

  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-8">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClasses}`}>
        {icon}
      </div>
      <h2 className="mt-5 text-xl font-semibold text-ink-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-500">{body}</p>
      <div className="mt-5 text-base font-semibold text-ink-900 break-all">{value}</div>
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="mt-4 inline-flex items-center gap-1 rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-800 transition-colors hover:border-ink-900 hover:bg-ink-50"
      >
        {cta} {external ? "↗" : "→"}
      </Link>
    </div>
  );
}

function WeChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.5 3C4.36 3 1 5.91 1 9.5c0 2.07 1.14 3.91 2.9 5.1L3 17l2.58-1.37c.85.22 1.75.34 2.68.34.18 0 .36 0 .53-.02A6 6 0 0 1 8.5 15c0-3.31 3.14-6 7-6 .28 0 .55.02.82.05C15.68 5.78 12.47 3 8.5 3zm-3 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 2c-3.31 0-6 2.24-6 5 0 1.52.81 2.89 2.1 3.84l-.5 1.66 2-1.1c.75.2 1.56.3 2.4.3.29 0 .58-.01.86-.04L19 21l-.45-1.5c1.55-.97 2.55-2.43 2.55-4.05 0-2.76-2.69-5-6-5zm-2 3a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm4 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.28-.14-1.65-.81-1.9-.9s-.44-.14-.62.14-.72.9-.88 1.08-.32.21-.6.07a7.57 7.57 0 0 1-2.24-1.38 8.44 8.44 0 0 1-1.55-1.94c-.16-.28 0-.43.12-.57.12-.12.28-.32.42-.48.14-.16.18-.28.28-.46.09-.19.05-.35-.02-.49s-.62-1.5-.85-2.06c-.23-.55-.46-.48-.63-.48h-.53c-.18 0-.48.07-.73.35s-.95.93-.95 2.27.97 2.63 1.1 2.81c.14.19 1.92 2.93 4.66 4.11.65.28 1.16.45 1.56.58.65.21 1.25.18 1.72.11.53-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32s-.26-.19-.53-.32z M12 2C6.48 2 2 6.48 2 12c0 1.77.47 3.43 1.3 4.88L2 22l5.25-1.38A9.93 9.93 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3a12 12 0 0 0 3.5.6c.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.3 1.1l-2.2 2.2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 4v10h16V8l-8 5L4 8zm0-2 8 5 8-5H4z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13z" />
      <circle cx="12" cy="9" r="3" />
    </svg>
  );
}

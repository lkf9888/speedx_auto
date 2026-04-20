import type { Dictionary } from "@/i18n/dictionaries";
import { company, mailtoLink, telLink, whatsappLink } from "@/lib/company";

export function ContactBar({ dict, variant = "light" }: { dict: Dictionary; variant?: "light" | "dark" }) {
  const isDark = variant === "dark";
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors";
  const primary = isDark
    ? `${base} bg-white text-ink-900 hover:bg-brand-50`
    : `${base} bg-ink-900 text-white hover:bg-brand-600`;
  const ghost = isDark
    ? `${base} border border-white/30 text-white hover:bg-white/10`
    : `${base} border border-ink-200 text-ink-700 hover:bg-ink-50`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${primary} cursor-default select-text`} title="WeChat ID">
        <WeChatIcon /> {dict.cta.contactWeChat}:&nbsp;<span className="font-bold">{company.wechatId}</span>
      </span>
      <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className={ghost}>
        <WhatsAppIcon /> {dict.cta.whatsapp}
      </a>
      <a href={telLink} className={ghost}>
        <PhoneIcon /> {company.phoneDisplay}
      </a>
      <a href={mailtoLink} className={ghost}>
        <MailIcon /> {dict.cta.email}
      </a>
    </div>
  );
}

function WeChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.5 3C4.36 3 1 5.91 1 9.5c0 2.07 1.14 3.91 2.9 5.1L3 17l2.58-1.37c.85.22 1.75.34 2.68.34.18 0 .36 0 .53-.02A6 6 0 0 1 8.5 15c0-3.31 3.14-6 7-6 .28 0 .55.02.82.05C15.68 5.78 12.47 3 8.5 3zm-3 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 2c-3.31 0-6 2.24-6 5 0 1.52.81 2.89 2.1 3.84l-.5 1.66 2-1.1c.75.2 1.56.3 2.4.3.29 0 .58-.01.86-.04L19 21l-.45-1.5c1.55-.97 2.55-2.43 2.55-4.05 0-2.76-2.69-5-6-5zm-2 3a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm4 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.28-.14-1.65-.81-1.9-.9s-.44-.14-.62.14-.72.9-.88 1.08-.32.21-.6.07a7.57 7.57 0 0 1-2.24-1.38 8.44 8.44 0 0 1-1.55-1.94c-.16-.28 0-.43.12-.57.12-.12.28-.32.42-.48.14-.16.18-.28.28-.46.09-.19.05-.35-.02-.49s-.62-1.5-.85-2.06c-.23-.55-.46-.48-.63-.48h-.53c-.18 0-.48.07-.73.35s-.95.93-.95 2.27.97 2.63 1.1 2.81c.14.19 1.92 2.93 4.66 4.11.65.28 1.16.45 1.56.58.65.21 1.25.18 1.72.11.53-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32s-.26-.19-.53-.32z M12 2C6.48 2 2 6.48 2 12c0 1.77.47 3.43 1.3 4.88L2 22l5.25-1.38A9.93 9.93 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3a12 12 0 0 0 3.5.6c.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.3 1.1l-2.2 2.2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 4v10h16V8l-8 5L4 8zm0-2 8 5 8-5H4z" />
    </svg>
  );
}

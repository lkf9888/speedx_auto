"use client";

import { usePathname } from "next/navigation";
import { ContactBar } from "@/components/ContactBar";
import type { Dictionary } from "@/i18n/dictionaries";
import { contactIntentForPath } from "@/lib/analytics";
import type { Locale } from "@/lib/site-routes";

export function FooterContactBar({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const pagePath = usePathname();

  return (
    <ContactBar
      dict={dict}
      locale={locale}
      intent={contactIntentForPath(pagePath)}
      placement="footer"
      pagePath={pagePath}
    />
  );
}

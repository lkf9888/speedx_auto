"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  emitContactClick,
  type ContactIntent,
  type ContactMethod,
  type ContactPlacement,
} from "@/lib/analytics";
import type { Locale } from "@/lib/site-routes";

interface TrackedContactLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> {
  href: string;
  method: ContactMethod;
  intent: ContactIntent;
  locale: Locale;
  placement: ContactPlacement;
  pagePath: string;
  children: ReactNode;
}

export function TrackedContactLink({
  href,
  method,
  intent,
  locale,
  placement,
  pagePath,
  children,
  ...anchorProps
}: TrackedContactLinkProps) {
  return (
    <a
      {...anchorProps}
      href={href}
      onClick={() =>
        emitContactClick({ method, intent, locale, placement, pagePath })
      }
    >
      {children}
    </a>
  );
}

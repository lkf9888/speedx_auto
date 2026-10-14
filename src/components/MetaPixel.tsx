"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadMetaPixel, trackMetaEvent } from "@/lib/meta-pixel";

/** Loads the Meta Pixel after consent and records a PageView on every route. */
export function MetaPixel() {
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const tryLoad = () => setLoaded(loadMetaPixel());
    tryLoad();
    window.addEventListener("speedx-consent-change", tryLoad);
    return () => window.removeEventListener("speedx-consent-change", tryLoad);
  }, []);

  useEffect(() => {
    if (loaded) trackMetaEvent("PageView");
  }, [loaded, pathname]);

  return null;
}

import { ImageResponse } from "next/og";
import { locales } from "@/i18n/config";

// Share card for the repair pages (Facebook, WhatsApp, iMessage, LinkedIn).
// Text only, in English for every locale: the bundled font has no Chinese
// glyphs. Swap in a real shop photo here once one is available.
export const alt = "SPEEDX AUTO: auto repair and Tesla/EV service in Richmond, BC";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const facts = ["Online estimate", "Prices published", "English · Cantonese · Mandarin"];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0b0b10",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, color: "#a68cff" }}>
          SPEEDX AUTO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
            Auto Repair & Tesla Service
          </div>
          <div style={{ display: "flex", fontSize: 40, color: "#d5d5dc" }}>
            Richmond, BC · near YVR
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", gap: 16 }}>
            {facts.map((fact) => (
              <div
                key={fact}
                style={{
                  display: "flex",
                  fontSize: 26,
                  padding: "10px 22px",
                  borderRadius: 999,
                  background: "#25252f",
                  color: "#eeeef1",
                }}
              >
                {fact}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#a8a8b6" }}>
            2980 No. 3 Rd, Richmond · speedxrental.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}

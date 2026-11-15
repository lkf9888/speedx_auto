import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "维修对话记录 · SPEEDX AUTO",
  robots: { index: false, follow: false, nocache: true },
};

/** Shared workbench conversations have their own bare layout: no site nav, footer, analytics or consent banner. */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}

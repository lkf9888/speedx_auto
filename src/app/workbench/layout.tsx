import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "维修工作台 · SPEEDX AUTO",
  robots: { index: false, follow: false },
};

/** The staff workbench has its own root layout: no public nav, footer, analytics or consent banner. */
export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "退订 · SPEEDX AUTO",
  robots: { index: false, follow: false, nocache: true },
};

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}

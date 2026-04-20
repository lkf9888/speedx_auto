import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://speedxrental.com"),
  title: {
    default: "SPEEDX AUTO — BC's #1 Turo Host & Auto Service",
    template: "%s · SPEEDX AUTO",
  },
  description:
    "BC's #1 Turo host. 100+ cars under management, 4,500+ trips completed. Turn your idle car into monthly income — full-service shop near YVR.",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-ink-900">
        {children}
      </body>
    </html>
  );
}

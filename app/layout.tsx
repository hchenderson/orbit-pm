import type { Metadata, Viewport } from "next";
import { PwaShell } from "@/components/pwa-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — Project management, simplified",
  description: "A calm, focused project workspace for small teams.",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Orbit" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6857d9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<PwaShell /></body>
    </html>
  );
}

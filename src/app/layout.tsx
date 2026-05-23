import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triptales",
  description: "Turn each day of a trip into a music-backed highlight reel.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Triptales" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables env(safe-area-inset-*)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-neutral-950">
      <body className="bg-neutral-950 text-neutral-50 antialiased">
        <AppShell>{children}</AppShell>
        <RegisterSW />
      </body>
    </html>
  );
}

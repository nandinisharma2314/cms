import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ConfigProvider } from "@/lib/portalConfig";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Next.js nested layout cannot export metadata/viewport if it's not a root layout or if it collides.

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geistSans.variable} font-sans flex min-h-full flex-col`}>
      <ConfigProvider>{children}</ConfigProvider>
    </div>
  );
}

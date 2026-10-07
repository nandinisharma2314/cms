import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ConfigProvider } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The organisation's name comes from Settings at runtime (see useDocumentTitle).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ConfigProvider>{children}</ConfigProvider>
      </body>
    </html>
  );
}

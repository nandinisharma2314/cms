import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ConfigProvider } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n";
import { LanguageSwitcherModal } from "@/components/LanguageSwitcherModal";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
});

// The organisation's name comes from Settings at runtime (see useDocumentTitle).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  other: {
    google: "notranslate",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no" className={`${jakartaSans.variable} notranslate h-full antialiased`}>
      <body className="notranslate min-h-full font-sans bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
        <ConfigProvider>
          <I18nProvider>
            {children}
            <LanguageSwitcherModal />
          </I18nProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}

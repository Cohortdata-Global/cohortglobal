import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
// Fonts are bundled with the app (no request to Google at build or page load).
import "@fontsource-variable/google-sans-flex";
import "./globals.css";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: t("siteTitle"), template: t("template") },
    description: t("siteDescription"),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: "#f4f5f7", width: "device-width", initialScale: 1 };

const clerkAppearance = {
  variables: {
    colorPrimary: "#0b6b5d",
    colorText: "#141821",
    colorTextSecondary: "#687083",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    borderRadius: "9px",
    fontFamily: "var(--font-instrument)",
  },
  elements: {
    card: "shadow-none border border-[#e2e5ea]",
    headerTitle: "font-[var(--font-bricolage)]",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang={locale}>
        <body>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
          <Toaster position="bottom-right" closeButton visibleToasts={4} gap={10} offset={20}
            toastOptions={{ classNames: { toast: "cg-toast", title: "cg-toast-title", description: "cg-toast-detail", closeButton: "cg-toast-close", success: "cg-toast-success", error: "cg-toast-error", info: "cg-toast-info", loading: "cg-toast-info" } }} />
        </body>
      </html>
    </ClerkProvider>
  );
}

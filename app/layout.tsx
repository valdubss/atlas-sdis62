import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { ToastProvider } from "@/components/ui/Toast";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

// Une seule famille, téléchargée à la construction et servie depuis le domaine.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_NAME },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}

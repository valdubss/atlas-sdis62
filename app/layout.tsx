import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/Confirm";
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
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce posé par le proxy (Content-Security-Policy) pour le script en ligne ci-dessous
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Thème mémorisé sur l'appareil appliqué avant le premier rendu : pas de flash sombre → clair */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('atlas:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}",
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}

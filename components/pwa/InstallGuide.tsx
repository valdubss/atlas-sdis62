"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowDown, Check, Copy, Download, Ellipsis, EllipsisVertical, ExternalLink, Printer, Share, SquarePlus } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { APP_NAME, ORG_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";
import {
  INSTALLABLE_EVENT,
  clearDeferredInstallPrompt,
  deferredInstallPrompt,
  detectInstallContext,
  type InstallContext,
} from "@/lib/pwa/platform";

// --- Lecture de l'appareil et de l'invite Android sans setState dans un effet --------------
let cachedContext: InstallContext | null = null;
const noopSubscribe = () => () => {};
const readContext = () => (cachedContext ??= detectInstallContext());
const subscribeInstallable = (cb: () => void) => {
  window.addEventListener(INSTALLABLE_EVENT, cb);
  return () => window.removeEventListener(INSTALLABLE_EVENT, cb);
};

type Step = { icon: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode };

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3.5 rounded-[16px] bg-bg-2 px-4 py-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-fill text-[14px] font-semibold text-white" aria-hidden="true">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[16px] font-medium leading-snug text-text-1">{s.title}{s.icon}</p>
            {s.detail && <p className="mt-1 text-[14px] leading-snug text-text-2">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-bg-0 px-1.5 text-text-1 ring-1 ring-glass-edge">{children}</span>
);

export function InstallGuide({ url, qrSvg }: { url: string; qrSvg: string }) {
  const toast = useToast();
  const ctx = useSyncExternalStore(noopSubscribe, readContext, () => null);
  const prompt = useSyncExternalStore(subscribeInstallable, deferredInstallPrompt, () => null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sans invite Chrome au bout de quelques secondes (Firefox, Samsung ancien, déjà installée) : gestes manuels
  const [promptWaitOver, setPromptWaitOver] = useState(false);

  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    const t = setTimeout(() => setPromptWaitOver(true), 2500);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      clearDeferredInstallPrompt();
      if (outcome === "accepted") setInstalled(true);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié");
    } catch {
      toast(url, 6000);
    }
  }

  const platform = ctx?.platform;
  const safari26 = (ctx?.safariMajor ?? 0) >= 26;

  let body: React.ReactNode = <div className="h-40" aria-hidden="true" />;

  if (installed || platform === "standalone") {
    body = (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bg-2 text-text-1" aria-hidden="true">
          <Check size={28} strokeWidth={2} />
        </span>
        <p className="text-[17px] font-semibold text-text-1">{platform === "standalone" ? `${APP_NAME} est installée` : "C'est fait !"}</p>
        <p className="text-[15px] text-text-2">
          {platform === "standalone"
            ? "Vous utilisez déjà l'application depuis l'écran d'accueil."
            : `L'icône ${APP_NAME} est sur votre écran d'accueil. Ouvrez-la pour vous connecter.`}
        </p>
        {platform === "standalone" && (
          <Link href="/" className="inline-flex h-12 items-center justify-center rounded-[12px] bg-red-fill px-6 text-[15px] font-semibold text-white">
            Ouvrir {APP_NAME}
          </Link>
        )}
      </div>
    );
  } else if (platform === "android") {
    const manual: Step[] = [
      { icon: <Key><EllipsisVertical size={18} aria-label="menu" /></Key>, title: "Touchez le menu", detail: "En haut à droite de Chrome (ou en bas sur Samsung Internet)." },
      { icon: <Key><Download size={16} aria-hidden="true" /></Key>, title: "« Installer l'application »", detail: "Parfois appelé « Ajouter à l'écran d'accueil »." },
      { icon: null, title: "Confirmez avec « Installer »", detail: `L'icône ${APP_NAME} apparaît sur votre écran d'accueil.` },
    ];
    body = prompt ? (
      <div className="space-y-4">
        <Button onClick={install} loading={busy} className="h-14 w-full text-[17px]">
          <Download size={20} strokeWidth={2} aria-hidden="true" />
          Installer {APP_NAME}
        </Button>
        <p className="text-center text-[14px] text-text-2">Un toucher, puis « Installer » : l&apos;icône arrive sur votre écran d&apos;accueil.</p>
        <details className="rounded-[16px] bg-bg-2 px-4 py-3 text-[14px] text-text-2">
          <summary className="cursor-pointer text-text-1">Le bouton ne fait rien ?</summary>
          <div className="mt-3"><Steps steps={manual} /></div>
        </details>
      </div>
    ) : promptWaitOver ? (
      <Steps steps={manual} />
    ) : (
      <div className="h-40" aria-hidden="true" />
    );
  } else if (platform === "android-inapp") {
    const host = url.replace(/^https?:\/\//, "");
    body = (
      <div className="space-y-4">
        <p className="text-[15px] text-text-2">
          Cette page est ouverte dans une autre application : l&apos;installation n&apos;y est pas possible. Ouvrez-la dans Chrome.
        </p>
        <a href={`intent://${host}#Intent;scheme=https;package=com.android.chrome;end`} className="flex h-14 w-full items-center justify-center gap-2 rounded-[12px] bg-red-fill text-[17px] font-semibold text-white">
          <ExternalLink size={20} strokeWidth={2} aria-hidden="true" />
          Ouvrir dans Chrome
        </a>
        <Button variant="secondary" onClick={copyLink} className="w-full">
          <Copy size={16} aria-hidden="true" /> Copier le lien
        </Button>
      </div>
    );
  } else if (platform === "ios-safari") {
    body = (
      <Steps
        steps={[
          {
            icon: <Key><Share size={16} aria-label="Partager" /></Key>,
            title: "Touchez Partager",
            detail: safari26 ? (
              <>Il se trouve dans le menu <Key><Ellipsis size={16} aria-label="plus" /></Key> en bas à droite de Safari.</>
            ) : (
              "En bas de l'écran, au centre."
            ),
          },
          {
            icon: <Key><SquarePlus size={16} aria-hidden="true" /></Key>,
            title: "« Sur l'écran d'accueil »",
            detail: "Faites défiler la liste vers le bas si besoin.",
          },
          {
            icon: null,
            title: "Touchez « Ajouter »",
            detail: safari26
              ? "Laissez « Ouvrir en tant qu'app web » activé. L'icône apparaît sur votre écran d'accueil."
              : `En haut à droite. L'icône ${APP_NAME} apparaît sur votre écran d'accueil.`,
          },
        ]}
      />
    );
  } else if (platform === "ios-browser") {
    body = (
      <Steps
        steps={[
          { icon: <Key><Share size={16} aria-label="Partager" /></Key>, title: "Touchez Partager", detail: "Dans la barre d'adresse, en haut à droite." },
          { icon: <Key><SquarePlus size={16} aria-hidden="true" /></Key>, title: "« Sur l'écran d'accueil »", detail: "Faites défiler la liste si besoin." },
          { icon: null, title: "Touchez « Ajouter »", detail: "Si l'option n'apparaît pas, copiez le lien et ouvrez-le dans Safari." },
        ]}
      />
    );
  } else if (platform === "ios-inapp") {
    body = (
      <div className="space-y-4">
        <p className="text-[15px] text-text-2">
          Cette page est ouverte dans une autre application : l&apos;installation n&apos;y est pas possible. Ouvrez-la dans Safari.
        </p>
        <Steps
          steps={[
            { icon: <Key><Ellipsis size={16} aria-label="menu" /></Key>, title: "Touchez le menu de la page", detail: "Souvent ⋯ en haut ou en bas à droite, ou l'icône boussole." },
            { icon: null, title: "« Ouvrir dans Safari »", detail: "Puis suivez les trois gestes affichés." },
          ]}
        />
        <Button variant="secondary" onClick={copyLink} className="w-full">
          <Copy size={16} aria-hidden="true" /> Copier le lien pour Safari
        </Button>
      </div>
    );
  } else if (platform === "desktop") {
    body = (
      <div className="space-y-5">
        <div className="mx-auto w-[240px] rounded-[16px] bg-white p-3 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR code vers ${url}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="text-center text-[15px] text-text-2">
          Scannez ce code avec l&apos;appareil photo du téléphone : la page d&apos;installation s&apos;ouvre et guide l&apos;agent.
        </p>
        <p className="break-all rounded-[12px] bg-bg-2 px-4 py-3 text-center text-[15px] font-medium text-text-1">{url}</p>
        <div className="grid gap-2 whitespace-nowrap sm:grid-cols-3">
          <Button variant="secondary" onClick={copyLink}>
            <Copy size={16} aria-hidden="true" /> Copier le lien
          </Button>
          <a href="/installer/qr.png" download="mysdis-installer-qr.png" className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
            <Download size={16} aria-hidden="true" /> QR code
          </a>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Affiche
          </Button>
        </div>
      </div>
    );
  }

  const mobileSteps = platform === "ios-safari" || platform === "ios-browser";

  return (
    <main className="min-h-dvh bg-bg-0 print:bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col sm:max-w-[520px] px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-[calc(env(safe-area-inset-top)+40px)] print:hidden">
        <div className="mb-6 flex justify-center">
          <Logo height={52} />
        </div>
        <h1 className="text-center text-[28px] font-semibold tracking-[-0.02em] text-text-1">Installer {APP_NAME}</h1>
        <p className="mb-6 mt-1 text-center text-[15px] text-text-2">
          {platform === "desktop" ? `Pour installer l'application sur un téléphone.` : `L'application du ${ORG_NAME} sur votre écran d'accueil.`}
        </p>
        <section className="rounded-[22px] bg-bg-1 p-4 ring-1 ring-glass-edge sm:p-5" aria-live="polite">
          {body}
        </section>
        {platform !== "standalone" && !installed && (
          <p className="mt-6 text-center text-[14px] text-text-3">
            Déjà installée ou sur ordinateur ?{" "}
            <Link href="/login" className="text-text-1 underline underline-offset-4">Se connecter</Link>
          </p>
        )}
        {mobileSteps && <div className="h-28" aria-hidden="true" />}
      </div>

      {/* iPhone : flèche vers le bouton à toucher (Partager au centre, ou ⋯ à droite sur iOS 26) */}
      {platform === "ios-safari" && !installed && (
        <div
          className={cn(
            "pointer-events-none fixed bottom-[max(env(safe-area-inset-bottom),10px)] z-10 flex flex-col items-center gap-1 motion-safe:animate-bounce print:hidden",
            safari26 ? "right-3 items-end" : "left-1/2 -translate-x-1/2",
          )}
          aria-hidden="true"
        >
          <span className="rounded-full bg-red-fill px-3 py-1.5 text-[14px] font-semibold text-white shadow-[var(--shadow-float)]">
            {safari26 ? "Touchez ⋯ ici" : "Touchez Partager ici"}
          </span>
          <ArrowDown size={28} strokeWidth={2.5} className={cn("text-red-fill", safari26 && "mr-3")} />
        </div>
      )}

      {/* Affiche imprimable (bouton « Affiche » sur ordinateur) */}
      <section className="hidden print:flex print:min-h-[95vh] print:flex-col print:items-center print:justify-center print:gap-6 print:text-center print:text-black [&_p]:text-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône statique de l'application */}
        <img src="/icons/icon-512.png" alt="" width={140} height={140} className="rounded-[32px]" />
        <h1 className="text-[44px] font-bold tracking-[-0.02em]" style={{ color: "#000" }}>Installez {APP_NAME}</h1>
        <p className="text-[22px]">L&apos;application interne du {ORG_NAME}, sur votre téléphone.</p>
        <div className="w-[320px] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="text-[20px] font-semibold">Scannez avec l&apos;appareil photo</p>
        <p className="text-[16px]">{url}</p>
        <div className="mt-2 grid max-w-[640px] grid-cols-2 gap-6 text-left text-[16px]">
          <div>
            <p className="font-semibold">iPhone</p>
            <p>Partager → « Sur l&apos;écran d&apos;accueil » → Ajouter</p>
          </div>
          <div>
            <p className="font-semibold">Android</p>
            <p>Touchez « Installer {APP_NAME} »</p>
          </div>
        </div>
      </section>
    </main>
  );
}

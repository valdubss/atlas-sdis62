"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Bell, Copy, Download, Ellipsis, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { APP_NAME } from "@/lib/config";
import { pushSupported, subscribeBrowser } from "@/lib/push/client";
import { savePushSubscription } from "@/app/(app)/profil/notifications-actions";
import {
  INSTALLABLE_EVENT,
  OPEN_INSTALL_EVENT,
  clearDeferredInstallPrompt,
  deferredInstallPrompt,
  detectInstallContext,
  type InstallContext,
} from "@/lib/pwa/platform";

const HAS_VIDEO = process.env.NEXT_PUBLIC_HAS_INSTALL_VIDEO === "1";
const INSTALL_KEY = "mysdis:install-dismissed";
const PUSH_KEY = "mysdis:push-dismissed";

// --- Petits magasins lus pendant le rendu (pas de setState dans un effet) ----------------------
let cachedContext: InstallContext | null = null;
const readContext = () => (cachedContext ??= detectInstallContext());
const noopSubscribe = () => () => {};

const flagListeners = new Set<() => void>();
const subscribeFlags = (cb: () => void) => {
  flagListeners.add(cb);
  return () => flagListeners.delete(cb);
};
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function setFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {}
  flagListeners.forEach((l) => l());
}

const subscribeInstallable = (cb: () => void) => {
  window.addEventListener(INSTALLABLE_EVENT, cb);
  return () => window.removeEventListener(INSTALLABLE_EVENT, cb);
};
const readPermission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

type Step = { icon: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode };

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-bg-0 px-1.5 text-text-1 ring-1 ring-glass-edge">{children}</span>
);

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 rounded-[14px] bg-bg-1 px-3.5 py-3 ring-1 ring-glass-edge">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-fill text-[13px] font-semibold text-white" aria-hidden="true">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium leading-snug text-text-1">
              {s.title}
              {s.icon}
            </p>
            {s.detail && <p className="mt-0.5 text-[13px] leading-snug text-text-2">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Bandeau affiché au-dessus de la barre basse, une fois l'agent connecté :
 *  - dans le navigateur d'un téléphone : « Mettre MySDIS sur l'écran d'accueil ». Android : un
 *    toucher (invite Chrome) ; iPhone : guide du geste (vidéo si fournie, sinon étapes).
 *  - dans l'app installée : « Activer les notifications » si l'autorisation n'a jamais été demandée
 *    (sur iPhone, c'est seulement possible depuis l'icône).
 * Fermé une fois, il ne revient pas sur cet appareil ; le profil garde l'accès au guide.
 */
export function HomeScreenPrompt() {
  const toast = useToast();
  const ctx = useSyncExternalStore(noopSubscribe, readContext, () => null);
  const prompt = useSyncExternalStore(subscribeInstallable, deferredInstallPrompt, () => null);
  const installDismissed = useSyncExternalStore(subscribeFlags, () => readFlag(INSTALL_KEY), () => true);
  const pushDismissed = useSyncExternalStore(subscribeFlags, () => readFlag(PUSH_KEY), () => true);
  const permission = useSyncExternalStore(noopSubscribe, readPermission, () => "unsupported");
  const [sheet, setSheet] = useState(false);
  const [pushDone, setPushDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const open = () => setSheet(true);
    const installed = () => setFlag(INSTALL_KEY);
    window.addEventListener(OPEN_INSTALL_EVENT, open);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener(OPEN_INSTALL_EVENT, open);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const platform = ctx?.platform;
  const safari26 = (ctx?.safariMajor ?? 0) >= 26;
  const mobileBrowser = platform !== undefined && platform !== "standalone" && platform !== "desktop";
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const showInstall = mobileBrowser && !installDismissed;
  const showPush = !showInstall && !pushDone && !pushDismissed && permission === "default" && Boolean(vapid) && pushSupported() && (platform === "standalone" || platform === "android");

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      clearDeferredInstallPrompt();
      if (outcome === "accepted") {
        setFlag(INSTALL_KEY);
        toast(`${APP_NAME} est sur votre écran d'accueil`);
      }
      return;
    }
    setSheet(true);
  }

  function enablePush() {
    start(async () => {
      try {
        const sub = await subscribeBrowser(vapid!);
        const r = await savePushSubscription(sub, navigator.userAgent);
        if (!r.ok) throw new Error();
        setPushDone(true);
        toast("Notifications activées");
      } catch {
        setFlag(PUSH_KEY);
        toast("Notifications non activées. Vous pourrez le faire depuis votre profil.", 5000);
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast("Lien copié : ouvrez-le dans Safari");
    } catch {
      toast(window.location.origin, 6000);
    }
  }

  let guide: React.ReactNode = null;
  if (platform === "ios-safari" || platform === "ios-browser") {
    guide = (
      <div className="space-y-4">
        {HAS_VIDEO && platform === "ios-safari" && (
          <video src="/videos/installer-iphone.mp4" autoPlay muted loop playsInline className="mx-auto max-h-[46dvh] rounded-[18px] ring-1 ring-glass-edge" aria-label="Démonstration du geste sur iPhone" />
        )}
        <Steps
          steps={[
            {
              icon: <Key><Share size={15} aria-label="Partager" /></Key>,
              title: "Touchez Partager",
              detail:
                platform === "ios-browser" ? "Dans la barre d'adresse, en haut à droite." : safari26 ? (
                  <>Dans le menu <Key><Ellipsis size={15} aria-label="plus" /></Key> en bas à droite de Safari.</>
                ) : (
                  "En bas de l'écran, au centre."
                ),
            },
            { icon: <Key><SquarePlus size={15} aria-hidden="true" /></Key>, title: "« Sur l'écran d'accueil »", detail: "Faites défiler la liste si besoin." },
            { icon: null, title: "Touchez « Ajouter »", detail: `Ouvrez ensuite ${APP_NAME} depuis son icône : c'est là que les notifications fonctionnent.` },
          ]}
        />
      </div>
    );
  } else if (platform === "ios-inapp" || platform === "android-inapp") {
    guide = (
      <div className="space-y-4">
        <p className="text-[15px] text-text-2">
          {APP_NAME} est ouvert dans une autre application. Ouvrez-le dans {platform === "ios-inapp" ? "Safari" : "Chrome"} (menu ⋯ de la page, « Ouvrir dans le navigateur »), puis ajoutez-le à l&apos;écran d&apos;accueil.
        </p>
        <Button variant="secondary" onClick={copyLink} className="w-full">
          <Copy size={16} aria-hidden="true" /> Copier le lien
        </Button>
      </div>
    );
  } else if (platform === "android") {
    guide = (
      <Steps
        steps={[
          { icon: <Key><EllipsisVertical size={15} aria-label="menu" /></Key>, title: "Touchez le menu", detail: "En haut à droite de Chrome (en bas sur Samsung Internet)." },
          { icon: <Key><Download size={15} aria-hidden="true" /></Key>, title: "« Installer l'application »", detail: "Ou « Ajouter à l'écran d'accueil »." },
          { icon: null, title: "Confirmez avec « Installer »" },
        ]}
      />
    );
  } else if (platform === "standalone") {
    guide = <p className="text-[15px] text-text-2">{APP_NAME} est déjà sur votre écran d&apos;accueil.</p>;
  } else if (platform === "desktop") {
    guide = <p className="text-[15px] text-text-2">Ouvrez {APP_NAME} sur votre téléphone pour l&apos;ajouter à l&apos;écran d&apos;accueil.</p>;
  }

  const bannerClass =
    "fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),12px)+76px)] z-30 mx-auto flex max-w-[560px] items-center gap-3 rounded-[20px] bg-bg-1 py-3 pl-3 pr-2 shadow-[var(--shadow-float)] ring-1 ring-glass-edge";

  return (
    <>
      {showInstall && (
        <div role="region" aria-label="Installer l'application" className={bannerClass}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icône statique de l'application */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[11px]" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight text-text-1">Ajouter à l&apos;écran d&apos;accueil</p>
            <p className="mt-0.5 text-[13px] leading-tight text-text-2">Pour recevoir les notifications.</p>
          </div>
          <Button size="sm" className="shrink-0 rounded-[10px] px-3.5" onClick={() => void install()}>
            {prompt ? "Installer" : "Comment ?"}
          </Button>
          <button type="button" onClick={() => setFlag(INSTALL_KEY)} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-3 hover:text-text-1">
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}

      {showPush && (
        <div role="region" aria-label="Notifications" className={bannerClass}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-bg-2 text-text-1" aria-hidden="true">
            <Bell size={22} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight text-text-1">Activer les notifications</p>
            <p className="mt-0.5 text-[13px] leading-tight text-text-2">Annonces, votre centre, vos messages.</p>
          </div>
          <Button size="sm" className="shrink-0 rounded-[10px] px-3.5" loading={pending} onClick={enablePush}>
            Activer
          </Button>
          <button type="button" onClick={() => setFlag(PUSH_KEY)} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-3 hover:text-text-1">
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title={`Ajouter ${APP_NAME} à l'écran d'accueil`}>
        <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {guide}
          {platform === "android" && prompt && (
            <Button className="w-full" onClick={() => void install()}>
              <Download size={18} aria-hidden="true" /> Installer {APP_NAME}
            </Button>
          )}
          {(platform === "ios-safari" || platform === "ios-browser") && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setFlag(INSTALL_KEY);
                setSheet(false);
              }}
            >
              C&apos;est fait
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Ligne du profil : rouvre le guide (visible seulement dans le navigateur d'un téléphone). */
export function HomeScreenRow() {
  const ctx = useSyncExternalStore(noopSubscribe, readContext, () => null);
  if (!ctx || ctx.platform === "standalone" || ctx.platform === "desktop") return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT))} className="pressable flex w-full items-center justify-between gap-3 px-5 py-3 text-left">
      <span>
        <span className="block text-[15px] text-text-1">Mettre {APP_NAME} sur l&apos;écran d&apos;accueil</span>
        <span className="block text-[13px] text-text-3">Indispensable pour les notifications sur iPhone</span>
      </span>
      <SquarePlus size={20} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
    </button>
  );
}

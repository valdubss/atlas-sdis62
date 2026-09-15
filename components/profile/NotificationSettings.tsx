"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, updateNotificationPrefs } from "@/app/(app)/profil/notifications-actions";
import { currentSubscription, pushSupported, subscribeBrowser, unsubscribeBrowser } from "@/lib/push/client";
import { useToast } from "@/components/ui/Toast";
import { CheckboxField } from "@/components/ui/Field";

type Prefs = { push_new_posts: boolean; push_pinned: boolean; push_center: boolean; digest_email: boolean };

/**
 * Réglages des notifications (profil) : activation des push sur cet appareil,
 * préférences, digest e-mail. Interrupteurs façon Réglages.
 */
export function NotificationSettings({ prefs: initial, hasSubscriptions }: { prefs: Prefs; hasSubscriptions: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  const [supported, setSupported] = useState(true);
  const [enabledHere, setEnabledHere] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!pushSupported()) {
      setSupported(false);
      setEnabledHere(false);
      return;
    }
    currentSubscription().then((s) => setEnabledHere(Boolean(s)));
  }, []);

  function togglePush(on: boolean) {
    start(async () => {
      try {
        if (on) {
          const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!key) throw new Error("Notifications non configurées sur le serveur.");
          const sub = await subscribeBrowser(key);
          const res = await savePushSubscription(sub, navigator.userAgent);
          if (!res.ok) throw new Error(res.error);
          setEnabledHere(true);
          toast("Notifications activées sur cet appareil");
        } else {
          const endpoint = await unsubscribeBrowser();
          if (endpoint) await removePushSubscription(endpoint);
          setEnabledHere(false);
          toast("Notifications désactivées sur cet appareil");
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Impossible de modifier les notifications.");
      }
    });
  }

  function setPref<K extends keyof Prefs>(key: K, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
    start(async () => {
      const res = await updateNotificationPrefs({ [key]: value });
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [key]: !value }));
        toast(res.error);
      }
    });
  }

  return (
    <div className="hairline [&>*]:px-5">
      <div className="py-2">
        <CheckboxField
          label="Notifications sur cet appareil"
          name="push_here"
          checked={Boolean(enabledHere)}
          disabled={pending || !supported || enabledHere === null}
          onChange={(e) => togglePush(e.target.checked)}
          hint={
            !supported
              ? "Non disponible dans ce navigateur. Sur iPhone : ajoutez d'abord ATLAS à l'écran d'accueil depuis Safari."
              : hasSubscriptions && !enabledHere
                ? "Actives sur un autre appareil"
                : undefined
          }
        />
      </div>
      <div className="py-2">
        <CheckboxField label="Nouvelles publications" name="push_new_posts" checked={prefs.push_new_posts} disabled={pending} onChange={(e) => setPref("push_new_posts", e.target.checked)} hint="Une notification à chaque mise en ligne" />
      </div>
      <div className="py-2">
        <CheckboxField label="Publications épinglées" name="push_pinned" checked={prefs.push_pinned} disabled={pending} onChange={(e) => setPref("push_pinned", e.target.checked)} hint="Les annonces importantes, même si les nouvelles publications sont coupées" />
      </div>
      <div className="py-2">
        <CheckboxField label="Nouveautés de mon centre" name="push_center" checked={prefs.push_center} disabled={pending} onChange={(e) => setPref("push_center", e.target.checked)} hint="Actus validées et événements de mon centre" />
      </div>
      <div className="py-2">
        <CheckboxField label="Résumé hebdomadaire par e-mail" name="digest_email" checked={prefs.digest_email} disabled={pending} onChange={(e) => setPref("digest_email", e.target.checked)} hint="Le lundi matin, les publications de la semaine" />
      </div>
    </div>
  );
}

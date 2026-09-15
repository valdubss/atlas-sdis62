"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, updateNotificationPrefs } from "@/app/(app)/profil/notifications-actions";
import { currentSubscription, pushSupported, subscribeBrowser, unsubscribeBrowser } from "@/lib/push/client";
import { useToast } from "@/components/ui/Toast";
import { CheckboxField, SelectField } from "@/components/ui/Field";

export type NotificationPrefs = {
  push_new_posts: boolean;
  push_pinned: boolean;
  push_center: boolean;
  push_agenda: boolean;
  push_messages: "all" | "mentions" | "none";
  digest_email: boolean;
  quiet_start: string;
  quiet_end: string;
  hide_preview: boolean;
};

/**
 * Centre de préférences : activation sur l'appareil, choix par type de
 * contenu (flashs affichés non désactivables), messagerie, agenda, plage de
 * silence (21 h – 7 h par défaut), aperçu masqué, résumé e-mail.
 */
export function NotificationCenter({ prefs: initial, hasSubscriptions }: { prefs: NotificationPrefs; hasSubscriptions: boolean }) {
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

  function save<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    start(async () => {
      const res = await updateNotificationPrefs({ [key]: value });
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [key]: previous }));
        toast(res.error);
      }
    });
  }

  const row = "py-2";
  return (
    <div className="hairline [&>*]:px-5">
      <div className={row}>
        <CheckboxField
          label="Notifications sur cet appareil"
          name="push_here"
          checked={Boolean(enabledHere)}
          disabled={pending || !supported || enabledHere === null}
          onChange={(e) => togglePush(e.target.checked)}
          hint={!supported ? "Non disponible dans ce navigateur. Sur iPhone : ajoutez d'abord ATLAS à l'écran d'accueil depuis Safari." : hasSubscriptions && !enabledHere ? "Actives sur un autre appareil" : undefined}
        />
      </div>
      <div className={row}>
        <CheckboxField label="Flashs" name="push_flash" checked disabled hint="Toujours envoyés : ce sont les messages prioritaires du SDIS, même pendant la plage de silence." />
      </div>
      <div className={row}>
        <CheckboxField label="Nouvelles publications" name="push_new_posts" checked={prefs.push_new_posts} disabled={pending} onChange={(e) => save("push_new_posts", e.target.checked)} hint="Une notification à chaque mise en ligne, jamais de rappel" />
      </div>
      <div className={row}>
        <CheckboxField label="Publications épinglées" name="push_pinned" checked={prefs.push_pinned} disabled={pending} onChange={(e) => save("push_pinned", e.target.checked)} hint="Les annonces importantes, même si les nouvelles publications sont coupées" />
      </div>
      <div className={row}>
        <CheckboxField label="Nouveautés de mon centre" name="push_center" checked={prefs.push_center} disabled={pending} onChange={(e) => save("push_center", e.target.checked)} hint="Actus validées et événements de mon centre" />
      </div>
      <div className={row}>
        <CheckboxField label="Agenda : rappel la veille" name="push_agenda" checked={prefs.push_agenda} disabled={pending} onChange={(e) => save("push_agenda", e.target.checked)} hint="Dans l'app, la veille d'un événement" />
      </div>
      <div className="py-3">
        <SelectField label="Messagerie" name="push_messages" value={prefs.push_messages} disabled={pending} onChange={(e) => save("push_messages", e.target.value as NotificationPrefs["push_messages"])} hint="Groupes de travail du service communication (une push par conversation, 10 min au plus)">
          <option value="all">Tout</option>
          <option value="mentions">Mentions seulement</option>
          <option value="none">Rien</option>
        </SelectField>
      </div>
      <div className="py-3">
        <p className="text-[15px] text-text-1">Plage de silence</p>
        <p className="text-[13px] text-text-3">Les pushs reçues entre ces heures sont regroupées en une seule à la fin de la plage. Les flashs passent toujours.</p>
        <div className="mt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-text-2">
            de
            <input type="time" value={prefs.quiet_start.slice(0, 5)} disabled={pending} onChange={(e) => e.target.value && save("quiet_start", e.target.value)} aria-label="Début de la plage de silence" className="h-10 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none" />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-text-2">
            à
            <input type="time" value={prefs.quiet_end.slice(0, 5)} disabled={pending} onChange={(e) => e.target.value && save("quiet_end", e.target.value)} aria-label="Fin de la plage de silence" className="h-10 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none" />
          </label>
        </div>
      </div>
      <div className={row}>
        <CheckboxField label="Masquer l'aperçu" name="hide_preview" checked={prefs.hide_preview} disabled={pending} onChange={(e) => save("hide_preview", e.target.checked)} hint="La push indique seulement qui écrit et où, sans le texte" />
      </div>
      <div className={row}>
        <CheckboxField label="Résumé hebdomadaire par e-mail" name="digest_email" checked={prefs.digest_email} disabled={pending} onChange={(e) => save("digest_email", e.target.checked)} hint="Le lundi matin, les publications de la semaine" />
      </div>
    </div>
  );
}

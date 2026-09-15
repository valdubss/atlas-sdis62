"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Hors ligne : la page et /api/annuaire/data viennent du cache du service
 * worker (« atlas-directory ») ; on affiche la date des données. En ligne, le
 * composant rafraîchit silencieusement la copie hors ligne.
 */
export function OfflineBadge() {
  const [offline, setOffline] = useState(false);
  const [dataDate, setDataDate] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // Réseau d'abord (le SW met à jour le cache), sinon copie en cache
    fetch("/api/annuaire/data", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { generated_at?: string } | null) => d?.generated_at && setDataDate(d.generated_at))
      .catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  const when = dataDate ? new Date(dataDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : null;
  return (
    <p role="status" className="flex items-center gap-2 rounded-[12px] bg-bg-1 px-4 py-2.5 text-[13px] text-text-2">
      <WifiOff size={16} strokeWidth={1.75} aria-hidden="true" className="text-text-3" />
      Hors ligne{when ? ` — données du ${when}` : ""}. Numéros et adresses disponibles ; la carte et les agents nécessitent le réseau.
    </p>
  );
}

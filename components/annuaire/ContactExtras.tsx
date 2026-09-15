"use client";

import { Copy, Download, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";

/**
 * Actions secondaires d'une fiche : copier le numéro, enregistrer le contact
 * (.vcf), partager le lien interne (partage natif, sinon copie).
 */
export function ContactExtras({ kind, slug, name, phone }: { kind: "centre" | "service"; slug: string; name: string; phone: string | null }) {
  const toast = useToast();
  async function copyPhone() {
    if (!phone) return;
    haptic();
    try {
      await navigator.clipboard.writeText(phone);
      toast("Numéro copié");
    } catch {
      toast("Copie impossible sur cet appareil");
    }
  }
  async function share() {
    const url = `${window.location.origin}/${kind}/${slug}`;
    haptic();
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Lien copié");
      }
    } catch {
      /* partage annulé */
    }
  }
  const cls = "pressable inline-flex h-10 items-center gap-1.5 rounded-full bg-bg-2 px-3 text-[13px] font-medium text-text-1";
  return (
    <div className="flex flex-wrap gap-2" aria-label="Autres actions">
      {phone && (
        <button type="button" onClick={copyPhone} className={cls}>
          <Copy size={16} strokeWidth={1.75} aria-hidden="true" /> Copier le numéro
        </button>
      )}
      <a href={`/api/annuaire/vcard/${kind}/${slug}`} download className={cls}>
        <Download size={16} strokeWidth={1.75} aria-hidden="true" /> Enregistrer le contact
      </a>
      <button type="button" onClick={share} className={cls}>
        <Share2 size={16} strokeWidth={1.75} aria-hidden="true" /> Partager
      </button>
    </div>
  );
}

"use client";

import { Share } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { IconButton } from "./IconButton";

export function ShareButton({ slug, title }: { slug: string; title: string | null }) {
  const toast = useToast();

  async function share() {
    const url = `${window.location.origin}/post/${slug}`;
    const text = title ?? APP_NAME;
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        /* annulé */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié");
    } catch {
      window.prompt("Copiez ce lien :", url);
    }
  }

  return <IconButton label="Partager le lien interne" icon={Share} onClick={share} />;
}

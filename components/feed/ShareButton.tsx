"use client";

import { useState } from "react";
import { APP_NAME } from "@/lib/config";
import { IconButton } from "./IconButton";

export function ShareButton({ slug, title }: { slug: string; title: string | null }) {
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copiez ce lien :", url);
    }
  }

  return (
    <span className="relative">
      <IconButton label="Partager le lien interne" onClick={share}>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </IconButton>
      {copied && (
        <span
          role="status"
          className="absolute -top-9 right-0 whitespace-nowrap rounded-lg bg-navy px-2 py-1 text-xs font-semibold text-white"
        >
          Lien copié
        </span>
      )}
    </span>
  );
}

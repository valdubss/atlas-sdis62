"use client";

import { useState, useTransition } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { updateTheme } from "@/app/(app)/profil/actions";
import { applyTheme, type Theme } from "@/components/layout/ThemeApplier";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Système", icon: SunMoon },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "light", label: "Clair", icon: Sun },
];

/** Profil → Apparence : système / sombre / clair, appliqué immédiatement et enregistré. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  function choose(t: Theme) {
    setTheme(t);
    applyTheme(t);
    start(async () => {
      const r = await updateTheme(t);
      if (!r.ok) toast(r.error);
    });
  }
  return (
    <div role="radiogroup" aria-label="Thème" className="flex rounded-full bg-bg-2 p-1">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={theme === o.value} disabled={pending} onClick={() => choose(o.value)} className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium", theme === o.value ? "bg-bg-0 text-text-1" : "text-text-2")}>
          <o.icon size={16} strokeWidth={1.75} aria-hidden="true" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

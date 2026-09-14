"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { submitFeedback, type FeedbackState } from "@/app/(app)/profil/signaler/actions";
import { FEEDBACK_CATEGORIES } from "@/lib/validation/feedback";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { MediaUploader, type EditorMedia } from "@/components/studio/MediaUploader";
import { cn } from "@/lib/cn";

const initial: FeedbackState = { status: "idle" };

export function FeedbackForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(submitFeedback, initial);
  const [category, setCategory] = useState<string>("bug");
  const [shots, setShots] = useState<EditorMedia[]>([]);
  const [ctx, setCtx] = useState({ ua: "", viewport: "" });
  const fields = state.status === "error" ? state.fields ?? {} : {};

  useEffect(() => {
    setCtx({ ua: navigator.userAgent, viewport: `${window.innerWidth}×${window.innerHeight}` });
  }, []);

  if (state.status === "sent") {
    return (
      <div className="rounded-[16px] bg-bg-1 px-5 py-6" role="status">
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Merci</p>
        <p className="mt-1 text-[15px] text-text-2">Votre signalement est transmis au service communication.</p>
        <Link href="/profil" className="mt-4 inline-block text-[15px] font-medium text-text-2 hover:text-text-1">
          Retour au profil
        </Link>
      </div>
    );
  }

  const ready = shots.find((s) => s.status === "ready");
  const busy = shots.some((s) => s.status !== "ready" && s.status !== "error");

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="screenshot_id" value={ready?.id ?? ""} />
      <input type="hidden" name="ctx_path" value={from} />
      <input type="hidden" name="ctx_ua" value={ctx.ua} />
      <input type="hidden" name="ctx_viewport" value={ctx.viewport} />

      <div className="hairline rounded-[16px] bg-bg-1" role="radiogroup" aria-label="Catégorie">
        {FEEDBACK_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn("flex w-full items-center justify-between px-5 py-3 text-left", category === c.id ? "text-text-1" : "text-text-2")}
          >
            <span>
              <span className="block text-[15px]">{c.label}</span>
              <span className="block text-[13px] text-text-3">{c.hint}</span>
            </span>
            <span className={cn("ml-4 h-5 w-5 shrink-0 rounded-full border", category === c.id ? "border-[6px] border-text-1" : "border-white/20")} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <TextareaField label="Description" name="description" rows={5} placeholder="Que s'est-il passé ? Que devrait-il se passer ?" maxLength={2000} error={fields.description} />
      </section>

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <MediaUploader items={shots} onChange={setShots} accept="screenshot" />
      </section>

      <Button type="submit" className="w-full" loading={pending} disabled={busy}>
        Envoyer
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import type { StoryBar as StoryBarData, StoryGroup } from "@/lib/feed/types";
import { imageSrc, posterSrc } from "@/lib/media/url";
import { StoryRing } from "@/components/feed/StoryRing";
import { StoryViewer } from "./StoryViewer";

/** Bandeau de bulles : séries actives (non vues en premier) puis à-la-une. */
export function StoryBar({ bar, canEdit }: { bar: StoryBarData; canEdit: boolean }) {
  const groups: StoryGroup[] = [...bar.series, ...bar.highlights];
  const [open, setOpen] = useState<number | null>(null);

  if (groups.length === 0) return null;

  return (
    <>
      <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-2 pb-1 sm:-mx-8 sm:px-7" role="list" aria-label="Stories">
        {groups.map((g, i) => (
          <button key={`${g.kind}-${g.id}`} type="button" role="listitem" onClick={() => setOpen(i)} className="pressable shrink-0" aria-label={`${g.title}, ${g.count} ${g.count > 1 ? "stories" : "story"}${g.all_seen ? ", vues" : ""}`}>
            <StoryRing label={g.title} seen={g.all_seen} src={g.cover ? (g.cover.kind === "video" ? posterSrc(g.cover) : imageSrc(g.cover, "thumb")) : null} />
          </button>
        ))}
      </div>
      {open !== null && <StoryViewer groups={groups} startIndex={open} onClose={() => setOpen(null)} canEdit={canEdit} />}
    </>
  );
}

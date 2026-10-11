"use server";

import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { publishPendingPosts, type PublishedPending } from "@/lib/posts/publish-pending";

/**
 * Appelée par l'envoi de médias dès qu'un média est finalisé : publie les brouillons de
 * l'utilisateur marqués « à publier dès la fin de l'envoi » qui n'attendaient que ce média.
 */
export async function tryPublishPending(mediaId: string): Promise<{ published: PublishedPending[] }> {
  if (!z.uuid().safeParse(mediaId).success) return { published: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { published: [] };
  const published = await publishPendingPosts({ mediaId, authorId: user.id });
  if (published.length > 0) {
    after(async () => {
      try {
        await dispatchNotifications(50);
      } catch (e) {
        console.error("dispatch", e);
      }
    });
  }
  return { published };
}

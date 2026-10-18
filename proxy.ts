import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Next 16 : « proxy » remplace « middleware » (même rôle : session Supabase et gardes de routes). */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     *  - _next/static, _next/image
     *  - favicon, manifest, icônes, images publiques, bibliothèques servies depuis public/vendor
     *  - routes API cron (protégées par CRON_SECRET), vidéo (session lue par la route, ou CRON_SECRET),
     *    traitement d'image interne (api/media/variants, CRON_SECRET : sans cookie de session, le proxy
     *    le renvoyait vers /login et l'appelant recevait une page HTML, « réponse 200 »), état des services (publique)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|vendor/|api/cron/|api/video/|api/media/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

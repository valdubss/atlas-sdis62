import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     *  - _next/static, _next/image
     *  - favicon, manifest, icônes, images publiques
     *  - routes API cron (protégées par CRON_SECRET), vidéo (session lue par la route, ou CRON_SECRET) et état des services (publique)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|api/cron/|api/video/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

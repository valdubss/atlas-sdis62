import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/auth/", "/offline", "/rattachement/"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"),
  );
}

/**
 * Rafraîchit la session Supabase (cookies) et applique les gardes de routes :
 *  - non connecté → /login (sauf pages publiques) ;
 *  - compte désactivé → déconnexion + /login?erreur=desactive ;
 *  - /studio réservé aux rôles editor et admin (rôle lu dans app_metadata,
 *    synchronisé par trigger SQL ; la page studio revérifie en base).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() vérifie la signature du jeton localement (clés publiques JWKS,
  // mises en cache) et ne contacte Supabase que pour rafraîchir une session
  // expirée : pas d'aller-retour réseau à chaque page.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;

  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  if (!claims) {
    if (publicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const meta = ((claims.app_metadata as Record<string, unknown> | undefined) ?? {}) as { role?: string; is_active?: boolean; onboarded?: boolean };

  if (meta.is_active === false) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?erreur=desactive";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Première connexion : l'accueil s'affiche une fois (onboarded copié dans le JWT par trigger)
  if (meta.onboarded === false && !pathname.startsWith("/bienvenue") && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/bienvenue";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Co-rédacteurs (agents ajoutés sur une publication) : accès limité, vérifié en base par la page
  const coeditorPath = /^\/studio\/(partages|posts\/[0-9a-f-]{36})\/?$/.test(pathname);
  if (pathname.startsWith("/studio") && !coeditorPath) {
    let role = meta.role;
    if (role !== "editor" && role !== "admin") {
      // Le rôle vient d'être relevé par un admin : le jeton en poche est périmé.
      // On le rafraîchit une fois avant de refuser (évite la déconnexion manuelle).
      const { data: refreshed } = await supabase.auth.refreshSession();
      role = (refreshed.session?.user.app_metadata as { role?: string } | undefined)?.role ?? role;
    }
    if (role !== "editor" && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "?erreur=acces-studio";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

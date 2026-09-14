import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/auth/", "/offline"];

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

  // Ne pas insérer de logique entre createServerClient et getUser :
  // getUser() valide le jeton auprès de Supabase et rafraîchit les cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  if (!user) {
    if (publicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const meta = (user.app_metadata ?? {}) as { role?: string; is_active?: boolean };

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

  if (pathname.startsWith("/studio")) {
    const role = meta.role;
    if (role !== "editor" && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "?erreur=acces-studio";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

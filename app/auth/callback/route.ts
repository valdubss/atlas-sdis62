import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || /^\/[\/\\]/.test(next)) return "/";
  return next;
}

/** Page relais : les jetons placés dans le fragment par Supabase sont renvoyés en paramètres, puis la session est posée. */
function relayPage(next: string, nonce: string | null) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connexion…</title><style>body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#f5f5f6;font:15px Inter,system-ui,sans-serif}</style></head><body><p>Connexion…</p><script${nonce ? ` nonce="${nonce}"` : ""}>(function(){var h=new URLSearchParams(location.hash.replace(/^#/,""));var a=h.get("access_token"),r=h.get("refresh_token");if(a&&r){var q=new URLSearchParams({access_token:a,refresh_token:r,next:${JSON.stringify(next)}});location.replace("/auth/callback?"+q.toString())}else{location.replace("/login?erreur=lien")}})();</script></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * Point d'arrivée des liens e-mail. Formats Supabase pris en charge :
 *  - PKCE : ?code=…                         (lien demandé depuis ce navigateur, @supabase/ssr)
 *  - token : ?token_hash=…&type=magiclink   (e-mails envoyés par ATLAS)
 *  - fragment : #access_token=…             (e-mails standard Supabase ouverts hors PKCE :
 *    invitation depuis le Studio, mot de passe oublié) → page relais puis ?access_token=…
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const accessToken = searchParams.get("access_token");
  const refreshToken = searchParams.get("refresh_token");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (!code && !tokenHash && !searchParams.has("error")) {
    return relayPage(next, request.headers.get("x-nonce"));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    if (/DOMAINE_NON_AUTORISE|Database error/i.test(error.message)) return NextResponse.redirect(`${origin}/login?erreur=domaine`);
  }

  return NextResponse.redirect(`${origin}/login?erreur=lien`);
}

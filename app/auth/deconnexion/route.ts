import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REASONS = new Set(["profil", "desactive"]);

/**
 * Ferme la session puis renvoie vers /login. Utilisé quand une session existe
 * sans profil valide (compte créé avant la migration, profil supprimé…),
 * pour éviter une boucle de redirections entre / et /login.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const reason = searchParams.get("raison");
  const supabase = await createClient();
  await supabase.auth.signOut();
  const suffix = reason && REASONS.has(reason) ? `?erreur=${reason}` : "";
  return NextResponse.redirect(`${origin}/login${suffix}`);
}

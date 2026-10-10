import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateLong } from "@/lib/format";
import { DecisionForm } from "./DecisionForm";

export const metadata: Metadata = { title: "Demande de rattachement" };
export const dynamic = "force-dynamic";

type Peek = { ok: boolean; reason?: string; id?: string; status?: string; requester_name?: string; requester_email?: string; target_name?: string; requested_at?: string; expires_at?: string };

const CLOSED: Record<string, string> = {
  accepted: "Cette demande a déjà été acceptée.",
  declined: "Cette demande a déjà été refusée.",
  cancelled: "L'agent a retiré sa demande.",
  expired: "Cette demande a expiré (sept jours sans réponse). L'agent peut la renouveler depuis son profil.",
};

/**
 * Page ouverte par le lien e-mail (sans compte) : récapitulatif de la demande
 * puis bouton de confirmation. La décision ne part qu'au clic, jamais à la
 * simple ouverture du lien.
 */
export default async function MembershipDecisionPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ decision?: string }> }) {
  const [{ token }, { decision }] = await Promise.all([params, searchParams]);
  const valid = /^[0-9a-f]{48}$/.test(token);
  let peek: Peek = { ok: false, reason: "introuvable" };
  if (valid) {
    const { data } = await createAdminClient().rpc("peek_membership_by_token", { p_token: token });
    peek = (data as Peek | null) ?? peek;
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg-0 px-5 py-8">
      <div className="mx-auto w-full max-w-[480px] space-y-6">
        <Logo height={36} />
        <section className="glass rounded-[22px] p-6">
          {!peek.ok ? (
            <>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Lien invalide</h1>
              <p className="mt-2 text-[15px] text-text-2">Ce lien ne correspond à aucune demande de rattachement. Il a peut-être été tronqué par votre messagerie.</p>
            </>
          ) : peek.status !== "pending" ? (
            <>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">Demande déjà traitée</h1>
              <p className="mt-2 text-[15px] text-text-2">{CLOSED[peek.status ?? ""] ?? "Cette demande n'est plus en attente."}</p>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">
                {peek.requester_name} demande à rejoindre {peek.target_name}
              </h1>
              <p className="mt-2 text-[15px] text-text-2">
                {peek.requester_email} · demande du {formatDateLong(peek.requested_at!)}, valable jusqu&apos;au {formatDateLong(peek.expires_at!)}.
              </p>
              <p className="mt-2 text-[13px] text-text-3">Une fois accepté, cet agent voit la page du centre, ses événements et ses actualités, et apparaît parmi ses nouveaux arrivants s&apos;il l&apos;a souhaité.</p>
              <DecisionForm token={token} initialDecision={decision === "refuser" ? "refuser" : "accepter"} />
            </>
          )}
        </section>
        <p className="text-center text-[13px] text-text-3">ATLAS · application interne du SDIS 62</p>
      </div>
    </main>
  );
}

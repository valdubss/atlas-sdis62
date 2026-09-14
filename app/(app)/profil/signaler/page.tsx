import type { Metadata } from "next";
import { BackBar } from "@/components/layout/BackBar";
import { FeedbackForm } from "@/components/profile/FeedbackForm";

export const metadata: Metadata = { title: "Signaler un problème" };
export const maxDuration = 60;

export default async function SignalerPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <div className="space-y-3">
      <BackBar title="Signaler un problème" href="/profil" />
      <h1 className="pb-1 pt-1 text-[34px] font-semibold tracking-[-0.02em] leading-[1.15] text-text-1">Signaler un problème</h1>
      <p className="text-[15px] text-text-2">Votre message part au service communication. La page concernée et votre navigateur sont joints automatiquement.</p>
      <FeedbackForm from={from && from.startsWith("/") ? from : "/"} />
    </div>
  );
}

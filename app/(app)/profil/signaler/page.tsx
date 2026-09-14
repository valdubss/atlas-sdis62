import type { Metadata } from "next";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";
import { FeedbackForm } from "@/components/profile/FeedbackForm";

export const metadata: Metadata = { title: "Signaler un problème" };
export const maxDuration = 60;

export default async function SignalerPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <div className="space-y-3">
      <BackBar title="Signaler un problème" href="/profil" />
      <LargeTitle>Signaler un problème</LargeTitle>
      <p className="text-[15px] text-text-2">Votre message part au service communication. La page concernée et votre navigateur sont joints automatiquement.</p>
      <FeedbackForm from={from && from.startsWith("/") ? from : "/"} />
    </div>
  );
}

import type { Metadata } from "next";
import { fetchGroupings, fetchPendingProposals, fetchPublishedCenterPosts } from "@/lib/centres/queries";
import { CentersQueue } from "@/components/studio/CentersQueue";

export const metadata: Metadata = { title: "Centres" };
export const dynamic = "force-dynamic";

export default async function StudioCentersPage() {
  const [{ posts, events }, published, groupings] = await Promise.all([fetchPendingProposals(), fetchPublishedCenterPosts(), fetchGroupings()]);
  return <CentersQueue posts={posts} events={events} published={published} groupings={groupings} />;
}

import { redirect } from "next/navigation";

export default async function DirectoryServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/service/${slug}`);
}

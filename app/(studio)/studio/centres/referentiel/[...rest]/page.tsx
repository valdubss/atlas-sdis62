import { redirect } from "next/navigation";

/** Anciennes adresses du référentiel (liens des notifications) → espace d'administration. */
export default async function Moved({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  redirect(`/admin/centres/${rest.join("/")}`);
}

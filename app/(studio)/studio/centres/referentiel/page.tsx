import { redirect } from "next/navigation";

/** Référentiel déplacé dans l'espace d'administration. */
export default function Moved() {
  redirect("/admin/centres");
}

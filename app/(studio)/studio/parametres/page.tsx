import { redirect } from "next/navigation";

/** Déplacé dans l'espace d'administration. */
export default function Moved() {
  redirect("/admin/parametres");
}

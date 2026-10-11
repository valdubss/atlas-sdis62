"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { saveCenterContacts } from "@/app/(app)/centre/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Contacts = { chief_name: string | null; chief_email: string | null; com_name: string | null; com_email: string | null };

/**
 * Bloc réservé au service communication sur la page d'un centre : qui valide les
 * demandes de rattachement (chef de centre, responsable communication). Les
 * adresses saisies donnent aussi à ces personnes, si elles ont un compte, les
 * droits de validation et de création d'événements dans l'app.
 */
export function CenterContactsAdmin({ centerId, contacts, fallbackEmail }: { centerId: string; contacts: Contacts; fallbackEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ chief_name: contacts.chief_name ?? "", chief_email: contacts.chief_email ?? "", com_name: contacts.com_name ?? "", com_email: contacts.com_email ?? "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const recipient = form.chief_email.trim() || form.com_email.trim() || fallbackEmail || "personne (à renseigner)";

  function save() {
    start(async () => {
      const r = await saveCenterContacts(centerId, form);
      toast(r.ok ? "Contacts enregistrés" : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-[16px] bg-bg-1 px-5 py-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <ShieldCheck size={18} strokeWidth={1.75} className="shrink-0 text-text-2" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-text-1">Chef de centre et responsable com (service communication)</span>
          <span className="block truncate text-[13px] text-text-3">Les demandes partent à : {recipient}</span>
        </span>
        {open ? <ChevronUp size={18} strokeWidth={1.75} className="text-text-3" aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chef de centre" name="chief_name" value={form.chief_name} onChange={set("chief_name")} maxLength={120} placeholder="Capitaine Dupont" />
            <Field label="E-mail du chef de centre" name="chief_email" type="email" inputMode="email" value={form.chief_email} onChange={set("chief_email")} maxLength={160} placeholder="prenom.nom@sdis62.fr" />
            <Field label="Responsable communication" name="com_name" value={form.com_name} onChange={set("com_name")} maxLength={120} placeholder="Sergent Martin" />
            <Field label="E-mail du responsable com" name="com_email" type="email" inputMode="email" value={form.com_email} onChange={set("com_email")} maxLength={160} placeholder="prenom.nom@sdis62.fr" />
          </div>
          <p className="text-[13px] text-text-3">L&apos;agent dont l&apos;adresse correspond est rattaché d&apos;office à ce centre dès sa première connexion : il y publie les notes de service et les événements, valide les arrivées, et reste simple lecteur du fil départemental. Changer une adresse transfère ces droits aussitôt. Le chef reçoit les demandes de rattachement ; à défaut le responsable com ; à défaut le service communication.</p>
          <Button type="button" size="md" loading={pending} onClick={save}>
            Enregistrer
          </Button>
        </div>
      )}
    </section>
  );
}

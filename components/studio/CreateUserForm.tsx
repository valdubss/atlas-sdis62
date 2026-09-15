"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { createUser, type CreateUserState } from "@/app/(studio)/studio/utilisateurs/actions";
import { LIMITS, ROLE_LABELS } from "@/lib/config";
import { Field, SelectField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const initial: CreateUserState = { status: "idle" };

/** Mot de passe lisible et suffisamment long : lettres, chiffres, sans caractères ambigus. */
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${core.slice(0, 4)}-${core.slice(4, 8)}-${core.slice(8, 12)}`;
}

/** Création d'un compte par l'administrateur (adresse, mot de passe initial, rôle). */
export function CreateUserForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createUser, initial);
  const [password, setPassword] = useState(generatePassword);
  const [show, setShow] = useState(true);
  const router = useRouter();
  const toast = useToast();
  const fields = state.status === "error" ? state.fields ?? {} : {};

  useEffect(() => {
    if (state.status === "created") {
      toast(`Compte créé pour ${state.email}`);
      router.refresh();
      onDone();
    }
  }, [state, toast, router, onDone]);

  return (
    <form action={action} className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]" noValidate>
      <p className="text-[13px] text-text-3">
        Transmettez l&apos;adresse et le mot de passe à l&apos;agent : il pourra changer ce mot de passe dans son profil. Le compte est actif immédiatement.
      </p>
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="off" inputMode="email" placeholder="prenom.nom@sdis62.fr" error={fields.email} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" name="first_name" maxLength={60} error={fields.first_name} />
        <Field label="Nom" name="last_name" maxLength={60} error={fields.last_name} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="field-password" className="block text-[13px] font-medium text-text-2">
          Mot de passe initial
        </label>
        <div className="flex gap-2">
          <input
            id="field-password"
            name="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={LIMITS.passwordMinLength}
            aria-invalid={fields.password ? true : undefined}
            className="block h-11 w-full min-w-0 flex-1 rounded-[10px] bg-bg-2 px-3.5 font-mono text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
          />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Masquer" : "Afficher"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">
            {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
          </button>
          <button type="button" onClick={() => setPassword(generatePassword())} aria-label="Proposer un autre mot de passe" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2">
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-[13px] text-text-3">{fields.password ?? `${LIMITS.passwordMinLength} caractères minimum. Un mot de passe est proposé, vous pouvez le remplacer.`}</p>
      </div>
      <SelectField label="Rôle" name="role" defaultValue="reader" hint="Un éditeur publie et modère ; un administrateur gère aussi les comptes.">
        {(["reader", "editor", "admin"] as const).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </SelectField>
      {state.status === "error" && !Object.keys(fields).length && (
        <p role="alert" className="text-[15px] text-red-text">
          {state.message}
        </p>
      )}
      <Button type="submit" loading={pending} className="w-full">
        Créer le compte
      </Button>
    </form>
  );
}

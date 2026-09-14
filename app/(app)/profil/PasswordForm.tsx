"use client";

import { useActionState, useEffect } from "react";
import { setPassword, type ProfileState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { LIMITS } from "@/lib/config";

const initial: ProfileState = { status: "idle" };

export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const toast = useToast();

  useEffect(() => {
    if (state.status === "saved") toast("Mot de passe enregistré");
    if (state.status === "error" && !state.fields) toast(state.message);
  }, [state, toast]);

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={LIMITS.passwordMinLength}
        required
        hint={`${LIMITS.passwordMinLength} caractères minimum, différent de vos autres mots de passe.`}
        error={fields.password}
      />
      <Field label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" required error={fields.confirm} />
      <Button type="submit" variant="secondary" loading={pending}>
        Enregistrer le mot de passe
      </Button>
    </form>
  );
}

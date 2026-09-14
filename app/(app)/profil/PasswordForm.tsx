"use client";

import { useActionState } from "react";
import { setPassword, type ProfileState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { LIMITS } from "@/lib/config";

const initial: ProfileState = { status: "idle" };

export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={LIMITS.passwordMinLength}
        required
        hint={`${LIMITS.passwordMinLength} caractères minimum. Évitez un mot de passe déjà utilisé ailleurs.`}
        error={fields.password}
      />
      <Field
        label="Confirmer le mot de passe"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={fields.confirm}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" loading={pending}>
          Enregistrer le mot de passe
        </Button>
        {state.status === "saved" && (
          <span className="text-sm text-success" role="status">
            Mot de passe enregistré.
          </span>
        )}
        {state.status === "error" && !state.fields && (
          <span className="text-sm text-danger" role="alert">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

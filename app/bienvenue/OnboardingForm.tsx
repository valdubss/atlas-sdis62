"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { LIMITS } from "@/lib/config";

const initial: OnboardingState = { status: "idle" };

export function OnboardingForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action, pending] = useActionState(completeOnboarding, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" name="first_name" defaultValue={firstName} autoComplete="given-name" required error={fields.first_name} />
        <Field label="Nom" name="last_name" defaultValue={lastName} autoComplete="family-name" required error={fields.last_name} />
      </div>
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={LIMITS.passwordMinLength}
        required
        hint={`${LIMITS.passwordMinLength} caractères minimum.`}
        error={fields.password}
      />
      <Field label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" required error={fields.confirm} />
      {state.status === "error" && !state.fields && (
        <p className="text-[13px] text-red-text" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        Commencer
      </Button>
    </form>
  );
}

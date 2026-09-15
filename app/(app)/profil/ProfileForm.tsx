"use client";

import { useActionState, useEffect } from "react";
import { updateProfile, type ProfileState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import type { Profile } from "@/lib/supabase/database.types";

const initial: ProfileState = { status: "idle" };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const toast = useToast();

  useEffect(() => {
    if (state.status === "saved") toast("Profil enregistré");
    if (state.status === "error" && !state.fields) toast(state.message);
  }, [state, toast]);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" name="first_name" defaultValue={profile.first_name} autoComplete="given-name" required error={fields.first_name} />
        <Field label="Nom" name="last_name" defaultValue={profile.last_name} autoComplete="family-name" required error={fields.last_name} />
      </div>
      <Button type="submit" variant="secondary" loading={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

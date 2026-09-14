"use client";

import { useActionState, useEffect } from "react";
import { updateProfile, type ProfileState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import type { Center, Profile } from "@/lib/supabase/database.types";

const initial: ProfileState = { status: "idle" };

export function ProfileForm({ profile, centers }: { profile: Profile; centers: Center[] }) {
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
      <SelectField label="Centre ou service" name="center_id" defaultValue={profile.center_id ?? ""} error={fields.center_id}>
        <option value="">Non renseigné</option>
        {centers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <Button type="submit" variant="secondary" loading={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

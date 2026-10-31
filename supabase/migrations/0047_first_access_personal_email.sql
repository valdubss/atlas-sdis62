-- 0047 — Première connexion par matricule avec code e-mail : l'adresse personnelle de l'agent
-- devient l'identité du compte (tous les codes et liens y partent). Elle est enregistrée dans
-- le référentiel avant la création du compte, et le contrôle des domaines autorisés l'accepte.

alter table public.agents_registry
  add column if not exists personal_email text,
  add column if not exists activated_at timestamptz;
create index if not exists agents_registry_personal_email_idx on public.agents_registry (lower(personal_email));

-- Adresses autorisées : domaines (allowed_email_domains), adresses individuelles (allowed_emails)
-- et adresses personnelles liées à un matricule référencé.
create or replace function public.is_allowed_email(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.app_settings s,
         jsonb_array_elements_text(s.value) d(domain)
    where s.key = 'allowed_email_domains'
      and lower(split_part(p_email, '@', 2)) = lower(d.domain)
  )
  or exists (
    select 1
    from public.app_settings s,
         jsonb_array_elements_text(s.value) e(email)
    where s.key = 'allowed_emails'
      and lower(p_email) = lower(e.email)
  )
  or exists (
    select 1 from public.agents_registry r
    where r.personal_email is not null and lower(r.personal_email) = lower(p_email)
  )
$$;

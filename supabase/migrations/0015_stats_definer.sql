-- =============================================================================
-- 0015 — Statistiques : la fonction lit la file de notifications (réservée au
-- service) → SECURITY DEFINER, le contrôle is_editor() reste dans le corps.
-- =============================================================================
alter function public.studio_post_stats(int) security definer set search_path = public;

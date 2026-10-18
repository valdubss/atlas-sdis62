-- 0045 — Bucket public « media » créé par migration (jusqu'ici créé à la main dans le tableau de
-- bord : absent du projet de production recréé le 18/10/2026, d'où « Stockage indisponible »).
-- Idempotent : ne touche pas un bucket existant (ses réglages viennent de 0032 et 0035).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 52428800,
  array[
    'image/*', 'video/*', 'audio/*',
    'application/vnd.apple.mpegurl', 'application/x-mpegurl',
    'text/vtt', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream']
)
on conflict (id) do nothing;

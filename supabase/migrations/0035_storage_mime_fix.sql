-- =============================================================================
-- 0035 — Correctif des types autorisés dans le bucket « media » (régression 0032)
--  La liste fermée de 0032 refusait les segments HLS (video/iso.segment), les messages
--  vocaux (audio/webm, audio/mp4…) et les fichiers PDF / Word de la messagerie.
--  Familles images / vidéos / audio en joker, types applicatifs explicites.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array[
      'image/*', 'video/*', 'audio/*',
      'application/vnd.apple.mpegurl', 'application/x-mpegurl', 'application/x-mpegURL',
      'text/vtt', 'text/vtt; charset=utf-8',
      'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream']
where id = 'media';

# ATLAS v3 — plan des lots 1 à 8 (vidéo, studio, notifications, fil, stories, messagerie, centres, fiabilité)

> Statut : **proposition, en attente de validation**. Rien n'est codé. Les lots sont
> livrés dans l'ordre 1 → 8, avec arrêt après chacun. Les lots 1 à 3 sont prioritaires.
> Principe transverse : avant d'ajouter, chaque écran touché est repassé « irréprochable »
> (captures 390 × 844 et 1440 × 900, auto-critique, un élément de trop est retiré).

## 0. Points à valider avant de coder (écarts et hypothèses)

| # | Sujet | Ce que dit le brief | Ce que je propose | Pourquoi |
|---|---|---|---|---|
| 1 | **Transcodage HLS** | ffmpeg en route serveur, worker Cron ou Edge Function, sinon Bunny Stream | **Route Vercel `POST /api/video/transcode` avec `ffmpeg-static`**, `maxDuration = 300` (Fluid Compute, disponible sur Hobby), déclenchée en arrière-plan à la fin de l'upload et relancée par le cron si un job reste `processing` > 10 min. Vidéos de post ≤ 3 min, stories ≤ 30 s (déjà). **Contrat d'API abstrait** `lib/video/provider.ts` (`submit`, `status`, `playbackUrl`, `poster`) avec deux implémentations : `ffmpeg` (défaut) et `bunny` (documentée, activable par `VIDEO_PROVIDER=bunny` + clés). Supabase Edge Functions écartées : pas de ffmpeg natif, wasm trop lent. | Une vidéo 1080p de 60 s en 3 rendus `veryfast` tient dans 2 à 4 min sur une fonction 1 vCPU ; au-delà de 3 min ou si Vercel refuse `maxDuration=300` sur ce projet, bascule Bunny sans changer l'application. À vérifier au lot 1 sur le projet réel (je mesure et je documente). |
| 2 | **Transcription (sous-titres, vocaux)** | API configurable en `.env`, clé optionnelle | `TRANSCRIPTION_API_URL` + `TRANSCRIPTION_API_KEY`, protocole « OpenAI audio/transcriptions compatible » (OpenAI Whisper, Groq, Deepgram via passerelle, Mistral Voxtral). Sans clé : boutons absents. Audio extrait côté serveur (ffmpeg, mono 16 kHz) avant envoi. | Un seul format d'appel couvert par de nombreux fournisseurs, sans SDK. |
| 3 | **Texte alternatif assisté (vision)** | API vision configurable, optionnelle | `VISION_API_KEY` = clé API Claude (`claude-haiku-4-5`), image envoyée en variante 800 px, réponse en français ≤ 125 caractères, toujours éditable. Sans clé : bouton absent. | API déjà maîtrisée, coût négligeable, modèle rapide. Autre fournisseur possible via `VISION_API_URL`. |
| 4 | **Upload robuste** | multipart S3 par morceaux de 8 Mo | **Sur Supabase Storage (hébergement actuel) : protocole TUS** (`tus-js-client`, morceaux de 6 Mo, seule taille acceptée par Supabase) ; **sur S3/R2 : multipart 8 Mo** via le pilote existant. Même interface `lib/media/uploader.ts` (file d'attente, reprise, arrière-plan). | Supabase Storage n'expose pas le multipart S3 sur l'offre gratuite ; TUS donne la reprise avec le même résultat. |
| 5 | **Séries** | « série en étiquette », modèles par série, rendez-vous manqués | Il n'existe pas de notion de série aujourd'hui (tags libres, catégories masquées). **La table `categories` devient les séries** : colonnes `cadence` (`hebdo`, `mensuel`, `libre`), `template`, `expected_media`, `target_length`, `tone` ; libellé « Série » dans l'éditeur ; `FEATURES.categories` réactivé sous ce nom. Six séries créées par migration (« Une journée avec », « Vu du terrain », « Dans les coulisses », « Ils nous font confiance », « Reconnaissance », « Le Mag' »). | Réutilise le champ `posts.category_id`, les filtres du fil et les stats existantes ; pas de deuxième taxonomie. |
| 6 | **« Documents à lire »** | cités dans le calendrier, les préférences de notification, « Mon activité » | **Hors périmètre** de ces 8 lots (aucune table, aucun écran). Les mentions sont omises ; le modèle de notification prévoit la clé `documents` pour plus tard. | Rien dans le brief ne décrit ce module ; l'ajouter serait une extension de périmètre. |
| 7 | **« Chef de service com »** | destinataire possible d'une relecture | Aucun rôle de ce type. Relecture demandée à **un éditeur choisi ou à l'administrateur** ; un paramètre `app_settings.review_lead` (identifiant d'un éditeur) permet de nommer le chef de service com et de le proposer en premier. | Pas de nouveau rôle ; réversible. |
| 8 | **Messagerie : « canal existant »** | « le canal existant (général, groupements, fils de centres) devient l'onglet Messages » | **Il n'existe aucune messagerie aujourd'hui.** Le lot 6 crée tout : tables `channels`, `channel_members`, `channel_messages`, `message_reactions`, `channel_reads`, et les **canaux fixes** (général, un par groupement, un « fil » par centre) calculés par rôle, puis les groupes. | À savoir pour l'estimation : le lot 6 est le plus lourd (≈ 3 sessions). |
| 9 | **Vocaux et transcription** | appui maintenu, forme d'onde, transcription optionnelle | Enregistrement `MediaRecorder` (Opus/WebM, AAC/MP4 sur iOS), 2 min max, forme d'onde calculée à l'envoi (64 barres stockées avec le message). Transcription via le point 2. | Aucun traitement serveur hors transcription. |
| 10 | **Badge d'application** | `navigator.setAppBadge` | Utilisé pour les non-lus de la messagerie **et** de la cloche ; iOS 16.4+ en PWA, Android Chrome. Silencieux ailleurs. | — |
| 11 | **Test de charge** | flash à tout l'effectif + 5 000 ouvertures en 2 min | **k6**, exécuté contre un projet Supabase de préproduction (créé pour l'occasion, offre gratuite) et un déploiement Vercel de prévisualisation, jamais contre la production. Seuils : p95 < 800 ms sur `/`, `get_feed` < 300 ms, 0 erreur 5xx. | Protège les quotas de la base de production. |
| 12 | **Lighthouse en CI** | budget mobile ≥ 90 | GitHub Actions (`.github/workflows/quality.yml`) : `typecheck`, `lint`, `test:unit`, puis Lighthouse CI sur le déploiement de prévisualisation Vercel (`/login`, `/`, `/annuaire`), seuil 90 en performance / accessibilité. Il n'y a pas de CI aujourd'hui : elle est créée au lot 1 et enrichie ensuite. | Mesure à chaque lot comme demandé. |
| 13 | **Conservation messagerie 24 mois** | purge après 24 mois | Purge par la maintenance quotidienne existante (`runMaintenance`) ; les médias de messages passent par `purge_orphan_media`. | Aucun nouveau job. |
| 14 | **Chiffrement** | pas de bout en bout, à écrire dans la charte | Charte (`/a-propos`) et `PRIVACY.md` : « messagerie de travail, chiffrée au repos et en transit, lisible par les administrateurs pour la modération et l'export ». | — |
| 15 | **Position du fil restaurée** | au retour d'un post, d'une lightbox, d'un onglet | Déjà partiellement fait (PostOverlay sans navigation) ; le lot 4 ajoute la restauration après navigation vers `/post/[slug]` et entre onglets (mémoire de défilement par route, `sessionStorage`). | — |

Tout ce qui n'est pas listé ici est fait tel que décrit dans le brief.

---

## 1. Lot 1 — Vidéo

### Modèle et migrations (`0020_video.sql`)

- `media` : ajouter `video_status` (`uploaded`, `processing`, `ready`, `failed`), `video_error text`, `orientation` (`portrait`, `landscape`, `square`), `hls_key text` (clé du `master.m3u8`), `renditions jsonb` (`[{height, bandwidth, key}]`), `poster_source` (`auto`, `upload`, `timecode`), `poster_time_s numeric`, `transcode_started_at`, `transcode_attempts int`.
- `media_subtitles` : `id`, `media_id`, `lang` (`fr`), `source` (`upload`, `auto`), `vtt_key text`, `cues jsonb` (édition ligne par ligne), `status` (`draft`, `published`), `updated_at`.
- `post_views` : ajouter `progress smallint` (0/25/50/75/100, valeur maximale atteinte, sans horodatage fin) ; RPC `record_video_progress(p_post_id, p_pct)` (idempotente, ne fait que monter).
- `story_views` : même colonne `progress` (réutilisée par le lot 5 pour le taux de complétion).
- Enum `media_status` inchangée (images) ; la vidéo a son propre état.

### Jobs

- `POST /api/video/transcode` (`maxDuration 300`, `runtime nodejs`) : télécharge l'original, `ffprobe` (durée, orientation), génère 360p / 720p / 1080p (jamais au-dessus de la source) en HLS fMP4 (`-hls_time 4`, `-hls_playlist_type vod`, `master.m3u8`), poster à 1 s (ou au `poster_time_s`), envoie dans le stockage sous `media/<id>/hls/`, met `video_status = ready`. Appelé via `after()` à la fin de l'upload avec un jeton interne (`CRON_SECRET`).
- Cron quotidien existant : relance des jobs `processing` > 10 min (3 tentatives, puis `failed` + raison), purge des HLS des médias supprimés.
- `POST /api/video/subtitles` : extraction audio + appel transcription → `cues` ; `POST /api/video/poster` : poster depuis un timecode (ffmpeg, 1 image).

### Composants

- `lib/video/provider.ts` (+ `ffmpeg.ts`, `bunny.ts`), `lib/video/hls.ts` (playlists), `lib/video/vtt.ts` (parse / sérialise, tests Vitest).
- `components/feed/VideoPlayer.tsx` réécrit : `hls.js` (import dynamique) avec repli natif Safari, muet par défaut avec bouton son, lecture au tap, plein écran natif, reprise à la position (`localStorage` par média), vitesse 1× / 1,25× / 1,5×, cadre selon `orientation` (portrait 4:5 max dans le fil, plein en overlay), pistes VTT activées quand le son est coupé, envoi des paliers 25/50/75/100.
- Studio : `VideoStatus` (état + raison + « Relancer »), `PosterPicker` (image ou timecode avec aperçu), `SubtitlesEditor` (import `.vtt`, « Générer », édition ligne par ligne, « Publier les sous-titres »), `MediaUploader` : détection d'orientation à l'upload.
- Stats : `studio_post_stats` étend `views` avec la répartition 25/50/75/100 par vidéo.

### Écrans repassés

Carte vidéo du fil, overlay de post, viewer de story vidéo, éditeur de post (onglet vidéo), `/studio/posts/[id]`.

### Tests

Vitest : VTT parse/sérialise, découpage des paliers, choix des rendus selon la source. Playwright : « publication d'une vidéo avec sous-titres importés → lecture muette avec sous-titres → son → paliers enregistrés ». RLS : `media_subtitles` éditeurs seulement.

---

## 2. Lot 2 — Studio : calendrier, brouillons, modèles, upload

### Migrations (`0021_studio_editorial.sql`)

- `categories` → séries (point 5) : `cadence`, `template jsonb` (`{structure, fields[], expected_media, target_length, tone}`), `is_series boolean`, `sort_order`.
- `posts` : `status` gagne `in_review` ; colonnes `review_requested_to uuid`, `review_requested_at`, `review_decided_at`, `review_decision` (`approved`, `returned`) ; `lock_by uuid`, `lock_at timestamptz` (verrou d'édition), `autosave_at`.
- `post_versions` : `id`, `post_id`, `version int`, `snapshot jsonb` (titre, texte, médias, réglages), `saved_by`, `saved_at` ; conservation 30 versions.
- `post_review_comments` : `id`, `post_id`, `author_id`, `body`, `created_at`, `resolved_at` (invisibles des agents : RLS éditeurs).
- `stories`, `flashes`, `events` : rien de nouveau, le calendrier lit leurs dates.
- `media` : `fingerprint text` (SHA-256 du fichier, index) pour la détection de doublon ; `alt_source` (`manual`, `assisted`).
- Trigger : un post `in_review` ne peut passer `published` que si `review_decision = approved` ou si l'auteur de la transition est `admin`.

### Jobs

Aucun nouveau job serveur. Sauvegarde automatique toutes les 5 s par action serveur (`autosavePost`) ; verrou libéré après 10 min d'inactivité (comparaison de `lock_at`).

### Composants

- `/studio/calendrier` : `EditorialCalendar` (semaine / mois, `dnd-kit` pour le glisser-déposer, `Sans date` à gauche, tap → éditeur), `SeriesView` (une ligne par série, cadence attendue, rendez-vous manqués mis en évidence). Données : RPC `studio_calendar(from, to)` regroupant posts, stories, flashs, événements.
- Éditeur : `DraftLock` (« Modifié par Prénom — il y a 2 min », « Prendre la main »), `Autosave`, `VersionHistory` (feuille, restauration), `ReviewPanel` (demander, commenter, valider / renvoyer), `TemplatePicker` (« Nouveau post → depuis un modèle »), `SeriesTemplateForm` (Studio → Paramètres → Séries).
- Upload : `lib/media/uploader.ts` (file d'attente persistante en IndexedDB, reprise TUS / multipart, arrière-plan), `UploadQueue` (bandeau du studio), conversion HEIC (déjà) rendue systématique, `fingerprint` calculé en Web Worker, avertissement doublon, `AltTextAssist` (vision, point 3), `StoryContrastCheck` (contraste texte / image sur la zone du texte, seuil 4,5:1, avertissement avant publication).

### Écrans repassés

Tableau de bord studio, liste des publications, éditeur de post et de story, paramètres.

### Tests

Vitest : verrou (expiration 10 min), fusion autosave / versions, calcul des rendez-vous manqués, contraste. Playwright : « deux éditeurs sur un brouillon → verrou → prise de main », « relecture demandée → publication refusée → validation → publication ». RLS : commentaires de relecture invisibles d'un `reader`.

---

## 3. Lot 3 — Notifications

### Migrations (`0022_notifications_v2.sql`)

- `user_settings` : `prefs jsonb` normalisé (`{series: {slug: bool}, center: bool, messaging: 'all'|'mentions'|'none', agenda_reminder: bool}`), `quiet_start time default '21:00'`, `quiet_end time default '07:00'`, `hide_preview boolean`. Les colonnes actuelles (`push_new_posts`, `push_pinned`, `push_center`, `digest_email`) sont migrées puis conservées en lecture.
- `notification_queue` : `deliver_after timestamptz`, `group_key text` (regroupement), `dedupe_key text unique` (une seule push par contenu).
- `notifications` : `kind` étendu (`digest_night`), `read_at` déjà présent ; index 90 jours.
- `push_subscriptions` : `center_id` dénormalisé (taux d'activation par centre).
- RPC `studio_notification_stats(days)` : activation par centre, ouvertures par série (clic sur la push → `/api/push/open?n=` enregistré sans horodatage fin, jour seulement).

### Jobs

- `dispatchNotifications` : respecte `deliver_after`, `dedupe_key`, préférences par série ; pendant la plage de silence, les pushs non urgentes sont mises en attente avec `group_key = 'night:<user>:<date>'`.
- Cron : à 7 h (heure de Paris) envoi d'une push regroupée par agent (« 3 nouveautés cette nuit ») ; le cron quotidien existant passe à **toutes les heures** (Hobby : 1 cron, déclenchement horaire autorisé) pour tenir la fin de plage personnalisée à l'heure près.
- Flashs : toujours immédiats.

### Composants

- Profil → Notifications : `NotificationCenter` (par série, mon centre, flashs affichés non désactivables avec explication, messagerie, agenda), `QuietHours` (deux heures), « Masquer l'aperçu ».
- `/notifications` : déjà en place ; ajout des filtres lues / non lues, 90 jours, liens vers le contenu ; cloche avec point `--red` (déjà) confirmée dans la barre supérieure de tous les écrans.
- Studio → Statistiques : `NotificationStats` (activation par centre, ouverture par série).
- Service worker : clic sur une push → `/api/push/open` (ouverture), badge d'application.

### Tests

Vitest : plage de silence (y compris à cheval sur minuit, fuseau Paris), regroupement, `dedupe_key`, préférences par série. Playwright : « publication pendant la plage → aucune push → regroupée à 7 h (cron appelé manuellement) ». RLS : préférences propres uniquement.

---

## 4. Lot 4 — Fil, carrousel, articles, performance

### Migrations (`0023_reading.sql`)

- `post_media` : `caption text` (légende par photo, 200 caractères).
- `media` : `lqip text` (data-URI 20 px, calculé par `makeImageVariants`).
- `post_views` : `read boolean`, `interacted boolean` (réaction, commentaire, favori, vote) ; RPC `record_post_read(p_post_id)` ; `studio_post_stats` distingue affichage / lecture / interaction.
- `search_all(q)` : recherche globale (posts publiés via `posts.search`, centres, services, personnes visibles via `search_directory`).

### Composants

- `PhotoCarousel` : points de position, légende repliable, double-tap réaction avec animation, préchargement de la photo suivante ; `Lightbox` : pincement (`pinch-zoom` maison sur `transform`, double-tap zoom), clavier desktop (flèches, Échap) ; `next/image` avec `sizes` corrects ou `<img>` + `srcset` (déjà) — je garde `<img>` + `srcset` et j'ajoute LQIP en fond.
- `InfiniteFeed` : préchargement du post suivant, `ScrollRestore` (par route, `sessionStorage`), lecture qualifiée (`IntersectionObserver` 50 % pendant 2 s).
- Article : `ReadingProgress` (2 px), temps de lecture, `TableOfContents` flottant desktop (H2), reprise de position locale, typographie 17 / 1,55 sur 680 px.
- `GlobalSearch` (loupe du fil) : un champ, résultats groupés, historique local des 5 dernières recherches, tolérance aux fautes (`search_all`).

### Tests

Vitest : lecture qualifiée (visibilité / durée), temps de lecture, sommaire. Playwright : « retour du post au fil à la même position », « recherche globale avec faute ». Lighthouse mobile ≥ 90 sur `/`.

---

## 5. Lot 5 — Stories

### Migrations (`0024_stories_v2.sql`)

- `story_reactions` (`story_id`, `profile_id`, `kind` parmi les quatre du fil) — visibles de la com uniquement.
- `story_polls` (`story_id`, `question`, `options jsonb 2-4`, `x, y, w` position relative) + `story_poll_votes` ; `story_questions` (`story_id`, `prompt`, position) + `story_question_answers` (`profile_id`, `answer ≤ 200`), lecture réservée aux éditeurs.
- `story_series` (À la une) : `cover_media_id`, `sort_order` ; `title` limité à 16 caractères (contrainte).
- `story_views` : `progress` (lot 1) + `advanced boolean` (passage à la suivante).

### Composants

- `StoryViewer` : rangée des quatre réactions en bas, superpositions sondage / question (vote, réponse), envoi du taux de complétion.
- Studio : `StoryEditor` avec aperçu 9:16 et zones masquées hachurées, positionnement des superpositions au doigt (`dnd-kit`), `HighlightsManager` (réordonner par glisser, couverture, titre 16), `StoryStats` (vues, complétion, passage à la suivante, réactions, réponses aux questions).

### Tests

Vitest : positions relatives, validation des sondages. Playwright : « story avec sondage → vote → résultats », « réactions visibles dans le studio seulement ». RLS : réponses aux questions lisibles des éditeurs uniquement.

---

## 6. Lot 6 — Messagerie de travail

### Migrations (`0025_messaging.sql`) — création complète (point 8)

- Enums : `channel_type` (`general`, `grouping`, `center`, `group`), `channel_member_role` (`admin`, `member`), `channel_notif` (`all`, `mentions`, `none`), `message_type` (`text`, `media`, `system`, `voice`), `message_media` (jusqu'à 10 images, ou 1 vidéo ≤ 60 s, ou 1 fichier ≤ 25 Mo PDF / docx).
- `channels` : `id`, `type`, `name`, `subject` (objet, obligatoire pour les groupes), `photo_media_id`, `grouping_id`, `center_id`, `created_by`, `ends_at`, `read_only`, `archived_at`, `members_can_post_media boolean default true`, `last_message_at`, `created_at`. Les canaux fixes sont créés par migration (général) et par trigger (un par groupement, un par centre actif).
- `channel_members` : `channel_id`, `profile_id`, `added_by`, `added_at`, `role`, `notifications`, `pinned`, `muted_until`, `hidden_until`, `left_at` — pour les groupes ; **l'appartenance aux canaux fixes est calculée par rôle** (`is_channel_member(channel_id)` : éditeurs partout ; référents dans le général, leur groupement et leur centre).
- `channel_messages` : `id`, `channel_id`, `author_id`, `type`, `body`, `media jsonb`, `reply_to_id`, `mentions uuid[]`, `mention_all`, `voice jsonb` (`{key, duration_s, waveform[64], transcript}`), `pinned_at`, `deleted_at`, `created_at` ; index `(channel_id, created_at desc)`.
- `message_reactions` : `message_id`, `profile_id`, `emoji` (6 fixes, contrainte).
- `channel_reads` : `channel_id`, `profile_id`, `last_read_message_id`, `read_at` ; `lu_par` calculé.
- Messages système générés par triggers (ajout / retrait de membre, objet modifié, archivage annoncé).
- RLS : lecture / écriture uniquement pour `is_channel_member` ; création / modification des membres / archivage : éditeurs ; suppression d'un message : auteur (15 min) ou éditeur ; un `reader` non invité n'a **aucun** accès (aucune politique ne le couvre) ; un invité ne voit que ses groupes.
- RPC : `list_conversations()` (tri par dernier message, non-lus, aperçu, avatars mosaïque), `channel_messages_page(channel, cursor)` (40 par page), `mark_channel_read`, `search_channel(channel, q)`, `forward_message`, `export_channel` (texte).

### Jobs

- Maintenance quotidienne : rappel 48 h avant `ends_at` (notification + push aux éditeurs du groupe), passage en lecture seule et archivage à `ends_at`, purge des messages et médias > 24 mois.
- `dispatchNotifications` : regroupement par conversation (une push par 10 min au plus), respect de la plage de silence, « Prénom dans Nom du groupe » sans texte si « Masquer l'aperçu », `@tous` et mentions selon `notifications`.
- Realtime Supabase sur `channel_messages` et `message_reactions` (canal par conversation ouverte).

### Composants (`components/messages/`)

- `ConversationList` (avatar 52 px ou `AvatarMosaic` 2-4, aperçu, heure, pastille, épingle, son coupé, glissements gauche / droite, segments Tous · Non lus · Groupes · Centres, section Archivés), `NewGroupMembers` (recherche, jetons `MemberChip`, listes Service communication / Référents par groupement / Autres personnels), `NewGroupInfo` (photo carrée recadrée, nom 40, objet 120, date de fin, interrupteur).
- `Conversation` : `MessageBubble` (rayon 18 / coin 6, couleur d'auteur parmi 6 gris-bleus), `MediaGrid` (1, 2×2, +N), `MediaViewer` (défilement, téléchargement, « Utiliser dans un post » → bibliothèque du studio), `VoiceBubble` (forme d'onde, 1× / 1,5× / 2×), `FileCard`, `ReplyQuote`, `ReactionBar` (appui long, 6 emojis + actions), `ReactionPills`, `Composer` (verre, +, multi-lignes 5 max, micro / envoi, mentions `@`, verrouillage vocal), `ReadReceipts` (« Envoyé », « Vu par 4 » → liste), `PinnedBanner` (3 max), `DateSeparator`, pagination vers le haut avec position conservée.
- `GroupInfo` : photo, nom, objet, compte à rebours, actions (Notifications, Rechercher, Médias), `GroupMedia` (grille 3 colonnes, Fichiers, Liens, sélection multiple, Télécharger, Envoyer au studio), `GroupMembers` (Admin, ajouter, retirer par glissement, quitter), Modifier / Archiver / Exporter, bandeau charte.
- Barre basse : entrée **Messages** pour `editor`, `admin`, `referent`, et pour les invités ayant au moins un groupe actif (à la place de… → voir point ouvert ci-dessous). Badge d'application.

**Point ouvert (à trancher)** : la barre basse compte déjà 4 entrées (5 pour les éditeurs). Je propose : pour les éditeurs, remplacer « Studio » en barre basse par « Messages » et laisser Studio dans le profil et la barre haute ; pour les référents et invités, « Messages » remplace « Annuaire » qui reste accessible depuis le profil et la loupe. Alternative : une 5ᵉ entrée pour tous les ayants droit.

### Tests

Vitest : non-lus, accusés de lecture, regroupement des pushs, coins de bulles consécutives, mosaïque. Playwright : « création d'un groupe en deux écrans → photo → réponse → réaction → utiliser dans un post ». RLS étendu : invité limité à ses groupes, référent ne crée pas de groupe, `reader` sans aucune table, membre ne modifie pas la liste.

---

## 7. Lot 7 — Mon centre, annuaire, profil

### Migrations (`0026_centres_v2.sql`)

- `center_changes` : historique des modifications de fiche (`center_id`, `field`, `old`, `new`, `proposed_by`, `decided_by`, `decided_at`, `decision`) alimenté par les propositions de référent (photo, présentation) et les événements ; la fiche propose désormais **plusieurs champs** à la fois (photo, présentation, événements) avec validation par la com.
- `profile_history` : changements de centre et de statut (`profile_id`, `field`, `old`, `new`, `changed_at`, `changed_by`).
- `user_settings` : `theme` déjà présent (activé dans le profil).

### Composants

- Annuaire : copier un numéro, `.vcf` (`/api/annuaire/vcard/[kind]/[slug]`), « consultés récemment » (local), partage par lien interne (`/annuaire/centre/[slug]` déjà en place).
- Profil : `AvatarCropper` (recadrage carré), rattachement + centres suivis (déjà), préférences de notification (lot 3), thème, `MyActivity` (réactions, favoris, propositions, messages), `ChangeCenterFlow` (un seul écran : nouveau centre → met à jour rattachement, appartenance aux canaux de centre, préférences « mon centre », historique).

### Tests

Vitest : `.vcf`, historique. Playwright : « changement de centre → canal de centre et notifications mis à jour ».

---

## 8. Lot 8 — Fiabilité et confiance

### Migrations (`0027_reliability.sql`)

- `incidents` : `id`, `title`, `service` (`app`, `db`, `storage`, `video`, `notifications`), `started_at`, `resolved_at`, `note`, `created_by` (admin).
- `audit_log` : index par éditeur / action / période ; RPC `studio_audit(filters, cursor)` et export CSV.
- File d'envoi différé côté client (IndexedDB) pour réactions et messages ; RPC idempotentes (`client_id` unique sur `channel_messages` et réactions).

### Composants et outillage

- Hors ligne étendu : `FeedCache` passe à 20 posts (texte + vignettes), cache des documents ouverts, bandeau « Hors ligne », statut « en attente » sur réactions et messages.
- `/etat` : état des services (`/api/health` : base, stockage, vidéo, notifications) et incidents 90 jours.
- Studio → Journal : filtres, export CSV.
- `tests/load/flash.js` (k6) + README (résultats, seuils, optimisations) ; CI Lighthouse (point 12).

---

## 9. Transverse

- Migrations `0020` → `0027`, une par lot, appliquées via l'éditeur SQL (procédure connue) ; types TypeScript mis à jour à la main comme aujourd'hui.
- `DESIGN.md` : bulle, grille médias, barre de réactions, avatar mosaïque, jeton de membre, lecteur vidéo, calendrier.
- `PRIVACY.md` : lecture qualifiée, paliers vidéo, transcription, accusés de lecture, conservation des messages (24 mois), position du fil (locale).
- Dépendances nouvelles : `hls.js`, `ffmpeg-static` + `fluent-ffmpeg` (ou appel direct), `tus-js-client`, `@dnd-kit/core`, `k6` (hors npm). Aucun SDK de fournisseur.

## 10. Estimation

| Lot | Sessions de travail | Poids |
|---|---|---|
| 1 Vidéo | 2 | transcodage à mesurer sur Vercel |
| 2 Studio | 2 | calendrier + verrou + upload |
| 3 Notifications | 1 | |
| 4 Fil | 1,5 | |
| 5 Stories | 1 | |
| 6 Messagerie | 3 | création complète |
| 7 Centres / profil | 1 | |
| 8 Fiabilité | 1,5 | préproduction à créer |

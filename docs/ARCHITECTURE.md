# ATLAS — Plan d'architecture

> Plateforme d'actualités interne du SDIS 62. Diffusion descendante : le service communication publie, les agents consultent et réagissent.
> Statut : validé le 14/09/2026. Écarts d'implémentation : stockage démarré sur Supabase Storage (pilote interchangeable avec S3, voir README §8) ; catégories / centres / tags désactivés par drapeaux `FEATURES` à la demande du service ; publication programmée déclenchée à la lecture du fil en attendant pg_cron.

---

## 1. Vue d'ensemble

```
┌────────────────────────────────────────────────────────────────────────┐
│  Clients                                                               │
│  • Navigateur mobile / desktop (PWA installable)                       │
│  • Coque native iOS / Android (lot i, Capacitor) → mêmes pages web     │
└───────────────┬────────────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼────────────────────────────────────────────────────────┐
│  Vercel — Next.js 15 (App Router, TypeScript, Tailwind)                │
│  • Pages RSC (fil, post, galerie, favoris, profil, studio)             │
│  • Server Actions (mutations validées Zod)                             │
│  • Route handlers : /api/media/*, /api/push/*, /api/cron/*, /api/admin │
│  • Middleware : rafraîchissement session + garde /studio               │
│  • Traitement image : sharp (variantes WebP) dans un route handler     │
└──────┬─────────────────────────┬───────────────────────────┬───────────┘
       │ supabase-js (RLS)       │ SDK S3 v3                 │ HTTP
┌──────▼──────────┐   ┌──────────▼──────────┐   ┌────────────▼──────────┐
│ Supabase        │   │ Object Storage S3   │   │ Resend / SMTP         │
│ • Postgres+RLS  │   │ (Scaleway ou R2)    │   │ Web Push (VAPID)      │
│ • Auth (OTP)    │   │ originals/ variants/│   │                       │
│ • Realtime      │   │ videos/ posters/    │   └───────────────────────┘
│ • pg_cron+pg_net│   │ avatars/            │
└─────────────────┘   └─────────────────────┘
        ▲ upload direct navigateur → S3 (URL présignée PUT), jamais via Next
```

Principes structurants :

- **L'autorisation vit en base.** Toutes les tables ont RLS activée ; l'UI ne fait que refléter ce que la base autorise. Trois fonctions SQL `auth_role()`, `is_editor()`, `is_admin()` (SECURITY DEFINER, lecture de `profiles`) servent de base à toutes les politiques.
- **Les médias ne transitent jamais par Vercel à l'upload.** Le navigateur reçoit une URL présignée, envoie le fichier directement au bucket, puis demande au serveur de générer les variantes (le serveur lit depuis S3, pas depuis le client).
- **Une seule source de vérité pour le fil :** une fonction SQL `get_feed(...)` renvoie les posts publiés avec compteurs et état utilisateur (ma réaction, mon favori, mon vote). Le futur client natif pourra l'appeler tel quel.
- **Pas de tracking tiers, polices auto-hébergées** (`next/font` télécharge à la construction et sert depuis le domaine ; aucun appel à Google en production).

---

## 2. Schéma de données (Postgres / Supabase)

### 2.1 Types énumérés

| Type | Valeurs |
|---|---|
| `user_role` | `admin`, `editor`, `reader` |
| `post_type` | `photo`, `video`, `article`, `text`, `poll` |
| `post_status` | `draft`, `scheduled`, `published`, `archived` |
| `author_display` | `service_com`, `agent` |
| `media_kind` | `image`, `video` |
| `media_status` | `uploading`, `processing`, `ready`, `failed` |
| `reaction_kind` | `clap`, `fire`, `heart`, `muscle` (👏 🔥 ❤️ 💪) |
| `comment_status` | `visible`, `hidden`, `deleted` |
| `report_status` | `open`, `resolved`, `dismissed` |
| `story_status` | `draft`, `scheduled`, `published`, `expired`, `archived` |

### 2.2 Tables

Référentiels administrés

| Table | Colonnes principales | Notes |
|---|---|---|
| `centers` | `id`, `name`, `slug`, `sort_order`, `is_active` | Centres et services (liste déroulante du profil, filtre du fil). |
| `categories` | `id`, `name`, `slug`, `sort_order`, `is_active` | Pré-remplie : Intervention, Vie des centres, Formation, RH, Sport, Cérémonie, Prévention, Divers. |
| `app_settings` | `key` (pk), `value jsonb`, `updated_by`, `updated_at` | Nom de l'app, digest activé, domaines autorisés (miroir de l'env), etc. Lecture publique, écriture admin. |

Utilisateurs

| Table | Colonnes principales | Notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `email`, `first_name`, `last_name`, `center_id`, `role user_role` (défaut `reader`), `avatar_key`, `is_active`, `created_at`, `updated_at` | Créée par trigger `handle_new_user` qui **refuse** un domaine e-mail hors `ALLOWED_EMAIL_DOMAINS`. Aucune donnée sensible. |
| `user_settings` | `user_id` (pk), `push_pinned`, `push_followed_categories`, `digest_email`, `updated_at` | Préférences de notification. |
| `category_follows` | `user_id`, `category_id` | Catégories suivies (push). |
| `push_subscriptions` | `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at` | Web Push VAPID. |
| `device_tokens` *(lot i)* | `id`, `user_id`, `platform`, `token`, `created_at` | Push natif FCM/APNs pour la coque Capacitor. |

Contenus

| Table | Colonnes principales | Notes |
|---|---|---|
| `media` | `id`, `owner_id`, `kind`, `status`, `mime`, `size_bytes`, `original_key`, `variants jsonb` (`{thumb, medium, full}` → clés WebP), `poster_key`, `width`, `height`, `duration_s`, `alt`, `created_at` | Un enregistrement par fichier, créé **avant** l'upload (statut `uploading`). Réutilisable entre post et story. |
| `posts` | `id`, `type`, `slug` (unique), `title`, `excerpt` (chapô), `body` (Markdown), `category_id`, `center_id` (nullable), `tags text[]`, `author_id`, `author_display`, `status`, `scheduled_at`, `published_at`, `pinned_at`, `comments_enabled`, `cover_media_id`, `search tsvector` (généré, config `french`), `created_at`, `updated_at`, `deleted_at` | Trigger : **au plus 3 posts épinglés** ; slug généré depuis le titre ou la date. Index GIN sur `search` et `tags`, index sur `(status, published_at desc)`. |
| `post_media` | `post_id`, `media_id`, `position`, `alt`, `crop jsonb` | Ordre du carrousel (1 à 20, contrainte via trigger). |
| `polls` | `post_id` (pk), `question`, `closes_at` | Un sondage = un post de type `poll`. |
| `poll_options` | `id`, `poll_id`, `label`, `position` | 2 à 6 options. |
| `poll_votes` | `poll_id`, `option_id`, `user_id`, `created_at` | `unique(poll_id, user_id)`. Vote définitif. |

Stories

| Table | Colonnes principales | Notes |
|---|---|---|
| `story_series` | `id`, `title`, `cover_media_id`, `created_by`, `created_at` | Une « bulle » du bandeau = une série (ex. « Intervention A26 », « JSP Arras »). Voir question Q4. |
| `stories` | `id`, `series_id`, `media_id`, `author_id`, `overlay jsonb` (`{text, position, style}`), `link_post_id`, `display_seconds` (5–15), `status`, `scheduled_at`, `published_at`, `expires_at` (défaut `published_at + 48h`), `created_at` | Trigger de contrôle : vidéo ≤ 30 s. |
| `story_highlights` | `id`, `title`, `cover_media_id`, `position`, `is_active` | « À la une » permanents (ex. « Feux de forêt 2026 »). |
| `story_highlight_items` | `highlight_id`, `story_id`, `position` | Une story expirée peut être reprise dans plusieurs à-la-une. |
| `story_views` | `story_id`, `user_id`, `viewed_at` | `unique(story_id, user_id)`. Lecture réservée aux éditeurs. |

Interactions

| Table | Colonnes principales | Notes |
|---|---|---|
| `reactions` | `post_id`, `user_id`, `kind`, `created_at` | `unique(post_id, user_id)` → une seule réaction par personne (changer = update). |
| `comments` | `id`, `post_id`, `user_id`, `parent_id`, `body` (≤ 1000 car.), `status`, `created_at`, `edited_at` | Trigger : `parent_id` doit pointer sur un commentaire racine (**un seul niveau**) ; insertion refusée si `posts.comments_enabled = false`. |
| `comment_reports` | `id`, `comment_id`, `reporter_id`, `reason`, `status`, `resolved_by`, `created_at` | Signalements lecteurs, traités dans le studio. |
| `bookmarks` | `post_id`, `user_id`, `created_at` | Favoris. |
| `post_views` | `post_id`, `user_id`, `first_viewed_at` | `unique(post_id, user_id)`, alimente les stats. |

Exploitation

| Table | Colonnes principales | Notes |
|---|---|---|
| `audit_log` | `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `created_at` | Rempli par triggers sur `posts`, `stories`, `comments` (modération), `profiles` (rôle/désactivation), `categories`, `centers`. Lecture admin. |
| `rate_limit_events` | `user_id`, `bucket`, `created_at` | Support du rate limiting en base (voir 2.4). Purge par pg_cron. |
| `notification_queue` | `id`, `kind`, `payload jsonb`, `status`, `created_at`, `sent_at` | File d'envoi push/e-mail, consommée par `/api/cron/dispatch`. |

### 2.3 Fonctions SQL et vues

| Objet | Rôle |
|---|---|
| `auth_role()`, `is_editor()`, `is_admin()` | Helpers RLS (stable, security definer). |
| `get_feed(p_cursor timestamptz, p_category text, p_center text, p_q text, p_limit int)` | Fil paginé par curseur (`published_at, id`), avec `reaction_counts jsonb`, `comment_count`, `my_reaction`, `is_bookmarked`, `my_vote`, `poll_results` (si voté ou clos), médias ordonnés. Recherche via `search @@ websearch_to_tsquery('french', p_q)`. |
| `get_pinned_posts()` | Les ≤ 3 posts épinglés. |
| `toggle_reaction(p_post_id, p_kind)` | Insert / update / delete atomique + rate limit. |
| `vote_poll(p_post_id, p_option_id)` | Vote unique, refus si clos. |
| `get_story_bar()` | Séries actives avec indicateur « vue / non vue » pour l'utilisateur courant + à-la-une. |
| `publish_scheduled()` | Passe `scheduled → published` les posts/stories dont l'heure est atteinte et enfile les notifications. Appelée par pg_cron chaque minute. |
| `expire_stories()` | `published → expired`. pg_cron chaque minute. |
| `studio_stats(p_from, p_to)` | Vues, réactions, commentaires par post, top 5 de la semaine. Éditeurs. |
| `export_user_data(p_user_id)` / `delete_user_account(p_user_id)` | RGPD : export JSON complet, puis anonymisation des commentaires et suppression du compte auth (voir Q7). Admin. |
| Vue `gallery_images` | Toutes les images des posts publiés (photo, article, cover), filtrable par catégorie / centre / période. |

### 2.4 Politiques RLS (résumé)

| Table | `reader` | `editor` | `admin` |
|---|---|---|---|
| `profiles` | lit tous les profils actifs (nom, centre, avatar) ; modifie **son** prénom/nom/centre/avatar uniquement (le rôle est protégé par trigger) | idem reader | tout |
| `user_settings`, `category_follows`, `push_subscriptions` | CRUD sur ses propres lignes | idem | idem + lecture |
| `centers`, `categories`, `app_settings` | lecture | lecture | CRUD |
| `posts`, `post_media`, `polls`, `poll_options` | lecture si `status = 'published'` et `published_at <= now()` | tout (lecture des brouillons incluse) | tout |
| `media` | lecture si rattaché à un contenu publié | CRUD | tout |
| `stories`, `story_series`, `story_highlights`, `story_highlight_items` | lecture si publiée non expirée, ou membre d'un à-la-une actif | tout | tout |
| `reactions`, `bookmarks`, `poll_votes`, `story_views`, `post_views` | insert / delete de **ses** lignes ; lecture agrégée via fonctions | idem + lecture brute (`story_views`, `post_views`) | tout |
| `comments` | insert (si `comments_enabled`), lecture des `visible`, update de **son** corps < 15 min, pas de delete (soft via `status`) | lecture de tout, update `status` (masquer/supprimer) | tout |
| `comment_reports` | insert | lecture / update `status` | tout |
| `audit_log`, `notification_queue`, `rate_limit_events` | aucun | `audit_log` lecture de ses propres actions | lecture |

Rate limiting en base (trigger `BEFORE INSERT`) : 10 commentaires / 5 min, 60 réactions / min, 5 signalements / h par utilisateur. Erreur SQL explicite remontée en toast côté UI.

---

## 3. Stockage S3

Un seul bucket, préfixes :

```
originals/{mediaId}.{ext}          fichier source (privé, jamais servi)
variants/{mediaId}/thumb.webp      400 px  (largeur max)
variants/{mediaId}/medium.webp     1200 px
variants/{mediaId}/full.webp       2400 px
videos/{mediaId}.mp4               vidéo telle quelle (H.264)
posters/{mediaId}.jpg              poster généré côté client (<canvas>)
avatars/{userId}.webp              256 px
```

- Lecture publique via `S3_PUBLIC_URL` (CDN Scaleway Edge ou domaine R2). Les URLs sont non devinables (UUID) ; le contenu n'est pas confidentiel mais l'accès à l'app, si.
- Flux d'upload : `POST /api/media/presign` (éditeur, Zod : type MIME, taille) → crée la ligne `media` (statut `uploading`) et renvoie une URL PUT présignée (validité 15 min, `Content-Type` et `Content-Length` contraints) → le navigateur PUT directement → `POST /api/media/{id}/process` → le serveur lit l'original depuis S3, génère les 3 variantes WebP avec `sharp` (orientation EXIF corrigée, métadonnées retirées), les envoie sur S3, met `status = ready`.
- **HEIC** : `sharp` sur Vercel ne décode pas HEIC. Conversion **côté navigateur** en JPEG avant upload (`heic2any`, WASM), transparente pour l'éditeur.
- **Vidéo** : vérification H.264 côté navigateur en lisant l'atome `moov` (`mp4box.js`) : `avc1` accepté, `hvc1`/`hev1`/autres rejetés avec message. MOV re-conteneurisé côté client si H.264/AAC, sinon rejeté. Limite 200 Mo appliquée au presign.
- Limites : 20 images/post, formats `jpg png webp heic mp4 mov`.
- Politique CORS du bucket documentée dans le README (PUT depuis le domaine de l'app uniquement).

---

## 4. Authentification et rôles

- **Magic link** (`signInWithOtp`) via Supabase Auth. Contrôle du domaine e-mail à deux niveaux : dans la Server Action (message immédiat) et dans le trigger `handle_new_user` (défense en profondeur). Domaines lus depuis `ALLOWED_EMAIL_DOMAINS`.
- **Point d'extension SSO** : `lib/auth/providers.ts` déclare la liste des fournisseurs (`magic_link` actif ; `azure` en stub, configurable par `AUTH_OIDC_*`). Supabase gère nativement Azure AD/OIDC : l'ajout se fera sans changer le schéma.
- Sessions via cookies (`@supabase/ssr`), rafraîchies dans le middleware. Le middleware protège `/studio/**` (rôle `editor` ou `admin`) et redirige les non-connectés vers `/login`.
- **Premier admin** : script SQL documenté (`update profiles set role = 'admin' where email = ...`).
- Compte désactivé (`is_active = false`) : le middleware ferme la session ; RLS refuse tout.

---

## 5. Routes Next.js

```
app/
  (auth)/login                     formulaire e-mail → lien magique
  (auth)/auth/callback             échange du code, redirection
  (auth)/auth/erreur
  (app)/                           layout : TopBar (logo) + BottomNav 4 entrées
    page.tsx                       FIL : stories + épinglés + fil infini + filtres
    post/[slug]/page.tsx           lecture d'un post (article lisible, partage)
    galerie/page.tsx               grille photos + lightbox
    favoris/page.tsx
    profil/page.tsx                profil, préférences push/digest, thème
    a-propos/page.tsx
    @modal/(.)story/[seriesId]     viewer de story en route interceptée (plein écran)
    story/[seriesId]/page.tsx      fallback plein écran
  (studio)/studio/                 layout desktop : sidebar
    page.tsx                       dashboard (brouillons, programmés, stats, top 5)
    posts/, posts/new, posts/[id]  liste + éditeur de post (aperçu temps réel)
    stories/, stories/new, stories/[id], stories/archive
    a-la-une/                      gestion des highlights
    moderation/                    commentaires signalés, masquage
    parametres/categories, /centres, /utilisateurs, /notifications
    journal/                       audit_log (admin)
  api/
    media/presign, media/[id]/process
    push/subscribe, push/unsubscribe
    cron/dispatch                  vide notification_queue (push + e-mail)
    cron/digest                    hebdomadaire
    admin/users/[id]/export, admin/users/[id]/delete
  manifest.ts, sw (Serwist)
middleware.ts
```

Server Actions (dans `app/**/actions.ts`, toutes validées Zod) : `createPost`, `updatePost`, `publishPost`, `pinPost`, `deletePost`, `createStory`, `publishStory`, `addToHighlight`, `react`, `comment`, `reportComment`, `moderateComment`, `bookmark`, `vote`, `updateProfile`, `updateSettings`, `adminSetRole`, `adminDeactivate`.

Planification : **pg_cron** (inclus dans Supabase, toutes offres) appelle `publish_scheduled()` et `expire_stories()` chaque minute ; **pg_net** appelle `/api/cron/dispatch` (secret `CRON_SECRET`) dès qu'une notification est enfilée. Le digest hebdomadaire est un Vercel Cron (une exécution/semaine, compatible offre Hobby).

---

## 6. Arborescence des composants et du code

```
components/
  brand/      Logo, Ecg (SVG tracé), EcgDivider, EcgLoader, Wordmark62
  ui/         Button, IconButton, Card, Sheet (bottom sheet), Dialog, Toast,
              Avatar, Badge, Tabs, Skeleton, EmptyState (ECG plat → pic)
  layout/     TopBar, BottomNav, StudioSidebar, ThemeProvider
  feed/       InfiniteFeed, PinnedPosts, FeedFilters, SearchBar,
              PostCard + variantes (PhotoCarousel, VideoPlayer, ArticleCard,
              TextCard, PollCard), ReactionBar, CommentsSheet, CommentItem,
              BookmarkButton, ShareButton
  stories/    StoryBar, StoryBubble, StoryViewer (gestes tactiles),
              StoryProgress, HighlightRow
  gallery/    PhotoGrid, Lightbox
  studio/     Uploader (drag-drop, progression par fichier), MediaSorter,
              Cropper, AltTextField, PostForm, StoryForm, PhonePreview,
              StatsCards, TopPosts, ModerationTable, UserTable, RefTable
lib/
  config.ts             APP_NAME = "ATLAS", limites, set de réactions
  supabase/             client.ts, server.ts, middleware.ts, types.ts (généré)
  auth/                 domains.ts, providers.ts (extension SSO)
  s3/                   client.ts, keys.ts, presign.ts
  media/                variants.ts (sharp), validate-video.ts, heic.ts
  validation/           post.ts, story.ts, comment.ts, profile.ts… (Zod)
  push/                 vapid.ts, send.ts
  email/                digest.tsx (React Email), transport.ts (Resend|SMTP)
  markdown.ts           rendu sécurisé (remark + sanitize)
  feed/                 cursor.ts, types.ts
styles/tokens.css       variables CSS (couleurs extraites du logo, rayons, ombres)
supabase/migrations/    0001_init.sql, 0002_… (versionnées)
supabase/seed.sql       catégories, centres de démo
scripts/extract-colors.mjs   extraction des couleurs du logo → tokens
tests/unit/ (Vitest), tests/e2e/ (Playwright)
```

---

## 7. Direction artistique

- **Tokens** fixés après exécution de `scripts/extract-colors.mjs` sur `logo-sdis62.png` (quantification + regroupement, sortie des 6 couleurs dominantes). Valeurs provisoires : rouge `#C8102E`, marine `#1B2D5C`, fond `#F6F7F9`, gris texte secondaire `#5B6472`.
- **Typo** : Barlow Condensed 700/800 en capitales pour les titres, Inter pour le corps, via `next/font` (téléchargées à la construction, servies depuis le domaine).
- **Signature ECG** : un composant SVG unique `Ecg` paramétrable (longueur, amplitude) réutilisé en séparateur, loader (animation `stroke-dashoffset`) et état vide.
- **Mobile-first** : BottomNav (Fil, Galerie, Favoris, Profil), TopBar compacte logo sur blanc. Studio : sidebar desktop, utilisable sur tablette.
- **Mode sombre** : `prefers-color-scheme` + bascule manuelle dans le profil (classe sur `<html>`), rouge et marine conservés, fonds `#0F1523` / `#161D2E`.
- **Accessibilité** : contrastes AA vérifiés sur chaque token, focus visibles, `alt` obligatoire dans l'éditeur (champ bloquant), vidéos muettes par défaut avec bouton son.

---

## 8. Notifications, PWA, natif

- **Web Push** : `web-push` + clés VAPID. Déclencheurs : post épinglé publié, post publié dans une catégorie suivie. Enfilés dans `notification_queue`, envoyés par `/api/cron/dispatch`.
- **Digest e-mail** : Vercel Cron lundi 7 h → `/api/cron/digest` → React Email → Resend (ou SMTP via `nodemailer`). Activable dans `app_settings`, désinscription par utilisateur.
- **PWA** : `@serwist/next` — précache de la coque applicative, `NetworkFirst` pour les pages, **exclusion explicite** de `S3_PUBLIC_URL`. Manifest, icônes 192/512/maskable dérivées du logo.
- **Stores (objectif final)** : recommandation **Capacitor** (lot i) : coque iOS/Android chargeant l'app déployée, plugins Push Notifications (FCM/APNs → table `device_tokens`), Splash, Status Bar. Distribution en **app interne** : Apple Business Manager (« Custom Apps ») et Managed Google Play, ce qui évite le refus « simple site web » des stores publics. Voir Q1.

---

## 9. Sécurité et RGPD

- Zod sur chaque Server Action et route handler ; réponses d'erreur normalisées.
- Rate limiting en base (voir 2.4) + limite 10 req/min sur `/api/media/presign` par utilisateur.
- `audit_log` par triggers, non modifiable (pas de politique UPDATE/DELETE).
- Export / suppression de compte en un clic (admin) via `export_user_data` / `delete_user_account`.
- En-têtes de sécurité (CSP restreinte à `self` + `S3_PUBLIC_URL` + Supabase), cookies `HttpOnly`, `SameSite=Lax`.
- `.env.example` documenté ; aucune clé côté client hormis `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `NEXT_PUBLIC_S3_PUBLIC_URL` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

---

## 10. Lots de livraison

| Lot | Contenu | Vérification proposée |
|---|---|---|
| **a** | Projet Next 15, Tailwind, tokens provisoires, Supabase (client/serveur/middleware), `0001_init.sql` (schéma complet + RLS + fonctions), login magic link, profil, garde `/studio`, README §installation | `npm run dev`, connexion, tests RLS SQL (`supabase test db`) |
| **b** | Fil (`get_feed`), épinglés, PostCard `text`/`photo` (carrousel sur médias seedés), réactions optimistes, commentaires Realtime, favoris, partage, filtres + recherche | parcours lecteur complet avec `seed.sql` |
| **c** | Presign S3, upload direct avec progression, `sharp` variantes, HEIC client, avatars | upload d'une image depuis un formulaire minimal du studio |
| **d** | Stories : séries, viewer tactile, expiration, à-la-une, vues | publication d'une story de test |
| **e** | Studio : dashboard, éditeur de post (drag-drop, tri, recadrage, alt, aperçu), éditeur de story, modération, référentiels, utilisateurs, audit | création → programmation → publication d'un post |
| **f** | Articles (Markdown), sondages, vidéo (contrôle H.264, poster), galerie + lightbox, favoris finalisés | un post de chaque type |
| **g** | PWA, Web Push, digest, préférences | installation sur téléphone, réception d'un push |
| **h** | Vitest, Playwright (connexion, fil, publication), README complet (Supabase, Scaleway/R2, Vercel, premier admin, sauvegarde) | `npm test`, `npm run e2e` |
| **i** *(à valider)* | Capacitor iOS/Android, push natif, icônes, guide de publication interne | build Xcode / Android Studio |

Chaque lot = code + migration SQL + README mis à jour + commandes de vérification, commits atomiques en français (`feat:`, `fix:`, `chore:`).

---

## 11. Questions ouvertes avant de coder

Voir le message d'accompagnement (Q1 à Q8).

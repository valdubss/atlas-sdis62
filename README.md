# ATLAS — plateforme d'actualités interne du SDIS 62

Application web (PWA) de diffusion descendante : le service communication publie
(posts, stories, articles, galeries, vidéos, sondages), les agents consultent et
interagissent (réactions, commentaires, favoris).

- **Stack** : Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase
  (Postgres, Auth, RLS, Realtime) · stockage S3 compatible (Scaleway / R2) · Vercel.
- **Architecture** : voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Avancement** : lots (a), (b) et (c) livrés — auth, rôles, schéma SQL, RLS, fil d'actualités, publications photos / vidéo / annonce / article, upload direct vers le stockage avec variantes WebP, réactions, commentaires temps réel, favoris, recherche, studio (éditeur avec aperçu, liste, statistiques). Catégories, centres et tags sont désactivés par défaut (`FEATURES` dans `lib/config.ts`). Lot (e) : modération et gestion des utilisateurs (création de comptes par l'administrateur avec mot de passe initial). Lot (d) : stories. Lot (f) : sondages. **Agenda** (septembre 2026) : événements du service publiés depuis le Studio, ajout au calendrier du téléphone (.ics), à la place de l'onglet Galerie. Lot (g) : PWA, push, digest. **Lot 1 v2** : SSO Microsoft Entra ID (fiche DSI dans [docs/SSO-ENTRA.md](docs/SSO-ENTRA.md)), réglages de connexion (mot de passe, lien, SSO forcé), signalement intégré depuis le profil avec boîte de réception Studio → Retours et e-mail, accueil de première connexion en trois écrans. Données personnelles : [PRIVACY.md](PRIVACY.md).

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Installation locale](#2-installation-locale)
3. [Créer le projet Supabase](#3-créer-le-projet-supabase)
4. [Créer le premier administrateur](#4-créer-le-premier-administrateur)
5. [Vérifier que tout fonctionne](#5-vérifier-que-tout-fonctionne)
6. [Rôles et sécurité](#6-rôles-et-sécurité)
7. [Structure du projet](#7-structure-du-projet)
8. [Bucket S3 (Scaleway / R2)](#8-bucket-s3-scaleway--r2) — lot c
9. [Déploiement Vercel](#9-déploiement-vercel) — lot h
10. [Sauvegarde](#10-sauvegarde) — lot h
11. [Scripts npm](#11-scripts-npm)

---

## 1. Prérequis

| Outil | Version | Rôle |
|---|---|---|
| Node.js | ≥ 20 | exécution locale et build |
| npm | ≥ 10 | dépendances |
| Compte [Supabase](https://supabase.com) | — | base de données, auth |
| Supabase CLI *(optionnel)* | ≥ 2 | migrations en ligne de commande (`npx supabase`) |

## 2. Installation locale

```bash
npm install
cp .env.example .env.local
```

Renseignez `.env.local` (voir section suivante pour les valeurs Supabase), puis :

```bash
npm run dev
```

L'application est disponible sur <http://localhost:3000>. Sans session, toute page
redirige vers `/login`.

> **Design** : direction « Sombre. Verre. Silence. » décrite dans [DESIGN.md](DESIGN.md)
> (tokens, contrastes AA, références). Composants visibles dans tous leurs états sur
> `/studio/dev-ui` (éditeurs). Captures 390×844 et 1440×900 : `node scripts/screenshots.mjs`
> (serveur de dev lancé, `.env.local` renseigné) → `docs/screenshots/`.
> Écran de connexion : déposez une photo d'intervention en `public/login-bg.jpg`.
> Logo : déposez le fichier fourni en `public/logo-atlas.png` puis `node scripts/prepare-logo.mjs`
> (fond noir rendu transparent, marges rognées, icône 512 px pour la PWA) et redémarrez le serveur.

## 3. Créer le projet Supabase

### 3.1 Projet et clés

1. Sur <https://supabase.com/dashboard>, **New project** : nom `atlas`, région
   **West EU (Paris)** ou Francfort (hébergement UE), mot de passe base fort (à
   conserver dans un gestionnaire de mots de passe).
2. **Project Settings → API** : copiez dans `.env.local`
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - clé `anon` / `publishable` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - clé `service_role` / `secret` → `SUPABASE_SERVICE_ROLE_KEY` (**serveur uniquement**)

### 3.2 Appliquer le schéma

**Option A — éditeur SQL du dashboard (le plus simple)**

1. **SQL Editor → New query**, collez le contenu de chaque fichier de
   [`supabase/migrations/`](supabase/migrations/) **dans l'ordre** (`0001_…`, `0002_…`,
   `0003_…`), **Run** à chaque fois.
2. Facultatif : collez [`supabase/seed.sql`](supabase/seed.sql) (centres de démo), **Run**.

| Migration | Contenu |
|---|---|
| `0001_init.sql` | schéma complet, rôles, RLS, triggers métier, audit |
| `0002_ensure_profile.sql` | auto-réparation d'un compte sans profil |
| `0003_feed.sql` | fil paginé, recherche, réactions, favoris, commentaires temps réel, statistiques studio |
| `0004_stories.sql` | bandeau de stories, viewer, vues, à-la-une |
| `0005_polls_gallery.sql` | vote de sondage, galerie paginée |
| `0006_push_digest.sql` | file de notifications à la publication, statistiques push, préférence « nouvelles publications » |
| `0007_sso_feedback_onboarding.sql` | réglages de connexion, profil SSO prérempli, accueil de première connexion, table `feedback`, images des agents |
| `0008_fix_enqueue_kind.sql` | correctif : cast explicite vers `notification_kind` dans le trigger de mise en ligne (publication bloquée depuis 0006) |
| `0009_queue_stats.sql` | colonne `stats` sur la file de notifications (résumé d'envoi) et statistiques enrichies pour Studio → Paramètres |
| `0010_consolidation.sql` | audit de consolidation : comptages de sondage indépendants de la RLS, index manquants, 30 photos par publication, statut `processing` de la file, purge des médias orphelins, galerie sans doublon, garde-fous épinglage/commentaires/audit, `media.owner_id` nullable |
| `0011_purge_deleted_posts_media.sql` | la purge quotidienne libère les médias des publications supprimées (soft delete) |
| `0012_agenda.sql` | table `events` (agenda du service : titre, dates, lieu, description, publication liée), RLS agents/éditeurs |
| `0013_post_location.sql` | `posts.location` (lieu affiché sous l'auteur) et `post_to_json` mis à jour |
| `0014_flash_notifications_replies_stats.sql` | flash prioritaire (`flashes`, push forcé), notifications dans l'app (`notifications`, triggers publication / réponse / flash, rappel agenda), réponses aux stories (`story_replies`), statistiques détaillées (`studio_post_stats`) |
| `0015_stats_definer.sql` | `studio_post_stats` en SECURITY DEFINER (lecture de la file de notifications) |
| `0016_centres_enums.sql` | valeurs d'énumération du réseau de référents (rôle `referent`, statuts `pending` / `declined`, `push_center`, `center_type`, `post_scope`) — **à exécuter seule, avant 0017** |
| `0017_centres.sql` | réseau de référents communication (lot A) : `groupings`, `services`, `center_referents`, `center_follows`, `page_views`, fiche `centers` enrichie, publications et événements de centre (`scope`, validation, `promote_center_post`), RLS référents, `studio_center_stats` |
| `0018_centre_page.sql` | onglet « Mon centre » (lot B) : `get_center_feed`, lecture des couvertures de centre, `record_page_view`, notification des éditeurs à chaque proposition |
| `0019_annuaire.sql` | annuaire (lot C) : extensions `pg_trgm` + `unaccent`, `search_directory` (recherche tolérante aux fautes : centres, services, agents ayant choisi d'être visibles), `purge_page_views` (13 mois) |
| `0020_video.sql` | vidéo (lot 1 v3) : états `video_status`, orientation, HLS (`hls_key`, `renditions`, `hls_files`), poster (auto / image / timecode), `media_subtitles`, paliers de lecture (`post_views.progress`, `record_video_progress`, `studio_video_stats`), purge des fichiers HLS |
| `0021_studio_editorial.sql` | studio (lot 2 v3) : verrou d'édition, sauvegarde automatique, `post_versions` (30 versions), relecture (`review_status`, commentaires internes, blocage de publication hors admin, notifications), empreinte des médias (doublons), politiques `storage.objects` pour les envois reprenables (TUS), `studio_calendar` |
| `0022_notifications_v2.sql` | notifications (lot 3 v3) : préférences détaillées (`push_agenda`, `push_messages`, plage de silence, aperçu masqué), une seule push par contenu (`dedupe_key`), pushs différées et regroupées (`notification_deferred`), ouvertures (`push_opens`), `studio_notification_stats`, `schedule_hourly_dispatch` (pg_cron + pg_net) |
| `0023_reading.sql` | fil et articles (lot 4 v3) : légende par photo (`post_media.caption`), aperçu flou (`media.lqip`), lecture qualifiée (`post_views.read` / `interacted`, `record_post_read`, triggers d'interaction, `studio_reading_stats`), recherche globale `search_all` |
| `0024_stories_v2.sql` | stories (lot 5 v3) : réactions (`story_reactions`, `set_story_reaction`), sondage (`story_polls` / `story_poll_votes`, `vote_story_poll`, `story_poll_counts`), question ouverte (`story_questions` / `story_question_answers`, lecture éditeurs), à-la-une (titre ≤ 16, `reorder_highlights`), vues qualifiées (`story_views.advanced`, `record_story_progress`), `studio_story_stats` |
| `0025_messaging.sql` | messagerie de travail (lot 6 v3) : `channels` (général, un par groupement, un par centre, groupes), `channel_members`, `channel_messages`, `message_reactions`, `channel_reads` ; appartenance calculée `is_channel_member`, RPC `list_conversations` / `channel_messages_page` / `mark_channel_read` / `channel_info` / `message_seen_by` / `search_channel` / `forward_message` / `export_channel` / `set_channel_prefs` / `messaging_directory` ; messages système, notifications (`push_message`, mentions), entretien `messaging_maintenance` (rappel 48 h, archivage, purge 24 mois) ; Realtime |
| `0026_centres_v2.sql` | Mon centre / annuaire / profil (lot 7 v3) : `center_changes` (propositions de fiche multi-champs, `propose_center_changes`, `decide_center_change`), `profile_history` (centre, service, rôle, statut, trigger), `my_profile_history`, `my_activity` |
| `0027_reliability.sql` | fiabilité (lot 8 v3) : `incidents` (page /etat), journal d'audit indexé + `studio_audit` / `studio_audit_facets`, `set_reaction` idempotente et `channel_messages.client_id` (envois différés), `health_snapshot` |
| `0028_messaging_reset.sql` | messagerie vide au départ : suppression des canaux automatiques (général, groupements, centres) et de toutes les conversations |
| `0029_comments_anonymize_guard.sql` | suppression d'un compte : les commentaires sont anonymisés au lieu de bloquer la suppression |
| `0030_user_management.sql` | comptes (lot comptes) : domaines autorisés, code à 6 chiffres, `membership_requests` / `membership_tokens` (rattachement validé par le chef de centre), co-rédacteurs, réactions désactivables, événements de centre réservés aux membres |
| `0031_abuse_guards.sql` | garde-fous : `rate_limit_events`, limites d'envoi des demandes et des codes |
| `0032_rgpd_storage.sql` | RGPD complet (`export_user_data`, suppression), stockage lié aux médias déclarés |
| `0033_profiles_email_privacy.sql` | `profiles.email` réservé aux éditeurs (privilèges de colonne, vue `profiles_editor`) |
| `0034_messaging_v2.sql` | messagerie v2 : `edited_at` (modification 15 min), `message_by_id`, `channel_messages_since` (rattrapage après coupure), `channel_reads_state` (coches « lu »), `channel_reads` publié en temps réel, identité de réplication complète, membres implicites signalés dans `channel_info`, pushs : une par minute et par conversation, une mention passe toujours |
| `0035_storage_mime_fix.sql` | correctif du bucket `media` (régression 0032) : familles `image/*`, `video/*`, `audio/*` en joker, HLS, sous-titres, PDF / Word ; sans lui, transcodage vidéo, messages vocaux et fichiers de la messagerie étaient refusés (415) |
| `0036_center_notes.sql` | notes de service (fil interne du centre) : table `center_notes` (PDF ou image, épinglage), lecture réservée aux membres du centre et aux responsables, écriture par le chef de centre, le responsable com et le service communication (`can_manage_center`), `center_notes_list`, `center_author_role`, notification `note` (cloche + push « mon centre ») |
| `0037_center_contacts_attach.sql` | chefs de centre et responsables com rattachés d'office : `center_for_contact_email`, `attach_center_contacts`, trigger sur `centers` (adresses saisies ou modifiées) et sur `profiles` (première connexion), demandes en attente annulées, notification « Vous êtes chef de centre » ; profils existants rattachés sans notification |
| `0038_password_required.sql` | mot de passe obligatoire : `profiles.password_set_at` (posé à l'accueil, dans le profil, par un administrateur), `mark_password_set`, recopie `password_set` dans le jeton ; éditeurs et administrateurs existants considérés comme équipés, les lecteurs le choisissent à leur prochaine visite |
| `0039_admin_adoption.sql` | espace d'administration : `admin_adoption_stats` (comptes, inscriptions par semaine, jamais connectés, centres sans contact ou sans membre, demandes, contenu), `admin_last_sign_in` ; administrateurs seulement |

**Option B — Supabase CLI (recommandé à partir du 2ᵉ lot)**

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db push          # applique les migrations manquantes
npm run db:types              # régénère lib/supabase/database.types.ts
```

Les migrations sont versionnées dans `supabase/migrations/` ; chaque lot en ajoute
une, jamais de modification d'une migration déjà appliquée.

### 3.3 Configurer l'authentification

**Authentication → Providers → Email** :

- `Enable Email provider` : **activé**
- `Confirm email` : peut rester activé (le lien magique confirme l'adresse)
- `Secure email change` : activé

**Authentication → URL Configuration** :

- `Site URL` : `http://localhost:3000` en dev, l'URL Vercel en production
- `Redirect URLs` : ajoutez `http://localhost:3000/auth/callback` et
  `https://<votre-domaine>/auth/callback`

**Authentication → Emails → Templates → Magic Link** : le template par défaut
(`{{ .ConfirmationURL }}`) fonctionne. Vous pouvez le personnaliser en français,
par exemple :

```html
<h2>Connexion à ATLAS</h2>
<p>Cliquez sur le lien ci-dessous pour vous connecter (valable 1 heure) :</p>
<p><a href="{{ .ConfirmationURL }}">Me connecter</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
```

> **Envoi des e-mails en production** : le service e-mail intégré de Supabase est
> limité (quelques envois par heure) et réservé aux tests. Configurez un SMTP
> personnalisé dans **Authentication → SMTP Settings** (Resend, Brevo, ou le
> serveur de messagerie du SDIS) avant l'ouverture aux agents.

**SMTP personnalisé (indispensable avant l'ouverture à tous)** : sans SMTP personnalisé,
Supabase plafonne ses e-mails d'authentification à quelques envois par heure et ses modèles
ne sont pas modifiables. Deux choix :
1. renseigner `RESEND_API_KEY` et `EMAIL_FROM` sur Vercel : ATLAS envoie lui-même les e-mails de
   connexion, d'invitation et de mot de passe (lien + code) ;
2. et/ou configurer Resend comme SMTP de Supabase (Authentication → Emails → SMTP Settings :
   hôte `smtp.resend.com`, port 465, utilisateur `resend`, mot de passe = clé API, expéditeur
   `noreply@sdis62.fr`), ce qui débloque aussi l'édition des modèles. Dans les deux cas le
   domaine `sdis62.fr` doit être vérifié chez Resend (enregistrements DNS SPF et DKIM).

### 3.4 Domaines e-mail autorisés

Le contrôle est fait à deux niveaux, gardez-les alignés :

| Où | Valeur | Rôle |
|---|---|---|
| `.env.local` → `ALLOWED_EMAIL_DOMAINS=sdis62.fr` | domaines, séparés par des virgules | message immédiat sur la page de connexion |
| `.env.local` → `ALLOWED_EMAILS=…` | adresses individuelles hors domaine (ex. un administrateur externe) | idem |
| base → `app_settings.allowed_email_domains` | `["sdis62.fr"]` | le trigger `handle_new_user` refuse la création de tout compte non autorisé, même via l'API |
| base → `app_settings.allowed_emails` | `["prenom.nom@exemple.fr"]` | idem, pour les adresses individuelles |

Une adresse individuelle autorisée n'ouvre **pas** son domaine : `contact@gmail.com`
autorisé ne laisse entrer aucun autre compte `@gmail.com`.

Pour modifier les listes en base :

```sql
update public.app_settings
set value = '["sdis62.fr", "autre-domaine.fr"]'
where key = 'allowed_email_domains';

update public.app_settings
set value = '["contact.vdubois@gmail.com"]'
where key = 'allowed_emails';
```

### 3.5 Parcours de connexion

- **SSO Microsoft** (facultatif) : suivre [docs/SSO-ENTRA.md](docs/SSO-ENTRA.md), puis
  `AUTH_OIDC_PROVIDER=azure`. Un administrateur peut rendre le SSO obligatoire dans
  Studio → Paramètres.

- **Connexion** : e-mail professionnel et mot de passe. Le mot de passe est obligatoire
  (10 caractères minimum).
- **Première connexion ou mot de passe oublié** : l'agent saisit son adresse et reçoit un
  e-mail d'ATLAS (expéditeur, objet et contenu d'ATLAS, jamais de Supabase) avec un lien
  et un code à six chiffres. Le lien, ou le code saisi sur l'écran de connexion, ouvre
  l'écran d'accueil où il renseigne prénom, nom et **choisit son mot de passe**. Tant
  qu'un compte n'a pas de mot de passe, le proxy le renvoie vers cet écran
  (`profiles.password_set_at`, recopié dans le jeton `password_set`, migration `0038`).
- **Transport e-mail** : avec `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` /
  `EMAIL_FROM` (serveur de messagerie du SDIS, ou tout SMTP) ou `RESEND_API_KEY`, les
  e-mails partent d'ATLAS : expéditeur, objet (« ATLAS · votre accès », « ATLAS · nouveau
  mot de passe ») et contenu en français, lien + code. Sans transport, Supabase envoie son
  e-mail standard (modèle anglais non modifiable sans SMTP, quelques envois par heure) :
  acceptable pour tester, pas pour ouvrir à tous les agents.
- Renforcement possible : **Authentication → Providers → Email → Password requirements**
  et détection des mots de passe compromis (offre Pro).

## 4. Créer le premier administrateur

1. Connectez-vous une première fois avec votre adresse (lien magique) : le profil
   est créé automatiquement avec le rôle `reader`. Si l'adresse est hors domaine,
   ajoutez-la d'abord à `allowed_emails` (voir 3.4 ; `seed.sql` le fait pour
   l'administrateur initial).
2. Dans **SQL Editor** :

```sql
update public.profiles
set role = 'admin'
where email = 'prenom.nom@sdis62.fr';
```

3. Déconnectez-vous puis reconnectez-vous : le bouton **Studio** apparaît dans
   l'en-tête et sur la page Profil. Vous pouvez alors définir un mot de passe
   depuis la page Profil pour les connexions suivantes. Les administrateurs pourront ensuite changer
   les rôles depuis le studio (lot e).

> **Performance en développement** : `npm run dev` compile chaque page à la première
> visite, d'où des navigations lentes la première fois. Pour juger la vitesse réelle
> (préchargement des liens, pages compilées) : `npm run build` puis `npm start`.

## 5. Vérifier que tout fonctionne

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm run build         # build de production
npm run dev           # puis http://localhost:3000
```

Parcours à tester :

0. Studio → **Nouvelle publication** : glisser 2 ou 3 photos (ou une vidéo MP4),
   écrire une légende, **Publier maintenant** → la publication apparaît sur le fil
   (`/`) en carrousel plein cadre ; réagir 👏, commenter (ouvrir la même page dans un
   second onglet : le commentaire arrive en temps réel), enregistrer en favori,
   partager ; tester la recherche et les puces de catégories.
1. `/login` avec une adresse **hors** domaine → message « Seules les adresses @sdis62.fr… ».
2. `/login` avec une adresse autorisée → écran « Lien envoyé », e-mail reçu, clic →
   arrivée sur le fil avec « Bonjour ».
3. `/profil` : renseigner prénom, nom, centre → « Profil enregistré ».
4. `/studio` en tant que `reader` → redirection vers `/` avec le message d'accès refusé ;
   en tant qu'`admin` → tableau de bord du studio.
4c. Studio → **Nouvelle publication** → type **Sondage** : question, 2 à 6 réponses,
   clôture facultative → voter depuis le fil, les barres de résultats apparaissent.
   **Galerie** (barre basse) : grille de toutes les photos publiées, lightbox, lien vers
   la publication.
4a. Studio → **Stories** → **Nouvelle story** : une photo ou une vidéo (30 s max), un
   texte, une série, **Publier** → la bulle apparaît en haut du fil ; tap à droite pour
   avancer, maintien pour mettre en pause, glisser vers le bas pour fermer. Après 48 h
   (réglable), la story rejoint l'archive et peut être ajoutée à un **à-la-une**.
4b. Studio → **Utilisateurs** (admin) : changer un rôle, désactiver un compte, exporter
   ou supprimer les données d'un agent. Studio → **Modération** : signaler un
   commentaire depuis le fil avec un second compte, puis le masquer ou le laisser en ligne.
5. Désactivation : `update public.profiles set is_active = false where email = '…'` →
   à la prochaine navigation, déconnexion et message « compte désactivé ».

Vérification de la RLS directement en base : collez
[`supabase/tests/verif_rls.sql`](supabase/tests/verif_rls.sql) dans l'éditeur SQL.
Le script crée des utilisateurs de test dans une transaction annulée et affiche une
ligne `OK` / `ECHEC` par règle (onglet *Messages* ou *Logs*).

## 6. Rôles et sécurité

| Rôle | Peut |
|---|---|
| `reader` (défaut) | lire les contenus publiés, réagir, commenter, voter, enregistrer des favoris, modifier son profil (nom, centre, avatar) |
| `referent` | tout ce qu'un `reader` peut faire + proposer des actus (photos, texte, vidéo), des événements et une mise à jour de fiche **pour son centre uniquement** ; chaque proposition passe par la file de validation du Studio |
| `editor` | tout ce qui précède + créer, programmer, publier, épingler, modérer, consulter les statistiques et les vues de stories, valider / refuser / promouvoir les propositions des centres, gérer le référentiel (groupements, centres, services, référents) |
| `admin` | tout + gérer les utilisateurs (rôle, désactivation, export / suppression RGPD), catégories, centres, paramètres |

Points clés :

- **Toute l'autorisation est en base** (Row Level Security + triggers). L'UI ne fait
  que refléter ce que la base permet. Les helpers SQL `is_editor()` / `is_admin()`
  lisent la table `profiles`.
- Le rôle et l'état actif sont **copiés dans le JWT** (`app_metadata`) par trigger,
  ce qui permet au proxy (`proxy.ts`, ex-middleware, Next 16) de protéger `/studio` sans requête ; la page studio
  revérifie en base.
- Un `reader` ne peut jamais modifier `role`, `is_active` ni `email` (trigger
  `profiles_guard`).
- Règles métier en triggers : 3 posts épinglés max, 30 images par post, un seul
  niveau de réponse aux commentaires, story vidéo ≤ 30 s, rate limiting
  (10 commentaires / 5 min, 60 réactions / min, 5 signalements / h).
- `audit_log` est alimenté automatiquement (publications, stories, modération,
  changements de rôle, référentiels) et n'est ni modifiable ni supprimable via l'API.
- Fonctions RGPD : `export_user_data(uuid)` et `anonymize_user_data(uuid)` (admin).
- **Contenus de centre** : un post ou un événement rattaché à un centre (`scope = 'center'`)
  n'apparaît jamais dans le fil départemental. Le seul chemin vers le fil est
  « Publier aussi dans le fil » (`promote_center_post`), qui crée une publication
  départementale distincte créditée « Vie des centres ». Voir
  `docs/ARCHITECTURE-CENTRES.md`.

### 6.1 Réseau de référents communication

Le référentiel se gère dans **Studio → Centres → Référentiel** (groupements,
centres, services) ; la file de validation dans **Studio → Centres**.

**Importer les centres et services en masse (CSV)**

1. Copiez `docs/import/centres.csv` et `docs/import/services.csv` et remplissez-les
   (séparateur `;`, en-tête obligatoire, encodage UTF-8 ; les colonnes sont
   documentées en tête de `scripts/import-centres.mjs`). Le type d'un centre est
   `cis`, `cs`, `cpi`, `cta_codis`, `direction` ou `service`.
2. Simulation puis import (adresses géocodées automatiquement via la Base Adresse
   Nationale si `lat` / `lng` sont vides ; relancer l'import met à jour les fiches
   existantes, identifiées par leur `slug`) :

```bash
npm run import:centres -- docs/import/centres.csv --services docs/import/services.csv --dry-run
```

```bash
npm run import:centres -- docs/import/centres.csv --services docs/import/services.csv
```

**Désigner le premier référent**

1. L'agent doit avoir un compte (connexion par lien magique ou compte créé dans
   Studio → Utilisateurs) et être rattaché à son centre dans son profil.
2. Studio → Centres → Référentiel → fiche du centre → « Ajouter un référent » :
   recherchez l'agent par nom ou e-mail puis « Désigner ». Son rôle passe
   automatiquement à `referent` (et redevient `reader` au retrait). Un centre peut
   avoir plusieurs référents ; l'historique reste consultable sur la fiche.
3. Le référent voit alors le bouton « Proposer » sur la page de son centre.

**Onglet « Mon centre » (agents)**

- La barre basse est : Fil · Mon centre · Annuaire · Profil. L'agenda est accessible
  depuis la pastille sous les stories et depuis le profil ; les favoris depuis le profil.
- Au premier passage, l'agent choisit son centre (ou son service de direction) ;
  il peut en changer dans Profil → Mon centre, y suivre jusqu'à 3 autres centres,
  accepter d'être présenté (« Bienvenue à », 60 jours) et d'apparaître dans l'annuaire.
- La page d'un centre : couverture, présentation, chef et référents, Appeler /
  Itinéraire (Plans sur iPhone, application par défaut sur Android, OpenStreetMap
  sinon), événements de la semaine (.ics), nouveaux arrivants, actus du centre,
  photos. Un référent y propose actus, photos, vidéo, événements ou une mise à
  jour de fiche ; il suit ses propositions dans Profil → Mes propositions et est
  prévenu (cloche + push) de la validation ou du refus, avec le message éventuel.
- Les actus de centre validées n'apparaissent que sur la page du centre. Push
  « Nouveautés de mon centre » réglable dans Profil → Notifications.

**Annuaire (agents)**

- Onglet Annuaire : recherche instantanée (nom, ville, service, agent ; tolérante
  aux fautes), segments Centres · Services, appel direct (`tel:`), fiche compacte
  en feuille (adresse, Appeler, Itinéraire, chef, référents, agents visibles).
- Les agents n'apparaissent que s'ils ont coché « Visible dans l'annuaire » dans
  Profil → Mon centre (désactivé par défaut) ; ils y renseignent fonction et téléphone
  professionnel. Aucun numéro personnel. Voir `PRIVACY.md`.
- **Carte** (`/annuaire/carte`) : MapLibre GL avec les tuiles vectorielles
  [OpenFreeMap](https://openfreemap.org) (`tiles.openfreemap.org`, gratuites, sans
  clé, sans traçage, aucun service Google). Marqueurs blancs, rattachement en rouge,
  tap → fiche. « Autour de moi » demande la position à l'agent au toucher seulement
  (en-tête `Permissions-Policy: geolocation=(self)`), l'affiche et ne l'enregistre
  jamais. Pour héberger les tuiles au SDIS : changer `MAP_STYLE` dans
  `components/annuaire/DirectoryMap.tsx`. Les centres sans `lat` / `lng` n'apparaissent
  pas : renseignez les adresses (fiche centre) ou lancez l'import CSV, qui géocode.
- **Hors ligne** : la page Annuaire et `/api/annuaire/data` (centres et services avec
  numéros et adresses, sans personnes ni photos) sont conservées par le service worker
  (cache `atlas-directory`, réseau d'abord). Hors connexion, un bandeau indique la
  date des données ; la carte et les agents nécessitent le réseau.
- Studio → Statistiques : section « Centres » (référents actifs, propositions par
  mois, centres silencieux depuis 60 jours, consultations des pages de centre et de
  l'annuaire).

**Vérifier les règles de sécurité**

```bash
npm run test:rls
```

Le script crée quatre comptes `@sdis62.fr` et des centres temporaires, vérifie
une quarantaine de règles (un référent ne peut ni publier directement, ni écrire pour un autre
centre, ni dans le fil ; une proposition en attente n'est visible que de son
auteur et des éditeurs ; la promotion au fil est réservée aux éditeurs, etc.)
puis supprime tout. Il échoue (code 1) dès qu'une règle n'est pas respectée.

## 7. Structure du projet

```
app/
  (auth)/login/            page de connexion (lien magique ou mot de passe)
  auth/callback/           échange du code Supabase → session
  (app)/                   layout agent : en-tête + barre de navigation basse
    page.tsx               fil : filtres, épinglés, défilement infini
    post/[slug]/           page de lecture (Markdown, commentaires)
    galerie/ favoris/ profil/ a-propos/
    feed-actions.ts        Server Actions : réactions, favoris, commentaires, signalements
  (studio)/studio/         espace éditeur (desktop), garde par rôle
    page.tsx               tableau de bord (compteurs, 7 jours, top 5)
    posts/                 liste, éditeur (aperçu agent en temps réel), actions
    stories/               liste (en ligne, programmées, brouillons, archive), à-la-une, éditeur
    moderation/            signalements, commentaires masqués, derniers commentaires
    utilisateurs/          rôles, désactivation, export / suppression RGPD (admin)
    dev-ui/                composants du système de design dans tous leurs états
components/
  brand/                   Logo, tracé ECG (séparateur, loader, état vide)
  layout/                  TopBar, BottomNav
  ui/                      Button, Field, Card, Sheet, Avatar, Badge, EmptyState
  feed/                    PostCard, PhotoCarousel, VideoPlayer, ReactionBar, Comments…
  stories/                 StoryBar (bulles), StoryViewer (plein écran), StoryMedia
  studio/                  PostEditor, MediaUploader (glisser-déposer, progression, alt)
lib/
  config.ts                nom de l'app, limites, réactions
  feed/                    types du fil, requêtes serveur (RPC get_feed…)
  storage/                 pilotes de stockage : s3.ts (SDK AWS v3), supabase.ts
  media/                   variantes sharp, clés du bucket, contrôle MP4, préparation client
  format.ts                dates relatives en français
  auth/                    domaines autorisés, point d'extension SSO
  supabase/                clients navigateur / serveur / admin, middleware, types
  validation/              schémas Zod
supabase/
  migrations/              SQL versionné (0001_init.sql)
  seed.sql                 données de démo
  tests/verif_rls.sql      vérification manuelle de la RLS
scripts/extract-colors.mjs extraction des couleurs du logo
docs/ARCHITECTURE.md       plan d'architecture
```

## 7h. Carte dynamique : groupements, météo du département, mode drone

> **MapLibre 6 et son worker.** MapLibre cherche son script de calcul (`maplibre-gl-worker.mjs`)
> à côté de son propre module ; une fois empaqueté par Next, ce fichier n'est pas servi et la
> carte affichait « indisponible hors ligne ». Le worker est copié dans
> `public/vendor/maplibre-gl-worker.mjs` (versionné) et la carte le déclare avec `setWorkerUrl`.
> Après une montée de version de `maplibre-gl` : `npm run vendor:maplibre`.

- **Accès rapide** : icône carte dans la barre haute de tous les écrans (à côté de la cloche).
- **Groupements territoriaux** toujours tracés : polygones Est / Centre / Ouest obtenus en rattachant
  chaque commune au CIS le plus proche (`npm run geo:groupements` → `public/geo/groupements.json`,
  versionné, 62 Ko). Approximation à remplacer par les secteurs officiels du SDIS dès qu'ils sont
  fournis (même fichier, même format). Le centre de rattachement de l'agent est en rouge.
- **Trois modes** (segments au-dessus de la carte, mémorisés sur l'appareil) et « Autour de moi » à côté :
  - **Carte** : centres et groupements seulement.
  - **Météo** : couche sur tout le département, détail selon le zoom. Un maillage Open-Meteo
    (pas de 0,15°, 77 points, un appel groupé, cache 15 min) colore la carte par température
    (cellules de Voronoï rognées sur les groupements : la surface s'arrête à la côte et aux limites
    du département), affiche une flèche de vent par point (orientée vers où va le vent, taille
    selon la vitesse) et fait pulser en bleu les cellules où il pleut ;
    dézoomé, une synthèse par groupement (moyenne des points du polygone) ;
    aux zooms moyens, une étiquette par point de maillage (température, vent, flèche, pluie) ;
    zoomé, une étiquette par commune (chef-lieu de geo.api.gouv.fr rattaché au point le plus
    proche, communes les plus peuplées d'abord, MapLibre masque les chevauchements). Bandeau de
    vigilance Météo-France (API officielle si `METEOFRANCE_API_KEY`, sinon relais open data) et,
    sous la carte, la synthèse départementale (température, vent, pluie, indice feu, air, cours
    d'eau Hub'Eau, littoral Open-Meteo Marine). Le bouton d'attribution MapLibre est désactivé :
    les crédits (OpenFreeMap, OpenMapTiles, OpenStreetMap, IGN) figurent sous la carte.
  - **Drone** (équipe de télépilotes) : zones de restriction UAS de l'IGN (WMS Géoplateforme, sans clé)
    superposées et, sous chaque centre, une étiquette de verdict « favorable / prudence / déconseillé »
    calculé sur le vent à 10 / 80 / 120 m, les rafales, la visibilité, la pluie et le jour / la nuit
    (seuils dans `lib/carte/drone.ts`) ; liste triée sous la carte. Les interdictions temporaires (NOTAM)
    ne sont pas couvertes.
- **Technique** : `/api/carte/live` agrège les flux (chaque appel amont mis en cache 10 min par Next,
  réponse privée 5 min), tolérant panne par panne ; rafraîchissement toutes les 10 min hors mode Carte.
  Le flux trafic (`TRAFIC_FEED_URL`, abonnement Bison Futé) est collecté mais n'est plus affiché.
  Aucune position d'engin, aucune donnée personnelle.

## 7g. Fiabilité et confiance (lot 8 v3)

- **Hors ligne étendu** : les 20 dernières publications (texte + vignettes) restent
  lisibles ; bandeau « Hors ligne : lecture seule » sous la barre haute ; réactions et
  messages texte saisis sans réseau sont gardés sur l'appareil (`lib/offline/queue.ts`)
  et rejoués dans l'ordre au retour du réseau, de façon idempotente (`set_reaction`,
  `client_id` unique sur les messages). Statut « En attente du réseau » sur la bulle.
- **État des services** : `/api/health` (base, stockage, vidéo, notifications,
  messagerie ; 503 si un service est injoignable ; cache CDN 30 s) et page `/etat`
  (statuts + incidents des 90 derniers jours, lien depuis le profil). Les
  administrateurs déclarent et résolvent les incidents depuis Studio → Journal.
- **Journal d'audit** : Studio → Journal, filtres (acteur, action, type, période),
  pagination, export CSV (`/studio/journal/export`). Les administrateurs voient tout,
  les éditeurs leurs propres actions.
- **Charge** : `tests/load/flash.js` (k6) simule 300 agents ouvrant le fil dans la
  minute qui suit un flash (montée 30 s, plateau 60 s) avec seuils p95 < 1,5 s sur le
  fil, < 2 s sur une publication, < 1 % d'erreurs :

  ```bash
  k6 run -e BASE_URL=https://atlas-sdis62.vercel.app -e COOKIE="sb-…" -e POST_SLUG=… tests/load/flash.js
  ```

  Le cookie est celui d'un compte de test. Optimisations déjà en place : fil rendu côté
  serveur avec `staleTimes` 30 s, images en variantes WebP servies par le CDN du
  stockage, HLS pour la vidéo, RPC `get_feed` paginée. À surveiller lors d'un vrai
  pic : le nombre de connexions Postgres (pooler Supabase) et la durée des fonctions Vercel.
- **CI** : types, lint, tests unitaires et Lighthouse mobile (performance et
  accessibilité ≥ 90 sur la page de connexion) à chaque push (`.github/workflows/quality.yml`).

## 7f. Mon centre, annuaire, profil (v3)

- **Référentiel réel** : les 47 CIS du SDIS 62 (adresses, téléphones, trois groupements
  Est / Centre / Ouest) sont importés depuis `docs/import/centres-sdis62.csv`
  (`npm run import:centres -- docs/import/centres-sdis62.csv`), géocodés par la BAN et
  visibles dans l'annuaire, sur la carte et dans la messagerie (un canal par centre).
- **Fiche modifiable avec historique** : le référent propose plusieurs champs à la fois
  (présentation, couverture, téléphone, e-mail, adresse, effectif) ; chaque champ devient
  une ligne `center_changes` datée, acceptée ou écartée par le service communication
  (Studio → Centres → fiche), l'auteur est prévenu. Historique consultable dans le studio.
- **Annuaire** : copier le numéro, enregistrer le contact (`.vcf` via
  `/api/annuaire/vcard/centre|service/[slug]`), partager le lien interne (partage natif),
  « Consultés récemment » (5 fiches, sur l'appareil).
- **Profil** : photo recadrée au doigt (glisser, zoom), thème système / sombre / clair
  (`user_settings.theme`, palette claire dans `globals.css`), « Mon activité » (réactions,
  commentaires, favoris, propositions, messages, derniers gestes), changement de centre en
  un écran avec récapitulatif et confirmation, historique daté (`profile_history`).

## 7e. Messagerie de travail (Messages)

- **Qui** : le service communication (éditeurs, administrateurs) et les référents ;
  un agent n'y accède que s'il est invité dans un groupe. Aucune conversation 1‑à‑1.
  Pour ces ayants droit, « Messages » remplace « Annuaire » dans la barre basse
  (l'annuaire reste accessible depuis la loupe du fil et le profil).
- **Aucun canal d'office** (décision du 15/09/2026, migration `0028`) : la messagerie
  est vide au départ ; le modèle garde la notion de canal général / de groupement / de
  centre (appartenance calculée par rôle) mais rien n'est créé automatiquement.
  **Groupes** : créés par les éditeurs seulement avec le « + », en deux
  écrans (membres, puis nom ≤ 40, objet ≤ 120 obligatoire, photo carrée, date de fin,
  médias autorisés aux membres). Rappel 48 h avant la fin, puis lecture seule et
  archivage automatiques (`runMaintenance`).
- **Conversation** : bulles 18 px (coins réduits entre messages consécutifs), nom
  coloré, séparateurs de date, pagination vers le haut avec position conservée,
  réponse citée (ou glisser une bulle vers la droite), transfert, épinglés (3), recherche,
  « Vu par… » dans le menu du message.
  Pièces jointes : jusqu'à 10 photos, une vidéo ≤ 60 s ou un fichier PDF / Word ≤ 25 Mo,
  messages vocaux (maintenir le micro, glisser vers le haut pour verrouiller ; forme
  d'onde, vitesse 1× / 1,5× / 2×), six réactions, mentions `@Prénom` et `@tous`.
  Modification et suppression par l'auteur dans les 15 minutes (mention « modifié »),
  suppression par un éditeur à tout moment.
  « Utiliser dans un post » copie une photo dans la bibliothèque du studio.
- **Fiabilité et fluidité (v2, migration `0034`)** :
  - temps réel incrémental : chaque événement Supabase (nouveau message, modification,
    suppression, réaction, lecture) met à jour la liste sans rechargement ; frappe en cours
    (« X écrit… ») diffusée par broadcast, étranglée à 2 s ;
  - rattrapage automatique (`channel_messages_since`) à chaque reconnexion, au retour sur
    l'app et au retour du réseau ; sondage toutes les 30 s seulement quand le temps réel
    est coupé, bandeau « Reconnexion… » le cas échéant ;
  - envoi optimiste : la bulle apparaît immédiatement, réconciliée par `client_id` ;
    hors ligne, le message est mis en file et envoyé au retour du réseau ; en cas d'échec,
    nouvelle tentative automatique après 3 s puis bouton « Réessayer » (même `client_id`,
    jamais de doublon) ;
  - coches à la WhatsApp sur ses propres messages : une coche « Envoyé », double coche
    grise « Lu par certains », double coche bleue « Lu par tous » (membres invités du
    groupe ; les éditeurs qui voient tout sans être invités ne comptent pas) ;
  - séparateur « Nouveaux messages » à l'ouverture, bouton « ↓ N » quand on n'est pas en
    bas et que des messages arrivent, retour en bas animé ;
  - brouillon conservé par conversation sur l'appareil, composeur qui suit le clavier
    (`visualViewport`), retour haptique à l'envoi ;
  - liste des conversations mise à jour en temps réel (nouveau message, lecture).
- **Notifications** : une push par conversation et par minute (`dedupe_key`), une
  mention passe toujours ; selon la préférence globale (Profil → Notifications → Messagerie) et
  par conversation (tout / mentions / aucune, silence 8 h), plage de silence respectée,
  « Masquer l'aperçu » remplace le texte par « Nouveau message ». Mention → notification
  dans l'app. Pastille de non-lus sur l'onglet Messages.
- **Conservation** : 24 mois puis purge (messages et fichiers). Export texte d'une
  conversation réservé aux éditeurs. Pas de chiffrement de bout en bout (bandeau charte
  dans la fiche du groupe).

## 7d. Stories : réactions, sondage, question, à la une

- **Réactions** : les quatre réactions du fil en bas du viewer (une par personne,
  modifiable, retirable). Visibles du service communication seulement (Studio →
  Stories et Statistiques), jamais des autres agents.
- **Sondage** (un par story, 2 à 4 réponses) et **question ouverte** (un par story),
  placés au doigt dans l'aperçu 9:16 du Studio ; les zones hachurées (haut 14 %, bas
  22 %) sont recouvertes par l'interface et un élément qui y tombe est ramené dans la
  zone visible. Le vote affiche la répartition (pourcentages) après avoir voté ; les
  réponses aux questions ne sont lisibles que du service communication (page
  « Réponses » de la story, avec les réponses libres).
- **Texte superposé** : position libre (x, y relatifs) ou préréglages haut / milieu / bas ;
  vérification du contraste sur la zone choisie.
- **À la une** : titre court (16 caractères), ordre du bandeau par glisser ou flèches,
  couverture choisie parmi les stories du regroupement.
- **Vues qualifiées** : progression maximale atteinte (0–100 %) et « passage à la
  suivante » (tap avant la fin) remontés au changement de story, sans horodatage fin.
  Studio → Statistiques → Stories : vues, complétion, passage, réactions, votes et réponses.

## 7c. Fil, carrousel, articles, recherche

- **Commentaires** (refonte d'octobre 2026) : feuille à hauteur fixe avec composeur épinglé
  (suit le clavier), fils à un niveau repliés sous « Voir les N réponses », réponse à une
  réponse préfixée par le prénom, envoi optimiste (« Envoi… »), compteur dans le titre,
  signalement en place, modération (masquer / rétablir) pour le service communication,
  suppression définitive par un administrateur (politique `comments_delete_admin`). Les
  feuilles et visionneuses sont rendues sous `<body>` (`components/ui/Portal.tsx`) : un
  ancêtre transformé ou en `content-visibility` ne peut plus les figer dans la page.
- **Visionneuse** : pincement autour du point pincé, double-tap vers le point touché (×2,5),
  déplacement au doigt borné aux bords de la photo, zoom ×4 au plus ; gestes écoutés en
  natif (non passifs) pour que la galerie ne défile pas pendant un pincement ; zoom remis à 1
  au changement de photo. Test du parcours comptes : `tests/e2e/parcours-comptes.spec.ts`
  (nouvel agent par lien et code, accueil, fil ; administrateur : rôle et création).

- **Carrousel** : points de position, légende par photo (13 px, repliable, saisie
  dans le studio sous chaque photo), double-tap = ❤️ avec animation, aperçu flou
  20 px (LQIP généré avec les variantes) sous chaque image, photo suivante et
  première photo du post suivant préchargées, flèches du clavier sur desktop.
  Lightbox : pincement et double-tap pour zoomer, flèches et Échap au clavier.
- **Position du fil** restaurée au retour d'une publication, d'une lightbox ou d'un
  autre onglet (mémoire par route, session du navigateur).
- **Articles** : temps de lecture sous le titre, barre de progression 2 px sous la
  barre haute, sommaire flottant sur grand écran (titres `##`), « Reprendre où j'en
  étais » (position gardée sur l'appareil), lecture 17 px / 1,55 sur 680 px.
- **Lecture qualifiée** : une carte est « lue » quand elle reste visible à 50 % pendant
  2 s, un article à 80 % de défilement ; réaction, commentaire, favori ou vote marquent
  une interaction. Studio → Statistiques distingue affichage, lecture et interaction.
  Stockage sans horodatage fin (`post_views.read`, `interacted`).
- **Recherche globale** (loupe du fil) : un champ, résultats groupés (publications,
  centres, services, personnes visibles), tolérance aux fautes (`search_all`),
  historique local des 5 dernières recherches.

## 7a. Vidéo : transcodage HLS, poster, sous-titres

- **Chaîne** : compression sur l'appareil (H.264 1080p, déjà en place) → envoi →
  `POST /api/video/transcode` (ffmpeg embarqué via `ffmpeg-static`, `maxDuration 300`)
  qui produit un HLS fMP4 multi-qualité (`hls/<id>/master.m3u8`, rendus 1080p / 720p /
  360p, jamais au-dessus de la source) **par étapes** dans un budget de temps : le rendu
  source est disponible en quelques secondes (`video_status = ready`), les qualités
  inférieures suivent, relancées par le studio ou par le cron quotidien (jobs bloqués
  > 10 min, 3 tentatives). États visibles dans le studio : `uploaded`, `processing`,
  `ready`, `failed` (avec la raison, bouton « Relancer »). Vidéos de post ≤ 5 min,
  stories ≤ 30 s. Le MP4 compressé reste servi en repli.
- **Bascule Bunny Stream** : `VIDEO_PROVIDER=bunny` + `BUNNY_*` (contrat identique,
  `lib/video/bunny.ts`), si l'hébergement Vercel ne permettait plus le transcodage.
- **Poster** : image extraite à 1 s automatiquement ; remplaçable dans le studio par
  une image ou par un instant (timecode).
- **Sous-titres** : import `.vtt` / `.srt` dans le studio, édition ligne par ligne,
  publication explicite ; affichés par défaut quand le son est coupé. Génération
  automatique **optionnelle** : `TRANSCRIPTION_API_URL` (défaut OpenAI), `TRANSCRIPTION_API_KEY`,
  `TRANSCRIPTION_MODEL` (défaut `whisper-1`) — tout fournisseur compatible
  `audio/transcriptions` (Groq propose un quota gratuit : `https://api.groq.com/openai/v1/audio/transcriptions`,
  modèle `whisper-large-v3-turbo`). Sans clé, le bouton « Générer » n'apparaît pas.
- **Lecteur** : `hls.js` (natif sur Safari), lecture au tap, muet par défaut avec bouton
  son, plein écran natif, reprise à la position (locale), vitesse 1× / 1,25× / 1,5×,
  cadre selon l'orientation détectée à l'upload.
- **Mesure** : paliers 25 / 50 / 75 / 100 % par agent et par vidéo, sans horodatage
  fin (`post_views.progress`), visibles dans Studio → Statistiques.

## 7a bis. Studio : calendrier, brouillons partagés, relecture, upload robuste

- **Calendrier** (`/studio/calendrier`) : vues semaine et mois, colonne « Sans date »
  pour les brouillons, glisser-déposer (au doigt aussi) pour changer la date : un
  brouillon déposé devient programmé à 9 h, un événement ou un flash est décalé en
  gardant sa durée, un contenu publié ne bouge pas. Tap → éditeur.
- **Brouillons partagés** : verrou d'édition (« Modifié par Prénom — il y a 2 min »),
  repris automatiquement après 10 min d'inactivité ou par « Prendre la main » ;
  sauvegarde automatique toutes les 5 s du texte (titre, lieu, chapô, corps) quand on
  a la main ; historique des 30 dernières versions, restaurables.
- **Relecture** : « Demander une relecture » à n'importe quel éditeur (ou à
  l'administrateur), commentaires internes invisibles des agents, validation ou
  renvoi. Une publication en relecture ne peut pas être mise en ligne (trigger
  `posts_review_guard`), sauf par un administrateur.
- **Upload robuste** : reprise après coupure (TUS par morceaux de 6 Mo sur Supabase
  Storage, multipart 8 Mo sur S3/R2 : relancer le même fichier reprend où il s'était
  arrêté), file d'attente visible en bas du studio, envoi en arrière-plan pendant la
  rédaction (garde-fou à la fermeture de la page), conversion HEIC, empreinte SHA-256
  avec avertissement de doublon (jamais bloquant).
- **Texte alternatif assisté** (optionnel) : `VISION_API_KEY` (clé API Claude,
  modèle `VISION_MODEL`, défaut `claude-haiku-4-5`) fait apparaître « Proposer une
  description » sous chaque photo ; la proposition est toujours relue et éditable.
- **Contraste des stories** : le texte superposé est mesuré contre la zone de
  l'image où il s'affiche ; sous 4,5:1, avertissement avant publication.

## 7b bis. Notifications : préférences, plage de silence, boîte de réception

- **Préférences** (Profil → Notifications) : nouvelles publications, épinglées,
  nouveautés de mon centre, agenda (rappel la veille), messagerie (tout / mentions /
  rien), résumé e-mail. Les **flashs** sont affichés non désactivables avec l'explication.
- **Plage de silence** : 21 h – 7 h par défaut, modifiable par l'agent (heure de Paris).
  Les pushs non urgentes émises pendant la plage sont mises en attente
  (`notification_deferred`) puis regroupées en une seule à la fin de la plage
  (« 3 nouveautés cette nuit »). Les flashs passent toujours.
- **Une seule push par contenu** : clé de dédoublonnage calculée à l'entrée en file
  (trigger `notification_queue_dedupe`) ; aucun rappel automatique.
- **Boîte de réception** (`/notifications`) : 90 jours, filtre Toutes / Non lues, lien
  vers le contenu ; cloche avec point rouge dans la barre haute de tous les écrans,
  badge de l'application (icône) sur les appareils compatibles.
- **Statistiques** (Studio → Statistiques → Notifications) : taux d'activation des
  pushs par centre, taux d'ouverture par type de contenu (clic sur la notification,
  enregistré par agent et par jour).
- **Distribution horaire** : Vercel Hobby ne déclenche un cron qu'une fois par jour.
  Pour respecter la fin de plage de silence à l'heure près, la base appelle
  `/api/cron/dispatch` toutes les heures via pg_cron + pg_net. À planifier une fois,
  dans l'éditeur SQL Supabase (remplacez le secret par la valeur de `CRON_SECRET`) :

```sql
select public.schedule_hourly_dispatch('https://atlas-sdis62.vercel.app/api/cron/dispatch', 'VOTRE_CRON_SECRET');
```

## 7b. Notifications push, PWA et digest

- **PWA** : `app/manifest.ts`, icônes dans `public/icons/`, service worker `public/sw.js`
  (cache de l'interface et des vignettes des 20 dernières publications, bornées ; page `/offline` qui rejoue le fil enregistré). Sur iPhone, l'agent doit
  d'abord ajouter ATLAS à l'écran d'accueil depuis Safari pour recevoir des push.
- **Push** : clés VAPID générées par `npm run vapid` (→ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Un trigger SQL enfile une notification à chaque
  mise en ligne ; l'envoi part juste après la publication, puis `/api/cron/dispatch`
  (Vercel Cron quotidien à 6 h, `vercel.json`, limite de l'offre Hobby) reprend ce qui
  resterait. Pour une reprise toutes les 5 min, configurez **pg_cron + pg_net** dans Supabase :

```sql
select cron.schedule('atlas-dispatch', '*/5 * * * *', $$
  select net.http_get(url := 'https://<votre-domaine>/api/cron/dispatch', headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb)
$$);
```

- **Digest** : `/api/cron/digest` le lundi (Vercel Cron), activable par un administrateur
  dans Studio → Paramètres, avec envoi de test. Transport : `RESEND_API_KEY` (compte
  gratuit sur resend.com ; sans domaine vérifié, seule l'adresse du compte peut recevoir)
  ou `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`.
- **Préférences** (profil) : notifications sur cet appareil, nouvelles publications,
  publications épinglées, résumé hebdomadaire.

## 7j. Notes de service : le fil interne du centre

- **Deux fils sur la page d'un centre** : « Actus » (propositions des référents validées
  par le service communication, visibles de tous) et « Notes de service », fil interne
  réservé aux membres du centre (et au service communication). Un agent d'un autre centre
  ne voit pas l'onglet. Lien profond : `/centre/<slug>?onglet=notes`.
- **Qui publie** : le chef de centre et le responsable communication du centre (adresses
  saisies par le service communication sur la page du centre, ou référent désigné), directement
  et sans relecture, mais seulement dans leur centre ; le service communication publie dans
  le fil départemental et peut aussi publier une note dans n'importe quel centre. Le rôle
  est rappelé au responsable en haut de la page (« Chef de centre · vous publiez les notes
  de service du centre »).
- **Rôle automatique** (migration `0037`) : le service communication saisit l'adresse du chef
  et du responsable com sur la page de chaque CIS. L'agent dont l'adresse correspond est
  rattaché d'office à ce centre, qu'il existe déjà ou qu'il se connecte pour la première fois
  (aucune demande, aucune validation), et prévenu dans la cloche. Les droits sont recalculés
  à chaque requête à partir des adresses : changer une adresse transfère aussitôt le rôle,
  l'ancien responsable redevient membre ordinaire. Dans tous les cas, la personne reste simple
  lecteur du fil départemental. Le rôle est rappelé dans Profil → Mon centre et à l'accueil.
- **Une note** = un document PDF (≤ 25 Mo) ou une image (réduite sur l'appareil), un titre,
  un texte facultatif, épinglage en tête. Ni réactions ni commentaires. Les fichiers sont
  envoyés directement au stockage sous `notes/<centre>/…`. Menu « ⋯ » (épingler, retirer).
- **Membres prévenus** : notification dans la cloche (« Note de service · CIS X ») et push
  « Nouveautés de mon centre » (préférence existante), une seule push par note. Pastille
  « N nouvelles » sur l'onglet et point rouge sur les notes non encore vues sur l'appareil.
- Fichiers : `supabase/migrations/0036_center_notes.sql`, `lib/centres/notes.ts`,
  `app/(app)/centre/notes-actions.ts`, `components/centre/CenterNotes.tsx` (onglets + liste),
  `components/centre/NoteComposer.tsx`. Test : `tests/e2e/centre-notes.spec.ts`.

## 7k. Espace d'administration (hors Studio)

- **Adresse** : `/admin`, distinct du Studio (qui ne garde que les contenus : flash,
  publications, calendrier, stories, agenda, validation des propositions de centre,
  statistiques, modération, retours). Entrées : Profil → Administration, menu « + » →
  Administration, lien en bas de la navigation du Studio. Anciennes adresses du Studio
  (`/studio/utilisateurs`, `/studio/journal`, `/studio/parametres`,
  `/studio/centres/demandes`, `/studio/centres/referentiel/…`) redirigées.
- **Interface** : panneau latéral sur ordinateur (240 px), barre haute avec sélecteur et barre
  basse sur téléphone ; chaque page est utilisable au doigt (fiches en feuille, listes en
  cartes sous 640 px).
- **Tableau de bord** (administrateurs) : comptes actifs par rôle, nouveaux sur 7 et 30 jours,
  agents vus ces 7 jours, jamais connectés, rattachés, mots de passe définis, appareils avec
  notifications, demandes en attente ; inscriptions et agents connectés par semaine sur douze
  semaines ; centres sans chef ni responsable com (liste cliquable), sans membre, avec notes ;
  contenu sur 30 jours. Fonction `admin_adoption_stats` (migration `0039`).
- **Utilisateurs** (administrateurs) : liste paginée par 100 avec recherche côté serveur,
  filtres (rôle, jamais connectés, désactivés), sélection multiple et actions groupées
  (passer éditeur ou agent, désactiver, réactiver), fiche par compte (identité,
  rattachement direct, mot de passe de dépannage, rôle, désactivation, export et
  suppression RGPD), dernière connexion réelle.
- **Centres et services** : référentiel (groupements, centres, services, référents),
  **Rattachements** (demandes en attente et dernières décisions), **Journal** (actions et
  incidents, export CSV), **Paramètres** : ouverts au service communication, les
  paramètres restant modifiables par les seuls administrateurs.

## 7i. Comptes, rattachement validé, co-rédacteurs, événements de centre (v3, lot comptes)

- **Connexion** : l'écran propose d'abord l'e-mail professionnel (@sdis62.fr). L'agent reçoit
  un e-mail avec un lien **et un code à six chiffres** à saisir dans l'app : le code marche
  même si la passerelle de messagerie a déjà « ouvert » le lien, ou si l'e-mail est lu sur un
  autre appareil. Le mot de passe reste une option (facultatif à l'accueil, modifiable dans le
  profil). Si `RESEND_API_KEY` (ou `SMTP_HOST`) est défini, l'e-mail part par le transport
  d'ATLAS (`lib/auth/invite.ts`, trois envois par adresse et par dix minutes) ; sinon Supabase
  envoie son e-mail standard, limité à quelques envois par heure sans SMTP personnalisé.
- **Rôle** : lecteur (« Agent ») par défaut ; éditeur et administrateur se donnent dans
  Studio → Utilisateurs. Un changement de rôle prend effet au clic suivant (le middleware
  rafraîchit le jeton avant de refuser l'accès au Studio).
- **Rattachement validé** (migration 0030) : à l'accueil ou dans Profil → Mon centre, le choix
  d'un centre crée une **demande** (`membership_requests`). Un e-mail part au **chef de centre**,
  à défaut au **responsable communication**, à défaut à l'adresse de repli
  (`app_settings.membership_fallback_email`, jdubois@sdis62.fr ; toujours elle pour les
  services). Le lien ouvre `/rattachement/<jeton>` (page publique, jeton de 192 bits haché en
  base, valable sept jours) : la décision ne part qu'au clic. Les responsables qui ont un compte
  (chef désigné, adresse saisie ou référent) voient aussi les demandes sur la page du centre ;
  le service communication les voit dans Studio → Rattachements. Un agent accepté est rattaché
  (`profiles.center_id`) ; l'agent ne peut plus modifier son rattachement lui-même
  (garde-fou `profiles_guard`), l'administrateur si, depuis Studio → Utilisateurs.
- **Contacts de validation** : sur la page d'un centre, un bloc réservé aux administrateurs
  (« Validation des arrivées ») renseigne chef de centre et responsable com (nom, e-mail).
  Ces adresses donnent aussi les droits de validation et de création d'événements dans l'app
  (`is_center_chief`, `is_center_com`, `can_manage_center`).
- **Gestion des comptes** (Studio → Utilisateurs, administrateurs) : inviter sans mot de passe
  (e-mail lien + code), poser prénom, nom, rôle et centre, renvoyer un e-mail de connexion,
  envoyer une réinitialisation de mot de passe, désactiver, exporter, supprimer (anonymisation,
  migration 0029 pour les commentaires).
- **Réglages Supabase Auth** (tableau de bord) : changement de mot de passe sécurisé activé,
  longueur minimale 10 (comme l'app), code e-mail à six chiffres valable quinze minutes.
  « Prevent use of leaked passwords » demande le plan Pro.
- **RGPD** (migration 0032) : `export_user_data` couvre messagerie, stories, retours,
  rattachement, notifications, consultations, appareils ; `anonymize_user_data` traite chaque
  table liée avant de retirer le profil. Bucket `media` : envoi direct accepté seulement pour un
  média déclaré par l'agent (`media_tus_insert`), 60 Mo par objet, types bornés.
- **E-mails des agents** (migration 0033) : la colonne `profiles.email` n'est plus accordée au
  rôle `authenticated` ; les éditeurs et administrateurs lisent les adresses via la vue
  `profiles_editor` (vide pour les autres), l'agent lit la sienne dans son jeton. Les jointures
  côté app ne demandent plus l'adresse (demandes de rattachement, référents).
- **Next 16** : `middleware.ts` est devenu `proxy.ts` (même contenu), ESLint en configuration
  plate `eslint-config-next/core-web-vitals` + `typescript` ; les règles du compilateur React
  sont en avertissement (voir `eslint.config.mjs`). React 19.2, MapLibre 6.
- **Notifications** : balayer une notification vers la gauche la supprime (retrait immédiat,
  rétabli si la suppression échoue) ; bouton « Supprimer » accessible au clavier.
- **Co-rédacteurs** (`post_editors`) : tout éditeur modifie déjà toute publication. Depuis
  l'éditeur, un éditeur ajoute un agent extérieur au service ; celui-ci ouvre
  `/studio/partages` et la publication, modifie texte, médias et options, sans publier,
  épingler ni supprimer (politiques `posts_coeditor_*`, garde-fou dans `posts_center_guard`).
  Il est prévenu dans l'app et par e-mail.
- **Réactions** : option « Autoriser les réactions » par publication (`posts.reactions_enabled`),
  appliquée par `toggle_reaction` / `set_reaction` et dans la carte du fil.
- **Événements de centre** : le chef de centre ou le responsable com ajoute un événement depuis
  la page du centre (bouton « Ajouter ») ; il est publié tout de suite et **visible des seuls
  membres du centre** (politique `events_select`), avec notification dans l'app et rappel la
  veille. Les événements de tout le SDIS restent créés dans le Studio par le service
  communication (et la DDSIS) et sont visibles de tous. L'agenda de l'agent mêle les deux.

## 8. Stockage des médias (Supabase Storage ou bucket S3)

Les photos et vidéos partent **directement du navigateur** vers le stockage
(URL signée), puis le serveur génère les variantes WebP (400 / 800 / 1200 / 2400 px)
avec `sharp`. Les vidéos sont stockées telles quelles (MP4 H.264, contrôle du
codec dans le navigateur) avec un poster généré côté client.

### 8.1 Démarrage sans configuration : Supabase Storage

Sans variables `S3_*`, l'application utilise le bucket public **`media`** de
Supabase Storage. Il est créé automatiquement au premier usage, ou à la main :
**Storage → New bucket** : nom `media`, *Public bucket* coché.

> Limite de taille par fichier : **50 Mo** sur l'offre gratuite Supabase
> (5 Go sur l'offre Pro, réglable dans les paramètres du bucket). Les vidéos
> plus lourdes sont refusées avec un message explicite.

### 8.2 Passage à un bucket S3 (Scaleway Object Storage ou Cloudflare R2)

Renseignez dans `.env.local` (et sur Vercel) :

| Variable | Scaleway | Cloudflare R2 |
|---|---|---|
| `S3_ENDPOINT` | `https://s3.fr-par.scw.cloud` | `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `fr-par` | `auto` |
| `S3_BUCKET` | nom du bucket | nom du bucket |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | clés API du projet | jeton R2 (lecture/écriture objets) |
| `S3_PUBLIC_URL` et `NEXT_PUBLIC_S3_PUBLIC_URL` | `https://<bucket>.s3.fr-par.scw.cloud` ou domaine Edge | domaine public R2 (`r2.dev` ou personnalisé) |

Puis :

1. **Visibilité** : bucket en lecture publique (Scaleway : *Visibilité → Public* ;
   R2 : *Settings → Public access*).
2. **CORS** du bucket, pour autoriser le `PUT` depuis l'application :

```json
[
  {
    "AllowedOrigins": ["https://<votre-domaine>", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Redémarrez l'application : `lib/storage` détecte les variables et bascule sur
   le pilote S3 (`STORAGE_DRIVER=s3|supabase` force le choix). Les médias déjà
   envoyés sur Supabase Storage restent lisibles tant que l'ancienne URL
   publique est conservée dans `NEXT_PUBLIC_S3_PUBLIC_URL`… ou se migrent avec
   `rclone` (`rclone copy supabase:media scaleway:<bucket>`).

## 12. Environnement de test, surveillance, sauvegardes

### 12.1 Environnement de test (atlas-test)

Un second projet Supabase, **atlas-test** (réf. `zrwaybfwteagfpaxkqzr`), isolé de la
production : les tests automatiques et les essais s'y font sans risque de publication ou
de notification visible par les agents.

- **Clés** : `.env.test.local` (jamais commité) avec `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` du projet de test
  (Project Settings → API Keys → onglet *Legacy anon, service_role*), une paire VAPID propre
  et un `CRON_SECRET` propre.
- **Schéma** : `npx supabase login`, `npx supabase link --project-ref zrwaybfwteagfpaxkqzr`,
  puis `npx supabase db push`. Référentiel sans donnée personnelle :
  `npm run referentiel:export` (lecture de la production) puis exécution de
  `supabase/tests/fixtures-referentiel.sql` dans l'éditeur SQL du projet de test, et
  `supabase/seed.sql` pour l'administrateur initial.
- **Serveur local sur le projet de test** : `npm run dev:test` → http://localhost:3100
  (refuse de démarrer si les clés manquent ou pointent sur la production).
- **Tests de bout en bout sur le projet de test** : `npm run test:e2e:test` (serveur de test
  lancé). `npm run test:e2e` seul vise `.env.local`, donc la production : à n'utiliser
  que sur un projet de test.
- **Déploiement de test** : projet Vercel séparé (`atlas-sdis62-8tws`, même dépôt, même
  branche `main`, variables du projet de test) servi sur **https://atlas-test-sdis62.vercel.app**
  (et sur son adresse d'origine `atlas-sdis62-8tws.vercel.app`), installable sur téléphone
  comme l'application principale. Côté Supabase atlas-test : Site URL
  `https://atlas-test-sdis62.vercel.app`, redirections `…/**` des deux adresses et de
  `localhost:3000` / `localhost:3100`.
- **Référentiel et compte initial** : `npm run referentiel:sync-test` copie groupements,
  services et centres (sans donnée personnelle) de la production vers le projet de test,
  pose la liste blanche d'adresses et crée le compte administrateur initial ; chaque push sur
  `main` déploie aussi le site de test.
- **Tests sur le site de test déployé** :
  `npx cross-env E2E_ENV_FILE=.env.test.local E2E_BASE_URL=https://atlas-test-sdis62.vercel.app playwright test`.

### 12.2 Surveillance

`.github/workflows/monitor.yml` appelle `/api/health` toutes les dix minutes (trois
essais) et vérifie la page de connexion. Un échec fait échouer l'exécution et GitHub envoie
l'e-mail « Run failed » à l'adresse du compte GitHub : aucun service tiers. Vérifier dans
GitHub → Settings → Notifications que les échecs d'Actions sont envoyés par e-mail.

### 12.3 Sauvegardes

`.github/workflows/backup.yml` exporte chaque dimanche rôles, schéma et données de la base
(Supabase CLI) et copie le bucket `media`, conserve l'archive 90 jours comme artefact du
dépôt et, si le secret `RCLONE_CONFIG` est renseigné, la dépose dans Google Drive
(« ATLAS Sdis62 / sauvegardes », douze semaines conservées). Secrets du dépôt à créer :
`SUPABASE_ACCESS_TOKEN` (supabase.com/dashboard/account/tokens), `SUPABASE_DB_PASSWORD`
(mot de passe de la base de production), `RCLONE_CONFIG` (facultatif : `rclone config`
une fois sur un poste, remote nommé `gdrive`, contenu de `rclone.conf`).

### 12.4 Sécurité

- **Content-Security-Policy** posée par le proxy sur chaque page, avec un nonce par requête
  pour les scripts en ligne (`lib/security/csp.ts`) : scripts du domaine seulement, images et
  connexions limitées à Supabase, au stockage et aux fonds de carte, aucune inclusion dans
  une autre page. Après l'ajout d'un service externe appelé depuis le navigateur, l'ajouter
  à `buildCsp` et vérifier la console.
- Secret des tâches planifiées comparé à temps constant (`lib/auth/cron.ts`).

## 9. Déploiement Vercel

*Documentation complète au lot (h).* En résumé : importer le dépôt, copier les
variables de `.env.local` dans **Settings → Environment Variables**, définir
`NEXT_PUBLIC_SITE_URL` sur l'URL de production, ajouter
`https://<domaine>/auth/callback` aux Redirect URLs Supabase.

## 10. Sauvegarde

*Procédure complète au lot (h).* Supabase conserve des sauvegardes quotidiennes
(offre Pro). Export manuel : `npx supabase db dump --linked -f backup.sql`.

## 11. Scripts npm

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | vérification TypeScript |
| `npm run db:push` | applique les migrations au projet Supabase lié |
| `npm run db:types` | régénère les types TypeScript depuis la base |
| `npm run db:reset` | (local uniquement) recrée la base locale + seed |
| `npm run screenshots` | captures de référence Playwright (dev server lancé) |
| `npm run import:centres -- <centres.csv> [--services services.csv] [--dry-run]` | import CSV des groupements, centres et services (géocodage BAN) |
| `npm run test:rls` | test des règles RLS du réseau de référents (comptes temporaires, nettoyés) |
| `npm run test:unit` | tests unitaires Vitest (`tests/unit` : génération `.ics`, recherche de l'annuaire contre la base liée) |
| `npm run test:e2e` | tests de bout en bout Playwright (`tests/e2e` : parcours référent → validation → page du centre ; annuaire ; publication d'une vidéo avec sous-titres). Serveur lancé et `.env.local` requis ; `E2E_ADMIN_EMAIL` pour le compte éditeur (sinon première adresse de `ALLOWED_EMAILS`) |
| `npm run vapid` | génère une paire de clés VAPID pour les push |

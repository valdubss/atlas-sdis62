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

- **Connexion** (défaut) : e-mail et mot de passe.
- **Première connexion ou mot de passe oublié** : l'agent saisit son adresse, reçoit
  un lien magique (Supabase Auth) et arrive sur `/bienvenue` où il renseigne prénom,
  nom et mot de passe (10 caractères minimum). Le mot de passe se change ensuite
  depuis la page Profil. Aucun réglage Supabase supplémentaire n'est nécessaire (le
  provider Email couvre les deux modes). Pour renforcer
la sécurité : **Authentication → Providers → Email → Password requirements** et
activer la détection des mots de passe compromis (offre Pro).

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
  ce qui permet au middleware de protéger `/studio` sans requête ; la page studio
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

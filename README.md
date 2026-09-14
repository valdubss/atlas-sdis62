# ATLAS — plateforme d'actualités interne du SDIS 62

Application web (PWA) de diffusion descendante : le service communication publie
(posts, stories, articles, galeries, vidéos, sondages), les agents consultent et
interagissent (réactions, commentaires, favoris).

- **Stack** : Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase
  (Postgres, Auth, RLS, Realtime) · stockage S3 compatible (Scaleway / R2) · Vercel.
- **Architecture** : voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Avancement** : lots (a), (b) et (c) livrés — auth, rôles, schéma SQL, RLS, fil d'actualités, publications photos / vidéo / annonce / article, upload direct vers le stockage avec variantes WebP, réactions, commentaires temps réel, favoris, recherche, studio (éditeur avec aperçu, liste, statistiques). Catégories, centres et tags sont désactivés par défaut (`FEATURES` dans `lib/config.ts`). Lot (e) : modération (signalements, commentaires masqués, fermeture des commentaires) et gestion des utilisateurs (rôles, désactivation, export et suppression RGPD, administrateur uniquement).

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

1. Sur <https://supabase.com/dashboard>, **New project** : nom `flash62`, région
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

### 3.5 Connexion par mot de passe (optionnelle)

Le lien magique est le mode par défaut. Un utilisateur peut aussi **définir un mot
de passe** depuis sa page Profil (10 caractères minimum) ; l'onglet « Mot de passe »
de la page de connexion devient alors utilisable. Aucun réglage Supabase
supplémentaire n'est nécessaire (le provider Email couvre les deux). Pour renforcer
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
| `editor` | tout ce qui précède + créer, programmer, publier, épingler, modérer, consulter les statistiques et les vues de stories |
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
- Règles métier en triggers : 3 posts épinglés max, 20 images par post, un seul
  niveau de réponse aux commentaires, story vidéo ≤ 30 s, rate limiting
  (10 commentaires / 5 min, 60 réactions / min, 5 signalements / h).
- `audit_log` est alimenté automatiquement (publications, stories, modération,
  changements de rôle, référentiels) et n'est ni modifiable ni supprimable via l'API.
- Fonctions RGPD : `export_user_data(uuid)` et `anonymize_user_data(uuid)` (admin).

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
    moderation/            signalements, commentaires masqués, derniers commentaires
    utilisateurs/          rôles, désactivation, export / suppression RGPD (admin)
    dev-ui/                composants du système de design dans tous leurs états
components/
  brand/                   Logo, tracé ECG (séparateur, loader, état vide)
  layout/                  TopBar, BottomNav
  ui/                      Button, Field, Card, Sheet, Avatar, Badge, EmptyState
  feed/                    PostCard, PhotoCarousel, VideoPlayer, ReactionBar, Comments…
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

## 8. Stockage des médias (Supabase Storage ou bucket S3)

Les photos et vidéos partent **directement du navigateur** vers le stockage
(URL signée), puis le serveur génère les variantes WebP (400 / 1200 / 2400 px)
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

# Flash 62 — plateforme d'actualités interne du SDIS 62

Application web (PWA) de diffusion descendante : le service communication publie
(posts, stories, articles, galeries, vidéos, sondages), les agents consultent et
interagissent (réactions, commentaires, favoris).

- **Stack** : Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase
  (Postgres, Auth, RLS, Realtime) · stockage S3 compatible (Scaleway / R2) · Vercel.
- **Architecture** : voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Avancement** : lot (a) livré — auth par lien magique, rôles, schéma SQL complet, RLS.

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
| Logo `public/logo-sdis62.png` | — | identité visuelle (PNG, fond transparent ou blanc) |

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

> **Logo** : déposez `logo-sdis62.png` dans `public/`. Tant qu'il est absent, un
> mot-symbole « FLASH 62 » s'affiche à la place. Pour caler les couleurs sur le
> logo : `node scripts/extract-colors.mjs` (nécessite `sharp`, installé au lot c).

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

1. **SQL Editor → New query**, collez le contenu de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), **Run**.
2. Facultatif : collez [`supabase/seed.sql`](supabase/seed.sql) (centres de démo), **Run**.

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
<h2>Connexion à Flash 62</h2>
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
| `.env.local` → `ALLOWED_EMAIL_DOMAINS=sdis62.fr` | liste séparée par des virgules | message immédiat sur la page de connexion |
| base → `app_settings.allowed_email_domains` | `["sdis62.fr"]` | le trigger `handle_new_user` refuse la création de tout compte hors domaine, même via l'API |

Pour ajouter un domaine en base :

```sql
update public.app_settings
set value = '["sdis62.fr", "autre-domaine.fr"]'
where key = 'allowed_email_domains';
```

## 4. Créer le premier administrateur

1. Connectez-vous une première fois avec votre adresse (lien magique) : le profil
   est créé automatiquement avec le rôle `reader`.
2. Dans **SQL Editor** :

```sql
update public.profiles
set role = 'admin'
where email = 'prenom.nom@sdis62.fr';
```

3. Déconnectez-vous puis reconnectez-vous : le bouton **Studio** apparaît dans
   l'en-tête et sur la page Profil. Les administrateurs pourront ensuite changer
   les rôles depuis le studio (lot e).

## 5. Vérifier que tout fonctionne

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm run build         # build de production
npm run dev           # puis http://localhost:3000
```

Parcours à tester :

1. `/login` avec une adresse **hors** domaine → message « Seules les adresses @sdis62.fr… ».
2. `/login` avec une adresse autorisée → écran « Lien envoyé », e-mail reçu, clic →
   arrivée sur le fil avec « Bonjour ».
3. `/profil` : renseigner prénom, nom, centre → « Profil enregistré ».
4. `/studio` en tant que `reader` → redirection vers `/` avec le message d'accès refusé ;
   en tant qu'`admin` → tableau de bord du studio.
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
  (auth)/login/            page de connexion + Server Action (lien magique)
  auth/callback/           échange du code Supabase → session
  (app)/                   layout agent : en-tête + barre de navigation basse
    page.tsx               fil (lot b)
    galerie/ favoris/ profil/ a-propos/
  (studio)/studio/         espace éditeur (desktop), garde par rôle
components/
  brand/                   Logo, tracé ECG (séparateur, loader, état vide)
  layout/                  TopBar, BottomNav
  ui/                      Button, Field, Card, EmptyState
lib/
  config.ts                nom de l'app, limites, réactions
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

## 8. Bucket S3 (Scaleway / R2)

*Livré au lot (c).* Variables prévues dans `.env.example` (`S3_ENDPOINT`,
`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL`).

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

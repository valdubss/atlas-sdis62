# ATLAS — Plan d'architecture v1 finale et v2

> Proposition à valider avant tout code. 14/09/2026.
> Le système de design (DESIGN.md) reste la référence : aucun token, police ou rayon nouveau.
> Le nom reste **ATLAS** (le brief cite « Flash 62 »).

---

## 0. État réel et préalables

Le brief suppose les lots (a) à (f) livrés. État exact :

| Lot v1 | État |
|---|---|
| (a) auth, rôles, RLS | livré |
| (b) fil, réactions, commentaires, favoris, recherche | livré |
| (c) upload, variantes, photos, vidéo | livré |
| (d) stories | livré (migration `0004` à appliquer côté Supabase) |
| (e) studio, modération, utilisateurs | livré |
| (f) sondages, galerie | **restant** |
| (g) PWA, Web Push, digest | **restant** — prérequis des lots 1, 2, 4 |
| (h) tests, README de déploiement | **restant** — fusionné dans le lot 9 |

Ordre proposé : **(f) → (g) → lots 1 à 9**. Le lot (g) est incontournable avant le flash urgent et les rappels d'agenda.

Contraintes d'hébergement à trancher (question Q4) :

- **pg_cron** (Supabase, toutes offres) exécute tout ce qui est en base : publication programmée, expiration, purge, rappels.
- L'envoi des push et e-mails demande un appel HTTP vers l'app : **pg_net** (Supabase) appelle `/api/cron/dispatch` avec `CRON_SECRET`, ce qui évite les limites de Vercel Cron (offre Hobby : une exécution par jour).
- Vercel Cron reste pour le digest hebdomadaire et la rétrospective annuelle.

---

## 1. Lot 1 — SSO et adoption

### Données

| Objet | Détail |
|---|---|
| `profiles.onboarded_at timestamptz` | null tant que l'accueil de première connexion n'est pas terminé |
| `app_settings` | `auth_magic_link_enabled` (bool, défaut true), `sso_provider` (`"azure"` ou null), `feedback_email` (texte) |
| `feedback` | `id`, `user_id`, `category` enum `bug/content/suggestion`, `description` (≤ 2000), `screenshot_key`, `context jsonb` (`path`, `user_agent`, `app_version`, `viewport`), `status` enum `new/seen/done`, `handled_by`, `handled_at`, `created_at` |
| RLS `feedback` | insert propre (rate limit 10/jour), select/update éditeurs |
| Trigger `handle_new_user` | lit `raw_user_meta_data` d'Entra (`given_name`, `family_name`, `name`, `email`) pour préremplir prénom/nom |

### SSO Microsoft Entra ID

- Supabase Auth, provider **azure**. Le client ID et le secret se saisissent dans le dashboard Supabase (Authentication → Providers → Azure) ; l'app n'a que `AUTH_OIDC_PROVIDER=azure` et `AZURE_TENANT_ID` en `.env` pour afficher le bouton et restreindre au tenant.
- Enregistrement d'application côté Entra (DSI) : URI de redirection `https://<ref>.supabase.co/auth/v1/callback`, scopes `openid email profile`.
- Page de connexion : bouton « Continuer avec Microsoft » en premier ; e-mail + mot de passe et lien magique en dessous, masqués si `auth_magic_link_enabled = false` (SSO forcé). Le contrôle de domaine s'applique aussi au SSO.

### Signalement intégré

- Profil → « Signaler un problème » : sheet avec catégorie, description, capture optionnelle (upload présigné, image), contexte technique collecté automatiquement.
- Studio → `/studio/retours` : liste par statut, capture en visionneuse, passage à `vu`/`traité`.
- E-mail Resend/SMTP vers `feedback_email` à chaque nouveau signalement (`notification_queue` kind `email_feedback`).

### Accueil de première connexion

- `/bienvenue` étendu : trois écrans plein cadre (fil, stories, notifications) en carrousel à accrochage, puis choix du centre, activation des push (lot g), mot de passe si arrivée par lien. Marque `onboarded_at` ; le middleware redirige vers `/bienvenue` tant qu'il est null.

### Routes et écrans

`/login` (SSO), `/bienvenue`, `/profil/signaler`, `/studio/retours`, `/api/feedback/screenshot` (presign), `/studio/parametres` (réglages auth).

---

## 2. Lot 2 — Flash urgent

### Données

| Objet | Détail |
|---|---|
| `post_type` | valeur `flash` ajoutée |
| `profiles.can_flash bool` | défaut false, modifiable par admin (case dans Utilisateurs) |
| `posts.flash_until timestamptz`, `posts.flash_closed_at timestamptz` | durée d'activité 1 h – 7 j (défaut 24 h), clôture manuelle |
| `flash_reads` | `post_id`, `user_id`, `read_at` (une ligne par agent, replie le bandeau) |
| Trigger `posts_before_write` | refuse `type = 'flash'` si `can_flash` est faux ; flash : `comments_enabled = false` par défaut, 1 image max, texte obligatoire |
| `notification_queue` kind `push_flash` | ignore les préférences de catégorie, respecte seulement l'activation des push |
| `audit_log` | action `flash_publish` avec le nombre d'agents notifiés |

### Fonctions

- `get_active_flashes()` : flashs publiés, non clôturés, `flash_until > now()`, avec `read` pour l'agent courant.
- `get_feed` place les flashs actifs en tête, avant les épinglés ; tant qu'un flash est actif, rien ne passe au-dessus.
- `count_push_recipients(audience)` pour la confirmation « Vous allez notifier N agents ».

### Écrans

- Fil : `FlashBanner`, fond `--red` plein, texte blanc, seule exception au budget rouge ; replié en une ligne après lecture (`flash_reads`), déplié au tap.
- Profil → onglet « Flashs » : historique des flashs, actifs et clos.
- Studio : `/studio/flash` (éditeur dédié, wording orienté décès en service, alerte météo, consigne opérationnelle), confirmation en deux étapes, bouton « Clôturer ».

---

## 3. Lot 3 — Ciblage par centre et groupement

### Données

| Objet | Détail |
|---|---|
| `groupements` | `id`, `name`, `slug`, `sort_order`, `is_active` |
| `centers.groupement_id` | FK ajoutée à la table existante (`centers` = centres et services) |
| Colonne `audience jsonb` | sur `posts`, `stories`, `events`, `documents`. Forme : `{"all": true}` ou `{"groupements": [uuid], "centers": [uuid]}` |
| `saved_audiences` | `id`, `name`, `audience jsonb`, `rule jsonb` (ex. `{"min_agents": 30}`), `created_by` |
| Fonction `audience_matches(audience jsonb)` | vrai si `all`, ou si le centre de l'agent ou son groupement est ciblé ; SECURITY DEFINER, lit `profiles.center_id` |
| RLS | toutes les politiques de lecture des lecteurs ajoutent `and public.audience_matches(audience)` ; les éditeurs voient tout |

Les audiences à règle (« CIS de plus de 30 agents ») sont **résolues en liste statique au moment de l'enregistrement** du post, pour garder la RLS simple et prévisible.

### Écrans

- Fil : mention en `--text-3` « Pour le centre d'Arras » / « Pour le groupement Nord » sur les posts ciblés ; éditeurs : audience affichée sur chaque carte.
- Studio : sélecteur d'audience commun (`AudiencePicker`), audiences enregistrées, `/studio/parametres/groupements` et `/centres` (CRUD).

---

## 4. Lot 4 — Agenda

### Données

| Objet | Détail |
|---|---|
| `events` | `id`, `title`, `description` (Markdown), `location`, `location_url`, `starts_at`, `ends_at`, `all_day`, `category` enum `ceremonie/formation/jsp/sport/reunion/autre`, `audience jsonb`, `cover_media_id`, `post_id`, `status` (draft/published), `created_by`, timestamps |
| `calendar_tokens` | `user_id`, `token` (aléatoire, unique), `created_at`, `revoked_at` |
| `user_settings.push_events bool` | rappel la veille |
| `notification_queue` kind `push_event` | enfilé par pg_cron à 18 h pour les événements du lendemain, filtré par audience |

### Routes

- `/agenda` : liste par mois (à venir d'abord), vue mois sur desktop, événement en sheet.
- `/api/events/[id].ics` : fichier iCalendar d'un événement.
- `/api/calendar.ics?token=…` : abonnement complet (iOS, Android, Outlook), généré selon l'audience du porteur du token ; révocation depuis le profil.
- Fil : bloc « Cette semaine » sous les stories si un événement a lieu dans les 7 jours.
- Studio : `/studio/agenda` (liste + éditeur).

Lib : `lib/ics.ts` (génération RFC 5545, testée en Vitest).

---

## 5. Lot 5 — Documents

### Données

| Objet | Détail |
|---|---|
| `documents` | `id`, `title`, `description`, `category` enum `note_service/procedure/formulaire/rh/autre`, `audience jsonb`, `published_at`, `current_version_id`, `must_read bool`, `search tsvector`, `status`, timestamps |
| `document_versions` | `id`, `document_id`, `version int`, `file_key`, `size_bytes`, `page_count`, `created_by`, `created_at` |
| `document_reads` | `document_id`, `user_id`, `version_id`, `read_at` |
| `posts.document_id` | post de type `document` (carte icône, titre, taille, Ouvrir) |
| `media.kind` | valeur `file` ajoutée pour l'upload présigné des PDF (même flux) |

### Routes

- `/documents` : liste par date, recherche plein texte, filtre catégorie, visionneuse `pdf.js` (`pdfjs-dist`) en sheet plein écran, téléchargement.
- `/documents/[id]` : lecture directe (lien partagé).
- Profil : rappel discret « 2 documents à lire ».
- Studio : `/studio/documents` (éditeur, nouvelle version, taux de lecture par centre via `document_read_rate(document_id)`).

---

## 6. Lot 6 — Contributions encadrées

### Données

| Objet | Détail |
|---|---|
| `contributions` | `id`, `user_id`, `type` enum `photo/info/idee`, `title`, `body`, `center_id`, `status` enum `pending/accepted/declined`, `editor_note`, `handled_by`, `handled_at`, `post_id`, `created_at` |
| `contribution_media` | `contribution_id`, `media_id`, `position` (≤ 10) |
| `posts.credit text` | « Photo : Prénom Nom, CIS X », rempli à la création depuis une contribution |
| RLS | lecteurs : insert propre + select propre ; `media` : insert autorisé aux lecteurs pour leurs propres images (limite 10 / contribution) ; éditeurs : tout |
| Trigger | 5 contributions par agent et par semaine |
| `notification_queue` kinds `push_contribution_accepted/declined` | vers l'auteur, avec le mot de l'éditeur |

### Écrans

- Profil → « Proposer un contenu » (formulaire, centre prérempli) et « Mes propositions » (statuts).
- Studio → `/studio/contributions` : file d'attente, aperçu, accepter / refuser en un geste, filtre par centre, « Créer un post à partir de cette contribution » (préremplit l'éditeur : médias, texte, crédit).

---

## 7. Lot 7 — Statistiques

### Données (sobriété)

| Objet | Détail |
|---|---|
| `post_views` | inchangé : une ligne par agent et par post, `first_viewed_at` tronqué **au jour** |
| `activity_hourly` | `hour timestamptz`, `opens int`, `views int`, `reactions int` : compteurs agrégés **sans identifiant** pour la courbe par heure et les meilleurs créneaux |
| `post_shares` | `post_id`, `user_id` (compteur de partages) |
| `notification_deliveries` | `id`, `user_id`, `kind`, `post_id`, `sent_at`, `opened_at` (taux d'ouverture des push) |
| `story_views.completed bool` | taux de complétion |
| pg_cron mensuel | purge `post_views`, `story_views`, `document_reads`, `flash_reads`, `notification_deliveries` après 13 mois |

### Fonctions

`stats_overview(from, to)`, `stats_posts(from, to)`, `stats_by_center(from, to)`, `stats_activity(from, to)`, `stats_best_slots()`, `stats_documents(from, to)` (éditeurs).

### Écrans

- `/studio/stats` : période 7 / 30 / 90 j ou personnalisée ; graphiques `recharts` sur `--bg-1`, une série `--text-1`, série mise en avant `--red`, sans grille ni légende superflue.
- Export : `/api/stats/export.csv` et `/api/stats/synthese.pdf` (`@react-pdf/renderer`, version imprimable claire : mêmes tokens en négatif).

---

## 8. Lot 8 — Rétrospective annuelle

| Objet | Détail |
|---|---|
| `stories.kind` enum `media/recap` | slide « recap » : `overlay jsonb` porte `title`, `figure`, `month`, `post_id` |
| `build_year_review(year)` | RPC éditeur : crée la série « L'année 2026 au SDIS 62 » en brouillon avec les 12 posts les plus engagés (au moins un par mois si possible) et un slide de chiffres (posts, photos, réactions, agents actifs) |
| Vercel Cron 15 décembre 08:00 | appelle `/api/cron/retrospective` ; bouton « Générer » dans le studio |
| Studio | réordonner, retirer, remplacer chaque slide, choisir la photo de couverture, publier → devient un à-la-une permanent |
| Composant `RecapSlide` | photo plein cadre, chiffre ou titre 34 px, mois, **une** animation d'entrée de 260 ms |

---

## 9. Lot 9 — Fiabilité et passation

| Sujet | Mise en œuvre |
|---|---|
| Sauvegardes | GitHub Actions quotidien : `supabase db dump` chiffré vers un second bucket + `rclone sync` du bucket médias vers un bucket d'un autre fournisseur ou d'une autre région ; `scripts/restore.sh` testé et documenté |
| Monitoring | `/api/health` (base, bucket, auth) ; contrôle horaire par pg_cron/pg_net ou UptimeRobot-like interne ; alerte e-mail sur échec ; `client_errors` (message, stack tronquée, page, ua, version) alimentée par `app/global-error.tsx` et `window.onerror`, sans service tiers |
| Sécurité | CSP stricte (self, Supabase, bucket), HSTS, X-Frame-Options ; `scripts/rls-test.mjs` : pour chaque rôle, chaque action interdite, échoue si l'une passe |
| Performance | `next/image` avec loader S3 (variantes), budget Lighthouse mobile ≥ 90, mesure en CI |
| Tests | Playwright : SSO (mock), flash, agenda, contribution, connexion, fil, publication ; Vitest : statistiques, `.ics`, validations |
| Documentation | `README-PASSATION.md` (DSI) : architecture, comptes, coûts mensuels, mise à jour, sauvegarde, restauration, rotation des secrets, « si Valentin n'est plus disponible » ; `PRIVACY.md` tenu à jour à chaque lot |

---

## 10. Jobs planifiés (vue d'ensemble)

| Job | Fréquence | Moteur |
|---|---|---|
| `publish_scheduled()` (posts, stories, événements) | chaque minute | pg_cron |
| Dispatch push / e-mail (`/api/cron/dispatch`) | toutes les 5 min quand la file n'est pas vide | pg_cron + pg_net |
| Rappels d'agenda | 18 h | pg_cron → file |
| Digest hebdomadaire | lundi 7 h | Vercel Cron |
| Rétrospective | 15 déc. 8 h | Vercel Cron |
| Purge 13 mois | 1er du mois | pg_cron |
| Sauvegardes | quotidien 3 h | GitHub Actions |
| Santé | horaire | pg_cron + pg_net → `/api/health` |

---

## 11. Migrations prévues

`0005_polls_gallery`, `0006_push_digest`, `0007_sso_feedback_onboarding`, `0008_flash`, `0009_audiences`, `0010_events`, `0011_documents`, `0012_contributions`, `0013_stats`, `0014_retrospective`, `0015_reliability`.

---

## 12. Questions avant de coder

1. **Ordre** : (f) sondages + galerie, puis (g) push + PWA, puis lots 1 à 9 ? Le push conditionne le flash et les rappels.
2. **Entra ID** : qui crée l'enregistrement d'application côté DSI ? Il faut le tenant ID, et l'URI de redirection Supabase à leur fournir.
3. **Adresse des signalements** : quelle boîte e-mail recevra les retours (et l'expéditeur : Resend avec un domaine sdis62.fr, ou le SMTP du SDIS) ?
4. **Hébergement** : offre Vercel Hobby ou Pro, et Supabase Free ou Pro ? Cela fixe la fréquence du dispatch des push et la taille des fichiers (50 Mo vs 5 Go).
5. **Statistiques par heure** : le brief demande à la fois « pas d'horodatage fin » et une « courbe par heure ». Proposition : vues par agent tronquées au jour, courbe horaire sur des compteurs agrégés sans identifiant.
6. **Sauvegardes** : second bucket chez quel fournisseur (Scaleway, autre région Supabase, R2) ? Et le code doit être poussé sur un dépôt Git distant (GitHub) pour les sauvegardes automatiques et la CI : il n'y en a pas encore.

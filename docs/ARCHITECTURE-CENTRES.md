# ATLAS — Plan d'architecture « Vie des centres, Mon centre, Annuaire »

> Proposition soumise à validation avant tout code (septembre 2026). Trois lots
> livrés dans l'ordre, avec arrêt après chacun. Principe intangible : **le fil
> départemental est une chose, le centre en est une autre.** Rien du centre ne
> remonte dans le fil sans « Promotion au fil » décidée par la com.

## 0. Écarts proposés par rapport au brief (à valider)

| Sujet | Brief | Proposition | Pourquoi |
|---|---|---|---|
| Langue du schéma | tables `groupements`, `centres`, `centre_posts`… | tables en anglais (`groupings`, `centers`, `center_referents`…), libellés en français dans l'app | le schéma existant est en anglais (`centers`, `profiles.center_id`, `posts`, `events`) ; mélanger les deux langues créerait des doublons (`centers` ET `centres`) |
| Publications de centre | table `centre_posts` distincte | **même table `posts`**, colonne `scope` (`departmental` / `center`) + `center_id` obligatoire pour un post de centre, statuts `pending` et `declined` ajoutés | réactions, commentaires, favoris, vues, médias, modération, `PostCard` et notifications sont tous accrochés à `posts.id` : une table séparée obligerait à tout dupliquer. L'étanchéité est garantie par le SQL : `get_feed` ne renvoie que `scope = 'departmental'`, et la RLS interdit à un référent toute écriture avec `scope = 'departmental'`. Une vue `center_posts` est fournie pour la lisibilité |
| Événements de centre | table `centre_events` | table `events` existante + `center_id` nullable (`null` = départemental) + circuit de validation | c'est l'option prévue par le brief quand l'Agenda existe déjà (lot livré) |
| Photo de couverture | clé S3 dans `photo_couverture` | `cover_media_id` → table `media` | même pipeline (variantes WebP, purge, `original` effacé) que le reste |
| Navigation | Fil · Mon centre · Annuaire · Profil | idem ; **Agenda** redevient accessible depuis le fil (pastille « Agenda » sous les stories) et depuis le profil ; **Favoris** dans le profil | quatre entrées imposées |
| Carte | MapLibre + OSM auto-hébergé ou fournisseur sans clé | MapLibre GL + tuiles vectorielles **OpenFreeMap** (`tiles.openfreemap.org`, gratuit, sans clé, sans tracking) | aucun serveur de tuiles à héberger ; bascule vers un hébergement SDIS possible en changeant une URL |
| Géocodage | script one-shot | script `scripts/import-centres.mjs` avec l'API Adresse nationale (`api-adresse.data.gouv.fr`, gratuite, sans clé) | référentiel officiel, exact pour les adresses de casernes |
| Script de test RLS | « étendre le script existant » | il n'existe pas encore : création de `scripts/test-rls.mjs` (comptes de test admin / éditeur / référent / agent, assertions par rôle) | livré avec le lot A |

## 1. Lot A — Modèle de données et rôle « référent »

### 1.1 Migration `0016_centres.sql`

**Enums**

- `user_role` : + `referent` (ordre logique reader < referent < editor < admin ; `is_editor()` reste `editor|admin`).
- `post_status` : + `pending`, + `declined`.
- `center_type` : `cis`, `cs`, `cpi`, `cta_codis`, `direction`, `service`.
- `notification_kind` : + `push_center` (nouveau contenu sur mon centre).

**Tables**

```
groupings                 id, name, sort_order, created_at
centers (existante) +     grouping_id → groupings, type center_type, address, postal_code, city,
                          lat, lng, phone, email, cover_media_id → media, presentation (≤ 600),
                          chief_id → profiles, displayed_headcount int, (is_active existant),
                          pending_cover_media_id, pending_presentation, pending_by, pending_at
                          (proposition de mise à jour d'un référent, en attente)
services                  id, name, slug, short_description, mission (Markdown ≤ 2000),
                          contact_reasons text[] (3 lignes max), manager_id → profiles,
                          phone, email, address, grouping_id (nullable), sort_order, is_active
profiles +                service_id → services (nullable), job_title (≤ 60), directory_visible bool
                          default false, work_phone (≤ 30), present_me bool default false,
                          center_joined_at date (posé automatiquement au changement de center_id)
center_referents          center_id, profile_id, since date, is_active bool, ended_at,
                          created_by → profiles ; PK (center_id, profile_id, since)
center_follows            profile_id, center_id, created_at ; PK ; trigger « 3 maximum »
posts +                   scope post_scope default 'departmental' ('departmental' | 'center'),
                          center_id (existant) obligatoire si scope = 'center',
                          submitted_by → profiles, reviewed_by → profiles, reviewed_at,
                          moderation_message (≤ 500), promoted_from_id → posts
                          (post départemental créé par promotion)
events +                  center_id (nullable), submitted_by, reviewed_by, reviewed_at,
                          moderation_message ; status : + 'pending', + 'declined'
user_settings +           push_center bool default true
page_views                kind ('center' | 'directory'), target_id, user_id, day ; PK
                          (kind, target_id, user_id, day) — consultations Mon centre / Annuaire
```

**Vues de lecture** : `center_posts` (= `posts where scope = 'center'`), `directory_people`
(profils avec `directory_visible` ou chef/responsable, sans e-mail ni téléphone perso).

**Fonctions**

- `is_referent_of(center_id)` — STABLE, SECURITY DEFINER : vrai si l'utilisateur est référent actif du centre.
- `is_referent()` — vrai si au moins un centre.
- `center_to_json`, `service_to_json`, `get_center_page(slug)` (bandeau + identité + événements 7 j + nouveaux + curseur du fil du centre), `get_center_feed(center_id, cursor)`, `get_center_photos(center_id, cursor)`.
- `search_directory(q)` — `tsvector` (centres, services, villes, personnes visibles, fonctions) + `pg_trgm` (`similarity`) pour la tolérance aux fautes ; renvoie 3 listes typées.
- `promote_center_post(post_id)` — éditeur seulement : crée le post départemental lié (`promoted_from_id`, `author_display = service_com`, série « Dans les coulisses », crédit « Vie des centres — CIS Nom »), copie les médias (`post_media`), sans recopier réactions ni commentaires.
- `studio_center_stats(days)` — référents actifs, propositions reçues / validées / refusées par mois, centres sans publication depuis 60 j, consultations.
- Trigger `posts_center_guard` : un post `scope = 'center'` a un `center_id` ; un référent ne peut insérer qu'en `pending` ; passage `pending → published|declined` réservé à `is_editor()` ; `published_at` posé à la validation.
- Trigger `profiles_center_joined` : `center_joined_at = current_date` quand `center_id` change.
- Trigger `center_follows_limit` : 3 suivis maximum.
- Trigger `enqueue_center_post_notification` : à la publication d'un post de centre → `notification_queue (push_center)` + `notifications` pour les agents **rattachés** au centre uniquement (jamais les suivis) ; au refus/validation → notification à l'auteur avec `moderation_message`.
- Limite : 10 propositions `pending` par référent (trigger).

**RLS (résumé, tout en `authenticated`)**

| Table | select | insert | update | delete |
|---|---|---|---|---|
| groupings, services | tous | éditeur | éditeur | éditeur |
| centers | tous | éditeur | éditeur ; **référent** : uniquement `pending_cover_media_id`, `pending_presentation` de ses centres (trigger) | admin |
| center_referents | tous (annuaire) | éditeur | éditeur | éditeur |
| center_follows | soi | soi (max 3) | — | soi |
| posts (scope center) | `published` : tous ; `pending`/`declined` : auteur + éditeur | référent : `scope = 'center'`, `status = 'pending'`, `center_id` ∈ ses centres, `submitted_by = auth.uid()` ; éditeur : tout | référent : ses propres `pending` (texte, médias) ; éditeur : tout | référent : ses propres `pending` ; éditeur : tout |
| posts (scope departmental) | inchangé | **référent : refusé** (test RLS) | référent : refusé | référent : refusé |
| events (center) | `published` : tous ; autres : auteur + éditeur | référent : `pending` sur ses centres | référent : ses `pending` | idem |
| page_views | soi / éditeur | soi | — | — |

### 1.2 Studio (lot A)

- `/studio/centres` : onglet « Centres » = **file de validation** (propositions `pending`, groupées par centre, filtre par groupement, aperçu `PostCard`, « Valider », « Refuser » avec message, « Retoucher » ouvre `PostEditor` en mode validation). Compteur dans `StudioNav`.
- `/studio/centres/referentiel` : groupements, centres (fiche : coordonnées, chef, présentation, couverture, effectif, **référents** avec recherche d'agent, ajout, retrait, historique), services (avec « Pour quoi les contacter »).
- Sur un post de centre publié : « Publier aussi dans le fil » → `promote_center_post`.
- Import : `scripts/import-centres.mjs centres.csv services.csv` (colonnes documentées dans le README), géocodage BAN, rapport des adresses non trouvées ; rejouable (upsert par `slug`).
- Tests : `scripts/test-rls.mjs` (crée 4 comptes de test, exécute les assertions, les supprime) ; `npm run test:rls`.

**Composants** : `StudioCentersQueue`, `CenterReferentsEditor`, `CenterForm`, `ServiceForm`, `GroupingForm`, `PromoteButton`.

**Routes lot A** : `/studio/centres`, `/studio/centres/referentiel`, `/studio/centres/referentiel/centre/[id]`, `/studio/centres/referentiel/service/[id]`.

## 2. Lot B — Onglet « Mon centre »

**Navigation** : `NAV_ITEMS` = Fil · Mon centre · Annuaire · Profil. Agenda : pastille dans le fil (sous les stories) + entrée « Agenda » et « Favoris » dans le profil.

**Routes**

- `/centre` : si `profile.center_id` et `service_id` vides → écran de rattachement (recherche nom / ville, liste par groupement, services de direction en bas) ; sinon redirection vers `/centre/[slug]` (ou `/service/[slug]`).
- `/centre/[slug]` : page du centre, onglets horizontaux en haut si centres suivis (rattachement en premier).
- `/service/[slug]` : même composant `CenterPage`, données `services`.
- `/profil/propositions` : « Mes propositions » (historique avec statuts, message de modération).
- `/profil/centre` : changer de rattachement, gérer les centres suivis (3 max), « je souhaite être présenté », « visible dans l'annuaire », téléphone pro, fonction.

**Composants** : `CenterHero` (couverture 28 px, dégradé bas seulement), `CenterIdentity` (chef, référents, Appeler, Itinéraire), `CenterWeek` (événements 7 j → `Sheet` + `.ics`), `CenterNewcomers` (< 60 j et `present_me`), `CenterFeed` (`PostCard` + curseur), `CenterPhotos` (grille 3 colonnes, `Lightbox` galerie), `CenterPicker`, `FollowTabs`, `ProposeSheet` (actu / photos / événement, `MediaUploader` en mode référent : photos + vidéo), `MyProposals`.

**Notifications** : `push_center` respecte `user_settings.push_center` (activé par défaut, réglage dans Profil → Notifications, libellé « Nouveautés de mon centre ») ; auteur prévenu à la validation ou au refus (push + cloche, avec le message).

**Lien de carte natif** : `https://maps.apple.com/?daddr=lat,lng` sur iOS, `geo:lat,lng?q=` sur Android, repli OpenStreetMap sur desktop.

## 3. Lot C — Annuaire

**Routes** : `/annuaire` (recherche + segments Centres · Services), `/annuaire/centre/[slug]`, `/annuaire/service/[slug]`, `/annuaire/carte`.

**Composants** : `DirectorySearch` (verre, collé à la barre, focus auto desktop, résultats instantanés `search_directory` avec debounce 150 ms), `DirectoryCenters` (par groupement, badge type, icône téléphone → `tel:`), `DirectoryServices`, `CenterSheetCompact`, `ServiceSheetCompact`, `DirectoryMap` (MapLibre GL, OpenFreeMap, marqueurs blancs, rattachement en `--red`, tap → fiche, « Autour de moi » sur geolocation à la demande, jamais par défaut), `OfflineBadge`.

**Hors ligne** : `GET /api/annuaire/data` (centres + services + numéros + adresses, sans personnes ni photos), mis en cache par le service worker (« atlas-directory », stratégie réseau puis cache) ; badge « Hors ligne — données du JJ/MM ».

**Confidentialité** : `PRIVACY.md` complété (données, base légale : mission d'intérêt public, conservation : tant que le compte existe, retrait : décocher « visible dans l'annuaire » ou demande au service communication). Aucun champ de numéro personnel.

**Studio** : section « Centres » dans `/studio/statistiques` (`studio_center_stats`).

## 4. Qualité

- Playwright (`tests/e2e/centres.spec.ts`) : « référent propose une actu → éditeur valide → l'agent du centre reçoit la push (file vérifiée) et voit le post », « recherche d'un service, appel (`tel:` vérifié) ».
- Vitest (`tests/unit`) : `search_directory` tolérant aux fautes (via PostgREST sur la base de test), génération `.ics`.
- `scripts/test-rls.mjs` : rôle `referent` — insertion `published` refusée, écriture sur un centre étranger refusée, écriture sur `posts` départemental refusée, lecture des `pending` d'autrui refusée.
- Captures 390×844 et 1440×900 : Mon centre, Annuaire, fiche centre, fiche service ; auto-critique.
- README : import CSV, premier référent, carte.

## 5. Ordre de livraison

1. **Lot A** : migration 0016 + RLS + tests RLS + Studio (référentiel, référents, file de validation, promotion) + import CSV.
2. **Lot B** : navigation, rattachement, page du centre, espace référent, notifications.
3. **Lot C** : annuaire, fiches, carte, hors ligne, confidentialité, statistiques centres.

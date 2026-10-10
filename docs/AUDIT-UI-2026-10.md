# Audit UI / UX — octobre 2026

Revue en lecture seule de toutes les pages et composants (fil, stories, centres, annuaire,
messagerie, notifications, profil, Studio, accueil, rattachement), à l'aune de DESIGN.md.
48 constats, chacun avec fichier:ligne et correctif. Priorités en fin de document.

## 1. Fluidité (13)

- F1 `app/(app)/layout.tsx:9-16` : quatre `await` séquentiels (utilisateur, messagerie, non-lus, thème) à chaque navigation → `Promise.all` après `getCurrentUser`.
- F2 `BellButton.tsx:18-30` + `BottomNav.tsx:32-45` : deux actions serveur à chaque changement de route plus des sondages à 60 s / 45 s → compteurs passés en props, rafraîchis au retour sur l'app seulement.
- F3 `messages/Conversation.tsx:89-117` : rechargement complet toutes les 8 s et « vu par » toutes les 20 s malgré le temps réel ; chaque événement refait `fetchMessages` → appliquer `payload.new`, filet à 30 s.
- F4 `feed/PhotoCarousel.tsx:156-157` : première photo de chaque carte en `eager` + `fetchPriority="high"` même hors écran → réserver aux deux premières cartes.
- F5 `feed/InfiniteFeed.tsx:81-95` : pas de fenêtrage ; chaque carte monte trois IntersectionObservers et une vidéo → `content-visibility:auto` ou virtualisation légère.
- F6 `feed/PostCard.tsx:21-28` : react-markdown, Comments (temps réel), VideoPlayer, ArticleReader importés statiquement dans le bundle du fil → `next/dynamic`.
- F7 `lib/membership/request.ts:25` : envoi SMTP attendu dans l'action → l'accueil et « Mon centre » bloquent plusieurs secondes → `after()`.
- F8 `layout/ThemeApplier.tsx:24-35` : thème appliqué en effet → flash sombre→clair → script inline dans `<head>`.
- F9 `centre/FollowButton.tsx:32` : `router.refresh()` (dix requêtes) pour mettre à jour les onglets suivis → état client.
- F10 `feed/Comments.tsx:72-81` : pas d'insertion optimiste, deux fetchs par commentaire.
- F11 Aucun `error.tsx` / `not-found.tsx` dans `app/` : erreur Supabase ou slug inconnu = écran Next brut en anglais.
- F12 `studio/utilisateurs/page.tsx:32`, `stories/page.tsx:26`, `posts/page.tsx:56` : 500 / 300 / 100 lignes sans pagination.
- F13 `globals.css:156-162` : flou 24 px + `saturate(160%)` sur la barre fixe, voile plein écran flouté (`Sheet.tsx:91`) → à-coups au défilement sur Android d'entrée de gamme ; retirer `saturate`, flou 16 px.

## 2. Responsive (10)

- R1 `layout/TopBar.tsx:44` : titre `inset-x-24` (96 px) mais le bloc droit d'un éditeur fait 128 px → chevauchement à 360–390 px → `right-[132px]`.
- R2 `studio/SettingsPanel.tsx:131,179` : champs `w-72` (288 px) pour 280 px disponibles → `w-full sm:w-72`.
- R3 `feed/PhotoCarousel.tsx:211-219` : points de position de 6 px cliquables → zone tactile 24 px ou non interactifs.
- R4 Cibles < 44 px : `Comments.tsx:208-251`, `FeedFilters.tsx:148`, `Composer.tsx:247`, `AvatarUploader.tsx:74` → `min-h-11 px-2`.
- R5 `messages/Conversation.tsx:199,265` : `fixed inset-0` sans `visualViewport` → composeur sous le clavier iOS → réutiliser `useKeyboardInset`.
- R6 Blancs codés en dur invisibles en thème clair : `Sheet.tsx:118`, `Onboarding.tsx:57`, `FeedbackForm.tsx:62`, `UploadQueue.tsx:22` → jetons `--line` / `--text-4`.
- R7 `UsersTable.tsx:249` : feuille `pb-8` sans `safe-area-inset-bottom`.
- R8 `globals.css:276-291` : paysage bloqué → visionneuse et vidéo impossibles en paysage → exclure quand un dialogue ou une vidéo est ouvert.
- R9 Studio mobile : `PostEditor.tsx:198`, `StoryEditor.tsx:111`, `CenterForm.tsx:49` lien retour masqué sous `sm` → BackBar mobile.
- R10 `statistiques/page.tsx:122-165`, `AuditJournal.tsx:89-122`, `EditorialCalendar.tsx:142` : tables de 640–720 px et sept colonnes à 360 px → cartes sous `sm`.

## 3. Parcours lecteur (8)

- L1 Liens profonds des notifications SQL : `/agenda#<id>`, `/centre#<id>`, `/centre#semaine` n'ont pas d'ancre correspondante (`AgendaList.tsx:85`, `CenterWeek.tsx:15`) → poser `id={e.id}`, `id="semaine"`, ouvrir la feuille si `location.hash` correspond. Les autres liens (demandes, profil, Studio, messages) sont bons.
- L2 `layout/BackBar.tsx:8` : « Retour » toujours vers le fil, même depuis une notification ou les favoris → `router.back()` si historique.
- L3 `centre/page.tsx:32-43` : bandeau « demande envoyée » et sélecteur complet affichés ensemble, « retirer » renvoie vers Profil → masquer le sélecteur, bouton Retirer sur place.
- L4 `bienvenue/Onboarding.tsx:102-109` : liste déroulante brute de tous les centres sans recherche ni services → réutiliser `CenterPicker` en feuille.
- L5 `centre/CenterPicker.tsx:56-57` : après la demande, redirection vers Profil → rester sur « Mon centre » en état « en attente ».
- L6 `profile/MyActivity.tsx:21` : tuile « Commentaires » renvoie au fil (cul-de-sac) → liste des commentaires ou retirer le lien.
- L7 `NotificationsList.tsx:19-24` : tout marqué lu 1,5 s après l'ouverture, le filtre « Non lues » se vide → marquer lu au toucher, compteur local.
- L8 Pas de `not-found.tsx` : publication supprimée ouverte depuis une notification = 404 en anglais.

## 4. Parcours éditeur (6)

- E1 `studio/StudioNav.tsx:15-16,38,57` : « Centres » et « Rattachements » actifs ensemble, le sélecteur mobile affiche « Centres » → tester les entrées exactes d'abord.
- E2 `studio/layout.tsx:37,64-66` : `RoleProvider` sans `canMessage` → la barre basse du Studio mobile montre « Annuaire » là où l'app montre « Messages ».
- E3 Co-rédacteur : `profil/page.tsx:120` et `CreateMenu.tsx:25` masqués pour un lecteur → `/studio/partages` n'est joignable que par la notification → entrée « Publications partagées » dans le profil.
- E4 `studio/PostEditor.tsx:107-117` : sauvegarde automatique seulement sur une publication existante → nouvelle publication perdue à la fermeture → créer le brouillon dès le premier titre.
- E5 `StudioNav.tsx:21` « Utilisateurs » visible pour les éditeurs alors que la page refuse → masquer selon le rôle.
- E6 Seize `window.confirm` (`PostEditor.tsx:420`, `StoriesList.tsx:131`, `UsersTable.tsx:399`…) → feuille de confirmation maison.

## 5. Parcours admin (5)

- A1 `UsersTable.tsx:197-236` : 500 lignes, aucun filtre rôle / statut / jamais connecté / centre, recherche à la validation seulement → pilules de filtre et tri.
- A2 Pas d'actions groupées : une feuille de six sections par compte → cases à cocher et barre d'actions, sections en accordéon.
- A3 `UsersTable.tsx:333-368` : mise à jour optimiste sans retour arrière si l'action échoue.
- A4 `SettingsPanel.tsx:105-112,146` : réglages grisés pour les éditeurs sans explication.
- A5 `centre/CenterContactsAdmin.tsx:20` : bloc ouvert par défaut au-dessus du contenu ; `centre/[slug]/page.tsx:57` : demandes chargées après le `Promise.all` → replier, intégrer au `Promise.all`.

## 6. Accessibilité (6)

- X1 `globals.css:219-222` : focus visible de 1 px à 8 % de blanc, quasi invisible → `outline: 2px solid var(--text-1)`.
- X2 `app/layout.tsx:29` `maximumScale: 1` bloque le zoom ; les champs à 16 px suffisent contre le zoom iOS → retirer.
- X3 `--text-4` (contraste 3,3:1) utilisé comme texte lisible dans 18 endroits → `text-text-3`.
- X4 `AgendaList.tsx:56` : `opacity-70` sur la liste passée → contraste insuffisant.
- X5 `feed/Lightbox.tsx:154-163`, `StoryViewer.tsx:220` : dialogues sans piège de focus ni focus initial.
- X6 `feed/PostCard.tsx:218-222` : zone texte `div onClick` sans rôle ni clavier ; `FeedbackForm.tsx:50-63` : radios maison sans navigation aux flèches. Le mode « mouvement réduit » est bien respecté partout.

## Dix priorités (impact / effort)

1. L1 ancres des notifications (fort / faible)
2. X1 focus visible (fort / faible)
3. F2 actions serveur à chaque route (fort / faible)
4. F1 cascade d'attentes du layout (fort / faible)
5. R1 titre masqué par les icônes à 360 px (fort / faible)
6. F4 priorité de chargement sur toutes les cartes (moyen / faible)
7. L3 + L5 état « demande en attente » (fort / moyen)
8. F7 envoi SMTP synchrone à l'accueil (fort / faible)
9. E1 + E2 navigation du Studio mobile (moyen / faible)
10. F6 chargement différé des gros composants de la carte du fil (moyen / moyen)

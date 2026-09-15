# PRIVACY.md — données personnelles dans ATLAS

Chaque donnée personnelle collectée est justifiée en une ligne, avec sa durée de
conservation. Les vues et lectures sont purgées après 13 mois. Aucun outil tiers de
mesure d'audience ; aucune messagerie entre agents ; aucun profil public étendu.

**Base légale** : mission d'intérêt public du SDIS (communication interne et
fonctionnement du service). **Responsable** : SDIS 62, service communication.

| Donnée | Justification | Conservation |
|---|---|---|
| E-mail, prénom, nom, centre ou service (`profiles`) | identifier l'agent, signer ses commentaires, afficher son centre dans l'onglet « Mon centre » | durée du compte ; anonymisation à la suppression |
| Avatar facultatif (`profiles.avatar_key`) | reconnaissance dans les commentaires et l'annuaire | durée du compte |
| Rôle, état actif, date d'accueil (`profiles`) | droits d'accès, première connexion | durée du compte |
| Fonction, téléphone professionnel (`profiles.job_title`, `work_phone`), facultatifs | annuaire interne, à l'initiative de l'agent | durée du compte ; effaçables à tout moment depuis Profil → Mon centre |
| Visibilité dans l'annuaire (`profiles.directory_visible`, **désactivée par défaut**) | n'afficher dans l'annuaire que les agents qui l'ont choisi | durée du compte ; retrait immédiat en décochant |
| Présentation aux collègues (`profiles.present_me`, désactivée par défaut) et date de rattachement (`center_joined_at`) | « Bienvenue à » sur la page du centre pendant 60 jours | durée du compte ; l'affichage cesse seul après 60 jours |
| Centres suivis (`center_follows`, 3 au plus) | onglets « Mon centre » | durée du compte |
| Désignation comme référent communication (`center_referents`, historique) | droits de proposition, traçabilité du réseau | durée du compte (l'historique des désignations reste consultable dans le Studio) |
| Propositions de centre (`posts`, `events` : auteur, contenu, décision et message du service communication) | validation avant publication, réponse à l'auteur | durée du compte ; une proposition en attente peut être retirée par son auteur |
| Réactions, commentaires, favoris, votes | fonctionnement du fil | durée du compte ; commentaires anonymisés à la suppression |
| Vues de publications (`post_views`, une ligne par agent et par publication, date au jour) palier de lecture vidéo atteint (25 / 50 / 75 / 100 %), lecture qualifiée (`read` : carte visible 2 s ou article parcouru à 80 %) et interaction (`interacted`), sans horodatage | statistiques de portée pour le service communication | 13 mois |
| Consultations des pages de centre et de l'annuaire (`page_views`, une ligne par agent, par jour et par page, sans horodatage fin) | mesurer l'usage du réseau de référents (chiffres agrégés dans le Studio) | 13 mois, purge automatique |
| Vues de stories (`story_views`) | statistiques visibles des seuls éditeurs | 13 mois |
| Abonnements push (`push_subscriptions` : point de terminaison, clés, navigateur) | envoyer les notifications choisies par l'agent | jusqu'à désactivation, ou purge automatique si le navigateur refuse |
| Préférences de notification (`user_settings` : par type de contenu, plage de silence, aperçu masqué) | respecter les choix de l'agent | durée du compte |
| Pushs en attente de fin de plage de silence (`notification_deferred`) | regrouper les notifications de nuit | quelques heures, supprimées à l'envoi |
| Ouvertures de push (`push_opens` : agent, contenu, jour, sans heure) | taux d'ouverture par type de contenu dans le Studio | 13 mois |
| Notifications dans l'app (`notifications`) | cloche : validation, refus, nouveautés du centre | 90 jours |
| Signalements (`feedback` : catégorie, description, capture facultative, page, navigateur, version) | corriger les problèmes remontés par les agents | 13 mois après traitement |
| Signalements de commentaires (`comment_reports`) | modération | 13 mois |
| Journal d'audit (`audit_log` : actions des éditeurs) | traçabilité des publications et de la modération | 13 mois |
| Versions de brouillons, verrou d'édition, relecture (`post_versions`, `posts.lock_by`, `post_review_comments` : éditeurs seulement) | travail à plusieurs sur une publication | 30 versions par publication ; commentaires tant que la publication existe |
| Empreinte de fichier (`media.fingerprint`, SHA-256 du média envoyé) | signaler un doublon à l'éditeur | durée du média |
| Limitation de débit (`rate_limit_events`) | prévenir les abus | 24 heures |
| Jeton de session (cookie) | authentification | session |

## Ce qui n'est pas collecté

- **Aucun numéro personnel** : seul un téléphone professionnel facultatif peut être saisi.
- **Position du fil et reprise d'un article** : gardées sur l'appareil seulement (session du navigateur, stockage local), jamais envoyées ; historique des recherches idem.
- **Stories** : réactions (`story_reactions`), votes aux sondages (`story_poll_votes`) et réponses aux questions (`story_question_answers`) sont visibles du service communication seulement ; les autres agents ne voient que la répartition anonyme des votes après avoir voté. Progression maximale et « passage à la suivante » (`story_views.progress`, `advanced`) sans horodatage fin. Suppression de la story → suppression en cascade.
- **Historique de profil** (`profile_history`) : changements de centre / service, de rôle et de statut, datés, visibles de l'agent et du service communication (traçabilité des rattachements). **Modifications de fiche** (`center_changes`) : auteur, valeurs avant / après, décision et note, visibles des référents du centre et de la com. « Mon activité » n'est visible que de l'agent. « Consultés récemment » et le thème restent sur l'appareil (le thème est aussi mémorisé dans les préférences).
- **Messagerie** (`channels`, `channel_messages`, `message_reactions`, `channel_reads`) : messages, pièces jointes et vocaux conservés 24 mois puis effacés (fichiers compris) ; accessibles aux membres de la conversation et au service communication (modération, export texte). Accusés de lecture (« Vu par ») : date de dernière lecture par conversation, jamais par message. Pas de chiffrement de bout en bout. Les fichiers sont servis depuis le bucket public sous des clés non devinables (`messages/<canal>/<uuid>`). Suppression d'un message : contenu masqué immédiatement, ligne purgée avec la conversation. Un agent quittant un groupe n'y a plus accès ; ses messages restent (« Agent supprimé » si le compte est effacé).
- **Reprise de lecture vidéo** : la position est gardée sur l'appareil seulement (stockage local), jamais envoyée.
- **Assistance au texte alternatif** : si le service communication branche une API vision, seule l'image (sans métadonnées) est envoyée pour proposer une description ; jamais de données d'agent.
- **Transcription** : si le service communication branche un fournisseur de sous-titres automatiques, seule la piste audio de la vidéo publiée lui est envoyée, jamais de données d'agent.
- **Position de l'agent** : la carte de l'annuaire ne demande la position qu'au toucher
  de « Autour de moi », l'affiche localement et ne la transmet ni ne l'enregistre.
- **Fond de carte** : les tuiles viennent d'OpenFreeMap (OpenStreetMap), sans clé ni
  cookie ; le fournisseur voit une adresse IP comme pour toute image chargée sur le web.
  L'URL est modifiable en une ligne pour un hébergement par le SDIS.
- **Mode hors ligne de l'annuaire** : seuls centres et services (numéros, adresses) sont
  gardés sur l'appareil ; jamais les agents ni les photos.

## Droits

Export et suppression du compte en un clic par un administrateur (Studio →
Utilisateurs). Retrait de l'annuaire : décocher « Visible dans l'annuaire » dans
Profil → Mon centre, ou demande au service communication. Contact : service
communication du SDIS 62.

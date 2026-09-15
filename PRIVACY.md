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
| Vues de publications (`post_views`, une ligne par agent et par publication, date au jour) | statistiques de portée pour le service communication | 13 mois |
| Consultations des pages de centre et de l'annuaire (`page_views`, une ligne par agent, par jour et par page, sans horodatage fin) | mesurer l'usage du réseau de référents (chiffres agrégés dans le Studio) | 13 mois, purge automatique |
| Vues de stories (`story_views`) | statistiques visibles des seuls éditeurs | 13 mois |
| Abonnements push (`push_subscriptions` : point de terminaison, clés, navigateur) | envoyer les notifications choisies par l'agent | jusqu'à désactivation, ou purge automatique si le navigateur refuse |
| Préférences de notification (`user_settings`) | respecter les choix de l'agent (dont « Nouveautés de mon centre ») | durée du compte |
| Notifications dans l'app (`notifications`) | cloche : validation, refus, nouveautés du centre | 90 jours |
| Signalements (`feedback` : catégorie, description, capture facultative, page, navigateur, version) | corriger les problèmes remontés par les agents | 13 mois après traitement |
| Signalements de commentaires (`comment_reports`) | modération | 13 mois |
| Journal d'audit (`audit_log` : actions des éditeurs) | traçabilité des publications et de la modération | 13 mois |
| Limitation de débit (`rate_limit_events`) | prévenir les abus | 24 heures |
| Jeton de session (cookie) | authentification | session |

## Ce qui n'est pas collecté

- **Aucun numéro personnel** : seul un téléphone professionnel facultatif peut être saisi.
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

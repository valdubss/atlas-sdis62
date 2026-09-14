# PRIVACY.md — données personnelles dans ATLAS

Chaque donnée personnelle collectée est justifiée en une ligne, avec sa durée de
conservation. Les vues et lectures sont purgées après 13 mois. Aucun outil tiers de
mesure d'audience ; aucune messagerie entre agents ; aucun profil public étendu.

| Donnée | Justification | Conservation |
|---|---|---|
| E-mail, prénom, nom, centre ou service (`profiles`) | identifier l'agent, signer ses commentaires, cibler les publications par centre | durée du compte ; anonymisation à la suppression |
| Avatar facultatif (`profiles.avatar_key`) | reconnaissance dans les commentaires | durée du compte |
| Rôle, état actif, date d'accueil (`profiles`) | droits d'accès, première connexion | durée du compte |
| Réactions, commentaires, favoris, votes | fonctionnement du fil | durée du compte ; commentaires anonymisés à la suppression |
| Vues de publications (`post_views`, une ligne par agent et par publication, date au jour) | statistiques de portée pour le service communication | 13 mois |
| Vues de stories (`story_views`) | statistiques visibles des seuls éditeurs | 13 mois |
| Abonnements push (`push_subscriptions` : point de terminaison, clés, navigateur) | envoyer les notifications choisies par l'agent | jusqu'à désactivation, ou purge automatique si le navigateur refuse |
| Préférences de notification (`user_settings`) | respecter les choix de l'agent | durée du compte |
| Signalements (`feedback` : catégorie, description, capture facultative, page, navigateur, version) | corriger les problèmes remontés par les agents | 13 mois après traitement |
| Signalements de commentaires (`comment_reports`) | modération | 13 mois |
| Journal d'audit (`audit_log` : actions des éditeurs) | traçabilité des publications et de la modération | 13 mois |
| Limitation de débit (`rate_limit_events`) | prévenir les abus | 24 heures |
| Jeton de session (cookie) | authentification | session |

Droits : export et suppression du compte en un clic par un administrateur
(Studio → Utilisateurs). Contact : service communication du SDIS 62.

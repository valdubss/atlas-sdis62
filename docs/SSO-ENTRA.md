# Connexion Microsoft (Entra ID) pour ATLAS — fiche pour la DSI

ATLAS peut authentifier les agents avec leur compte Microsoft du SDIS 62 (Microsoft 365 /
Entra ID). L'authentification est déléguée à Supabase Auth ; ATLAS ne voit jamais le mot
de passe. Trois informations sont nécessaires, à créer dans le portail Entra.

## Ce que la DSI doit faire

1. Portail Azure → **Microsoft Entra ID → Inscriptions d'applications → Nouvelle inscription**
   - Nom : `ATLAS SDIS 62`
   - Types de comptes : *Comptes dans cet annuaire organisationnel uniquement*
   - URI de redirection (type **Web**) :
     `https://fxtqutqtiqgpttqpnouy.supabase.co/auth/v1/callback`
2. Dans l'application créée : **Certificats et secrets → Nouveau secret client** (durée
   24 mois, noter la date d'expiration dans le calendrier).
3. **Autorisations d'API → Microsoft Graph → autorisations déléguées** : `openid`,
   `email`, `profile`, `User.Read`, puis *Accorder le consentement d'administrateur*.
4. **Configuration du jeton** (facultatif mais recommandé) : ajouter les revendications
   facultatives `given_name`, `family_name`, `email` au jeton d'ID, pour que le prénom et
   le nom soient préremplis.

## Ce que la DSI renvoie au service communication

| Information | Où la trouver |
|---|---|
| **ID de l'application (client)** | page *Vue d'ensemble* de l'application |
| **ID de l'annuaire (tenant)** | page *Vue d'ensemble* |
| **Valeur du secret client** | affichée une seule fois à la création du secret |

## Ce que le service communication fait ensuite

1. Dashboard Supabase → **Authentication → Providers → Azure** : activer, coller l'ID
   client et le secret, renseigner *Azure Tenant URL* :
   `https://login.microsoftonline.com/<ID de l'annuaire>`.
2. Dans `.env` de l'application (et sur Vercel) :

```
AUTH_OIDC_PROVIDER=azure
AZURE_TENANT_ID=<ID de l'annuaire>
```

3. Redémarrer l'application : le bouton **Continuer avec Microsoft** apparaît sur la
   page de connexion. Un administrateur peut ensuite, dans Studio → Paramètres, forcer le
   SSO (les connexions par mot de passe et par lien sont alors désactivées).

## Comportement

- Au premier login SSO, le profil est créé automatiquement (prénom, nom, e-mail) ; l'agent
  choisit son centre une seule fois sur l'écran d'accueil.
- La liste des domaines autorisés (`sdis62.fr`) s'applique aussi au SSO.
- Aucune donnée n'est écrite dans Entra ID : lecture seule du profil.

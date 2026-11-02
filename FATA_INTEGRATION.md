# Intégration du challenge Fata

Le serveur utilise les identifiants et endpoints convenus avec Fata. Les valeurs d’exemple du guide ne remplacent pas la configuration fournie pour l’environnement de test et la production.

## Configuration XERA1

Les secrets Fata restent dans les variables serveur Vercel déjà configurées. Vérifier les paramètres suivants dans les environnements concernés :

- `FATA_CLIENT_ID`
- `FATA_CLIENT_SECRET` (secret serveur)
- `FATA_OIDC_ISSUER`
- `FATA_OIDC_DISCOVERY_URL` (facultatif si l’URL est `/.well-known/openid-configuration` sous l’issuer)
- `FATA_OIDC_REDIRECT_URI` = URL publique `/api/auth/fata/callback`
- `FATA_API_BASE_URL` = base de l’API, sans `/v1/action-completions`
- `FATA_REAL_CHALLENGE_ID`
- `FATA_REQ_ARC`, `FATA_REQ_PREUVE`, `FATA_REQ_JALON`
- `FATA_TOKEN_AUTH_METHOD` = méthode fournie par Fata (`client_secret_basic` ou `client_secret_post`)
- `CRON_SECRET` = secret serveur utilisé pour protéger le worker planifié

Les identifiants du challenge et des trois étapes doivent être les valeurs finales fournies par Fata. XERA1 n’utilise plus les valeurs d’exemple du guide comme valeurs de repli. `FATA_TEST_CHALLENGE_ID` est facultatif et doit désigner un challenge de test configuré chez Fata.

Les URLs du document de proposition ne sont pas considérées comme le contrat final. Au démarrage OAuth, XERA1 lit le document OIDC, vérifie l’issuer, puis utilise ses endpoints d’autorisation, de jeton et ses clés publiques avec la bibliothèque `openid-client` (Node.js 20 ou supérieur).

## Configuration Supabase

Avant de déployer la version applicative, appliquer [la migration Fata](sql/20261102_fata_contract_compliance.sql). Elle ajoute les jalons aux ARC, le contexte de sélection à la liaison, les dates de réception du challenge et la fonction atomique de sélection.

La ligne du challenge dans `fata_challenges_config` doit contenir les trois identifiants d’étape, `opens_at`, `close_at`, `receipt_deadline_at` et `is_active`, selon les valeurs communiquées par Fata. XERA1 refuse l’envoi si les identifiants de la base et de la configuration serveur divergent.

## Worker Vercel

Sur le plan Hobby, `/api/cron/fata-worker` est planifié une fois par jour à 11:00 UTC dans `vercel.json`, afin que le déploiement soit accepté. `CRON_SECRET` doit être défini; sans lui, le worker refuse de traiter la file. Ce rythme peut retarder les confirmations jusqu’à près de 24 heures et ne garantit pas le respect d’une date limite courte. Pour le traitement toutes les cinq minutes prévu dans le parcours de production, passez le projet en plan Pro ou Enterprise puis remplacez l’expression par `*/5 * * * *`. [Limites officielles des Cron Jobs Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Les confirmations sont mises en file après enregistrement serveur de l’action. Le worker garde la même clé d’idempotence lors des reprises et arrête les essais après une erreur permanente du contrat.

Un ARC créé pendant la période d’activité après la liaison des comptes est associé automatiquement au challenge lorsqu’il est conforme; son `created_at` sert de date pour l’action 1. Pour un ARC déjà existant, l’heure de sélection enregistrée côté serveur sert de date d’action.

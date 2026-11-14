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

Avant de déployer la version applicative, appliquer [la migration Fata](sql/20261102_fata_contract_compliance.sql), puis [la migration de file transactionnelle](sql/20261105090000_fata_transactional_outbox.sql), [la migration des récompenses et de la célébration](sql/20261105130000_fata_rewards_celebration.sql) et enfin [la migration des déclencheurs d’activité](sql/20261108120000_fata_activity_triggers.sql). Cette dernière garantit qu’un déclencheur `AFTER INSERT` existe sur `arcs`, `content` et `arc_milestone_validations`, sans dupliquer un déclencheur actif déjà présent. L’action source et sa tâche d’envoi sont ainsi enregistrées dans la même transaction PostgreSQL. La sélection d’un ARC écrit aussi son association et sa tâche dans la même transaction RPC.

La dernière migration permet le badge public `fata`, attribue atomiquement ce badge et une visibilité ×5 à la qualification du challenge officiel, et conserve l’état de la popup de réussite jusqu’à sa fermeture par l’utilisateur. Elle applique aussi ces récompenses aux qualifications officielles déjà importées; les challenges de test restent exclus. Après application, déployer ensemble le client et les deux serveurs (`monetization-server.js` pour Vercel, `optimized-server.js` en local). La popup est récupérée au démarrage de la session XERA1; si l’utilisateur est hors ligne, elle reste en attente. La fermeture acquitte l’annonce côté serveur. Le ×5 pondère le classement des contenus dans le feed; le nombre d’impressions réel dépend du contenu et de l’activité du feed.

La ligne du challenge dans `fata_challenges_config` doit contenir les trois identifiants d’étape, `opens_at`, `close_at`, `receipt_deadline_at` et `is_active`, selon les valeurs communiquées par Fata. XERA1 refuse l’envoi si les identifiants de la base et de la configuration serveur divergent.

Depuis le panneau XERA1, la connexion Fata peut démarrer sans paramètre `challengeId` dans l’URL : le serveur utilise alors `FATA_REAL_CHALLENGE_ID`, l’enregistre dans l’état OAuth, puis le renvoie au retour du callback. Les liens entrants depuis Fata peuvent toujours transmettre explicitement un identifiant de challenge.

## Worker Vercel

Sur le plan Hobby, `/api/cron/fata-worker` reste planifié une fois par jour à 11:00 UTC dans `vercel.json`; `CRON_SECRET` doit être défini pour l’autoriser. Après l’insertion d’un ARC, d’une preuve ou d’une validation de jalon, le client appelle l’endpoint authentifié `/api/fata/sync`, qui tente d’envoyer immédiatement les tâches déjà validées en base. Une erreur réseau laisse la tâche dans la file; le worker quotidien assure les reprises et la réconciliation. Les écritures faites sans client XERA1 actif restent donc susceptibles d’attendre le prochain cron, jusqu’à près de 24 heures. Pour le traitement toutes les cinq minutes prévu dans le parcours de production, passez le projet en plan Pro ou Enterprise puis remplacez l’expression par `*/5 * * * *`. [Limites officielles des Cron Jobs Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Les actions et leurs tâches d’envoi sont validées ensemble par PostgreSQL : si l’écriture de la tâche échoue, l’action est annulée. Le worker Vercel reste quotidien pour le moment; il dépile ces tâches, conserve la même clé d’idempotence lors des reprises et arrête les essais après une erreur permanente du contrat.

Un ARC créé pendant la période d’activité après la liaison des comptes est associé automatiquement au challenge lorsqu’il est conforme; son `created_at` sert de date pour l’action 1. Pour un ARC déjà existant, l’heure de sélection enregistrée côté serveur sert de date d’action.

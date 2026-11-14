# Correction du problème des compteurs d'abonnés à 0

## Problème Identifié

La table `followers` qui gère les relations de suivi entre utilisateurs **n'existe pas** dans votre base de données Supabase. C'est pourquoi tous les utilisateurs affichent 0 abonnés, peu importe combien de personnes les suivent réellement.

## Solution

### Étape 1 : Exécuter le script SQL dans Supabase

1. Allez à https://app.supabase.com et connectez-vous à votre projet XERA1
2. Allez à l'onglet **SQL Editor**
3. Créez une nouvelle requête
4. Copiez-collez le contenu du fichier `sql/create-followers-table.sql`
5. Cliquez sur **Run** (ou appuyez sur Ctrl/Cmd + Enter)

### Étape 2 : Vérifier que la table a été créée

Dans l'onglet **Table Editor**, vous devriez voir une nouvelle table `followers` avec les colonnes :

- `id` (UUID)
- `follower_id` (UUID) - l'utilisateur qui suit
- `following_id` (UUID) - l'utilisateur suivi
- `created_at` (timestamp)

### Étape 3 : Réinitialiser les compteurs (optionnel, si vous aviez des données avant)

Si vous aviez des données dans une table `followers` avant son suppression et que vous voulez les restaurer, exécutez :

```sql
-- Réinitialiser tous les compteurs à 0
UPDATE users SET followers_count = 0;

-- Recalculer les vrais compteurs (si la table followers avait été restaurée avec ses données)
UPDATE users
SET followers_count = (
    SELECT COUNT(*) FROM followers WHERE followers.following_id = users.id
)
WHERE id IN (SELECT DISTINCT following_id FROM followers);
```

## Vérification

Après avoir exécuté le script :

1. Allez à un profil utilisateur
2. Cliquez sur "S'abonner" (ou "Rejoindre" pour les comptes communautaires)
3. Le compteur d'abonnés devrait **augmenter de 1**
4. Allez voir le profil de l'utilisateur suivi - il devrait aussi voir **+1 abonné**

## Notes Techniques

- Le compteur `followers_count` dans la table `users` est automatiquement géré par un **trigger SQL**
- Chaque ajout/suppression dans la table `followers` met à jour automatiquement `followers_count`
- Les Row Level Security (RLS) policies permettent que chacun suive/arrête de suivre les autres

## Dépannage

**Q: J'ai exécuté le script mais ça dit "table already exists"**
R: C'est OK ! La table existe déjà. Vérifiez juste qu'elle a les colonnes `follower_id` et `following_id`.

**Q: Les compteurs affichent toujours 0**
R:

- Vérifiez que vous avez bien exécuté le script
- Rafraîchissez la page (Ctrl+F5)
- Vérifiez dans Supabase que la table `followers` existe et n'est pas vide
- Vérifiez la colonne `followers_count` dans la table `users`

**Q: J'ai une erreur "permission denied"**
R: Allez à https://app.supabase.com → SQL Editor → assurez-vous qu'aucun RLS policy ne bloque l'accès admin. La création de table devrait fonctionner avec les droits admin.

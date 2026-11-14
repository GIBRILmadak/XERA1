# ⚠️ Pourquoi les compteurs d'abonnés sont à 0

## TL;DR (Résumé rapide)

**Problème** : Tous les utilisateurs affichent 0 abonnés, peu importe combien de personnes les suivent.

**Cause** : Le trigger SQL qui met à jour `followers_count` est cassé/inexistant ou la table `followers` a un problème.

**Solution** : Exécuter le script SQL `FOLLOWERS-COMPLETE-FIX.sql` dans Supabase.

---

## 🔧 Qu'est-ce qui s'est passé?

### Architecture du système de followers

```
L'app XERA1 utilise une architecture à deux niveaux:

1. TABLE: followers
   ├─ Rows: les relations "User A suit User B"
   ├─ follower_id: L'utilisateur qui suit (ex: Alice)
   ├─ following_id: L'utilisateur suivi (ex: Bob)
   └─ RLS: Chacun peut voir qui suit qui

2. TABLE: users
   ├─ Column: followers_count (INTEGER)
   ├─ Mis à jour: AUTOMATIQUEMENT par un TRIGGER SQL
   └─ But: Afficher rapidement "Bob a 12 abonnés" sans compter à chaque fois

3. TRIGGER: followers_count_update
   ├─ Déclenché: À chaque fois qu'on ajoute/supprime une relation
   ├─ Action: Recompte les followers et met à jour users.followers_count
   └─ Problème: ⚠️ NE FONCTIONNE PAS → followers_count reste à 0
```

### Problèmes identifiés

| Problème                   | Symptôme                                                    |
| -------------------------- | ----------------------------------------------------------- |
| ❌ Trigger cassé           | La table followers existe mais les compteurs ne montent pas |
| ❌ Trigger inexistant      | Aucun trigger n'existe pour mettre à jour les compteurs     |
| ❌ RLS bloque les lectures | Impossible de lire la table followers → compteur vide       |
| ⚠️ Données désynchronisées | followers_count est à 0 pour tout le monde                  |

---

## ✅ Solution ultime: FOLLOWERS-COMPLETE-FIX.sql

Ce script SQL fait:

```sql
✓ Crée la table followers (si manquante)
✓ Ajoute les index pour les performances
✓ Active le Row Level Security
✓ Configure 3 policies RLS (lire, suivre, arrêter de suivre)
✓ Nettoie les anciens triggers/fonctions cassé(es)
✓ Crée une NOUVELLE fonction de trigger robuste
✓ Attache le trigger à la table
✓ RECALCULE tous les compteurs de followers dans la base
```

### Avantage du script

- ✅ Idempotent (peut s'exécuter plusieurs fois sans erreur)
- ✅ Teste si la colonne/table existe avant de la créer
- ✅ Gère les cas limites (NULL, 0 followers, etc.)
- ✅ Recompte automatiquement les données existantes
- ✅ Teste sur test de sécurité RLS

---

## 🚀 Instructions étape-par-étape

### Étape 1: Ouverture de Supabase

```
1. Allez à https://app.supabase.com
2. Connectez-vous avec vos identifiants
3. Cliquez sur le projet "XERA1"
4. Sur la gauche, cherchez l'icône "{}" (SQL Editor)
5. Cliquez dessus
```

### Étape 2: Création d'une nouvelle requête

```
1. En haut, cliquez sur "New Query" (ou le + bleu)
2. Une nouvelle page SQL s'ouvre (vierge)
3. Prêt à coller du code
```

### Étape 3: Copie du script

```
1. Retournez au projet XERA1 dans VS Code
2. Ouvrez le fichier: sql/FOLLOWERS-COMPLETE-FIX.sql
3. Sélectionnez TOUT (Cmd/Ctrl + A)
4. Copiez (Cmd/Ctrl + C)
```

### Étape 4: Exécution

```
1. Retournez à Supabase SQL Editor
2. Collez le code (Cmd/Ctrl + V)
3. Cliquez le bouton "Run" (ou Cmd/Ctrl + Enter)
4. ⏳ Attendre 3-10 secondes...
5. ✅ Vous devriez voir "Query succeeded"
```

### Étape 5: Test

```
1. Retournez à votre app XERA1
2. Appuyez Cmd/Ctrl + F5 (forcer la rafraîchissement)
3. Allez sur un profil d'un autre utilisateur
4. Cliquez le bouton "S'abonner"
5. ✅ Le compteur devrait passer de 0 → 1
6. Rafraîchissez le profil de la personne → elle devrait voir +1 abonné
```

---

## 🩺 Diagnostic: Si ça n'a pas marché

### Pas de changement après le script?

**Étape A**: Vérifier les tables

- Ouvrez Supabase SQL Editor
- Exécutez le fichier `FOLLOWERS-DIAGNOSTIC-QUERIES.sql`
- Regardez les résultats:

| #   | Requête                | Résultat attendu                                       | Si YOU ne voyez PAS ça          |
| --- | ---------------------- | ------------------------------------------------------ | ------------------------------- |
| 1   | Structure followers    | 4 colonnes (id, follower_id, following_id, created_at) | La table est cassée             |
| 2   | followers_count existe | 1 ligne, data_type = INTEGER                           | La colonne est manquante        |
| 3   | Trigger existe         | "followers_count_update"                               | Le trigger est supprimé         |
| 4   | Fonction existe        | "update_followers_count"                               | La fonction est supprimée       |
| 5   | RLS policies           | 3 policies listées                                     | Les policies ont été supprimées |

**Étape B**: Si tout existe mais ça ne fonctionne pas

```
1. Essayez de rafraîchir la cache:
   - Cmd/Ctrl + F5 dans le navigateur (force refresh)
   - Attendez 10 secondes

2. Si toujours 0, exécutez ceci dans Supabase pour tester manuellement:
   - Allez à SQL Editor
   - Collez ce code:
```

```sql
-- Tester manuellement l'insertion d'une relation
-- ⚠️ Remplacez les UUIDs par de vrais IDs d'utilisateurs!

-- D'abord, voir des utilisateurs existants:
SELECT id, name FROM users LIMIT 2;

-- Ensuite, insérez une relation (remplacez les UUID):
INSERT INTO followers (follower_id, following_id)
VALUES (
    'UUID_D_UN_USER',    -- Remplacez par un ID réel
    'UUID_D_UN_AUTRE_USER' -- Remplacez par un ID réel
)
ON CONFLICT DO NOTHING;

-- Vérifiez que le compteur a augmenté:
SELECT followers_count FROM users
WHERE id = 'UUID_D_UN_AUTRE_USER';
```

---

## 🆘 Si rien ne marche

### Contact de support

Le problème pourrait être:

- ❌ Les permissions utilisateur (RLS réstrictif)
- ❌ Une version de Supabase incompatible
- ❌ Une sauvegarde ancienne de la base
- ❌ Un problème réseau temporaire

**Prochaines actions**:

1. Attendez 5 minutes puis réessayez (cache)
2. Essayez dans un **navigateur différent** (pas de cache client)
3. Videz le cache du navigateur (Cmd/Ctrl + Shift + Delete)
4. Redémarrez l'app XERA1 complètement

---

## 📊 Comment ça marche maintenant

Après l'exécution du script:

```
1. User Alice clique "S'abonner" à Bob
   ↓
   INSERT INTO followers (follower_id, following_id)

2. Le trigger se déclenche:
   ↓
   UPDATE users SET followers_count = (SELECT COUNT...)

3. Bob est mis à jour:
   ↓
   Bob.followers_count = 1 (au lieu de 0)

4. Quand Alice visite le profil de Bob:
   ↓
   Elle voit "Bob a 1 abonné" ✅

5. Si Alice se désabonne:
   ↓
   DELETE FROM followers WHERE follower_id = Alice, following_id = Bob

6. Le trigger fait:
   ↓
   UPDATE users SET followers_count = 0 (pour Bob)

7. Le compteur baisse: 1 → 0 ✅
```

---

## 🔑 Points clés à retenir

- ✅ La table `followers` stocke les relations
- ✅ La colonne `followers_count` cache le compteur pour la performance
- ✅ Le TRIGGER synchronise les deux automatiquement
- ✅ Le RLS permet à chacun de suivre les autres mais pas de modifier les comptes
- ✅ Après le script, tout devrait fonctionner

---

**Besoin d'aide?** Consultez les fichiers:

- `FOLLOWERS-COMPLETE-FIX.sql` - Le script de réparation
- `FOLLOWERS-DIAGNOSTIC-QUERIES.sql` - Tests de diagnostic
- `DIAGNOSE-RLS-ISSUE.sql` - Diagnostic détaillé des policies RLS

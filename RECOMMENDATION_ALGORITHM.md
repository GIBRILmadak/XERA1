# 🎯 XERA1 Recommendation Algorithm - Proof of Building

## Vue d'ensemble

Cet algorithme de recommandation est conçu pour **retenir les utilisateurs** en leur proposant toujours le **meilleur contenu**, comme TikTok, YouTube ou Instagram.

### Architecture globale

```
┌─────────────────────────────────────────────────────┐
│         UTILISATEUR - FEED IMMERSIF                 │
│  (js/engagement-tracker.js - Collecte interactions)  │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │  API TRACKING            │
    │  /api/app/interaction    │
    │  /api/app/feed/impression│
    │  /api/app/content-metrics│
    └────────────┬─────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │  DATABASE                │
    │  - user_interactions     │
    │  - content_metrics       │
    │  - user_retention_metrics│
    │  - user_affinity         │
    │  - feed_impressions      │
    └────────────┬─────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │ RECOMMENDATION ENGINE     │
    │ (server/recommendation-  │
    │  engine.js)              │
    │ - Scoring composite      │
    │ - Ranking intelligent    │
    │ - Diversité              │
    └────────────┬─────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │ /api/app/discover/users  │
    │ (Renvoie users ranking)  │
    └────────────┬─────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │  FEED AFFICHAGE          │
    │  (Meilleur contenu)      │
    └──────────────────────────┘
```

---

## 📊 Signaux d'engagement collectés

### 1. **Engagement Score** (40% du score final)

- Views par créateur
- Video completion rate
- Support/tipping count
- Comment engagement

### 2. **Creator Quality** (30% du score)

- Followers count
- Badge status (verified, staff)
- Monetization status
- Plan tier (free/medium/pro)
- Monthly revenue consistency

### 3. **Freshness** (15% du score)

- Dernière mise à jour (decay exponentiel)
- Récent = prioritaire, ancien = baissé

### 4. **Retention Signals** (10% du score)

- Return visitor rate
- Average watch time
- Repeat viewer count
- Subscriber growth

### 5. **Virality Potential** (5% du score)

- Weekly view growth rate
- Engagement velocity (views/hour)
- Share count

---

## 🚀 Étapes d'implémentation

### Étape 1: Créer les tables de base de données

```bash
# Exécute le schéma SQL
psql -U postgres -d xera1 -f sql/engagement-tracking-schema.sql
```

Cela crée:

- ✅ `user_interactions` - Toutes les actions utilisateurs
- ✅ `content_metrics` - Métriques par contenu
- ✅ `user_retention_metrics` - Rétention utilisateur
- ✅ `user_affinity` - Affinité créateur-viewer
- ✅ `engagement_velocity` - Vitesse d'engagement
- ✅ `feed_impressions` - Impressions du feed

### Étape 2: Intégrer l'API tracking dans le serveur

Dans `server/monetization-server.js`, ajouter après l'initialisation d'Express:

```javascript
// Importation déjà faite:
const {
    rankUsersIntelligently,
    fetchUserEngagementStats,
} = require("./recommendation-engine");

// Setup engagement tracking endpoints
const setupEngagementTracking = require("./engagement-tracking-api");
setupEngagementTracking(app, supabase);
```

### Étape 3: Charger le script de tracking côté client

Dans vos fichiers HTML (index.html, stream.html, etc.):

```html
<!-- AVANT </body> -->
<script src="js/engagement-tracker.js"></script>
```

### Étape 4: Tracker les interactions dans le feed

Dans `js/stream-page.js` ou votre gestionnaire de feed:

```javascript
// Quand un utilisateur voit un créateur dans le feed
window.engagementTracker?.trackFeedImpression({
    creatorId: creator.id,
    impressionType: "immersive", // ou "regular" ou "discover"
    position: index + 1,
    recommendationScore: score, // Score du ranking algo
});

// Quand l'utilisateur regarde du contenu
window.engagementTracker?.trackContentMetrics({
    contentId: video.id,
    contentType: "video",
    completionRate: 75, // %
    engagementDuration: 120, // secondes
});

// Quand l'utilisateur like/share/follow
window.engagementTracker?.trackInteraction({
    type: "like", // "view", "like", "share", "follow", "bookmark"
    targetUserId: creator.id,
    contentId: video.id,
    contentType: "video",
    duration: 120,
    metadata: { action: "clicked_like_button" },
});
```

### Étape 5: Utiliser le nouveau feed recommandé

L'endpoint `/api/app/discover/users` utilise automatiquement le nouvel algorithme:

```javascript
// Code existant continue à fonctionner
fetch("/api/app/discover/users")
    .then((r) => r.json())
    .then((data) => {
        // data.data = utilisateurs ranking par algo
        // data.algorithm = "xera1-v2-composite" (nouveau)
        displayFeed(data.data);
    });
```

---

## 🎮 Utilisation dans le feed immersif

### Exemple: Intégration dans stream-page.js

```javascript
// Après charger le feed découverte
async function loadImmersiveFeed() {
    const response = await fetch("/api/app/discover/users");
    const { data: recommendedUsers } = await response.json();

    // Track impressions quand le feed est chargé
    window.engagementTracker?.trackFeedUsers(recommendedUsers, "immersive");

    // Affiche les users
    renderImmersiveFeed(recommendedUsers);
}

// Quand l'utilisateur interagit
function handleCreatorInteraction(creator, action) {
    // Track l'interaction
    window.engagementTracker?.trackInteraction({
        type: action, // "view", "like", "share", etc.
        targetUserId: creator.id,
        duration: 30, // Temps passé
    });

    // Perform action
    performAction(creator, action);
}
```

---

## 📈 Scores composites expliqués

### Score final =

```
(engagement_score × 0.4) +
(creator_quality × 0.3) +
(freshness_score × 0.15) +
(retention_score × 0.1) +
(virality_score × 0.05) +
momentum_bonus +
affinity_adjustment -
diversity_penalty
```

### Exemples de score:

**Créateur A:**

- 500 views, 10 videos = 50 views/video
- 1000 followers, verified badge
- Updated 2 hours ago
- High return visitor rate
- **Score: 78/100** ✅ Très haut priorité

**Créateur B:**

- 50 views, 20 videos = 2.5 views/video
- 100 followers, no badge
- Updated 1 week ago
- Low retention
- **Score: 25/100** ❌ Basse priorité

---

## 🔧 Configuration & Tuning

### Poids de l'algorithme

Modifiez `server/recommendation-engine.js` pour changer les poids:

```javascript
// Ligne ~250 dans calculateCompositeScore()
score += engagementScore * 0.4; // Engagement 40%
score += creatorQuality * 0.3; // Quality 30%
score += freshnessScore * 0.15; // Freshness 15%
score += retentionScore * 0.1; // Retention 10%
score += virialityScore * 0.05; // Virality 5%
```

### Cache TTL

Modifiez `server/monetization-server.js`:

```javascript
// Ligne ~154
const APP_DISCOVER_CACHE_TTL_MS = Math.max(
    5000,
    parseInt(process.env.APP_DISCOVER_CACHE_TTL_MS || "20000", 10) || 20000,
);

// Pour moins de cache (plus de real-time):
// APP_DISCOVER_CACHE_TTL_MS = 5000 // 5 secondes
```

### Randomisation

Modifiez `server/recommendation-engine.js` ligne ~330:

```javascript
randomizationFactor: 0.05; // 5% de variabilité
// Augmentez pour plus de diversité
// Diminuez pour plus de déterminisme
```

---

## 📊 Monitoring & Analytics

### Afficher les stats d'engagement

```javascript
// Récupérer les stats pour un créateur
const stats = await window.engagementTracker?.getEngagementStats(creatorId);
console.log("Stats:", stats);
/*
{
  metrics: {
    return_visitor_rate: 45.5,
    weekly_view_growth: 12.3,
    momentum_score: 250.5,
    ...
  },
  interactions: [
    { interaction_type: "view", count: 150 },
    { interaction_type: "like", count: 45 },
    { interaction_type: "share", count: 12 }
  ]
}
*/
```

### Dashboard creator

Créez une page `analytics.html` pour afficher:

- Views par jour
- Retention rate
- Engagement score
- Follower growth
- Affinity heatmap

---

## 🛡️ Optimisations & Performance

### 1. **Batch tracking**

Les interactions sont groupées par batch de 10 avant d'être envoyées (customizable).

```javascript
const tracker = new XERAEngagementTracker({
    batchSize: 10, // Envoyer par 10
    flushInterval: 30000, // Ou chaque 30s
});
```

### 2. **Caching des scores**

Les scores sont cachés 20 secondes pour réduire les calculs.

### 3. **Lazy loading des stats**

Les stats d'engagement ne sont chargées que quand nécessaires.

### 4. **Indexes Database**

Tous les tables ont les indexes nécessaires pour les queries rapides.

---

## 🚨 Troubleshooting

### Le feed montre les mêmes créateurs

✅ **Solution:** Augmentez `randomizationFactor` dans rankUsersIntelligently()

```javascript
randomizationFactor: 0.1; // 10% au lieu de 5%
```

### Les stats d'engagement sont vides

✅ **Vérifiez:**

- Les tables sont créées: `SELECT * FROM user_interactions;`
- Le tracking script est chargé: Vérifiez console logs
- Auth est configuré: `window.currentUserId` doit exister

### L'API retourne 401

✅ **Vérifiez:**

- Session est active: Allez sur une page protégée
- Credentials mode: Assurez-vous que `credentials: "include"` est utilisé

### Performances dégradées

✅ **Solutions:**

- Augmentez APP_DISCOVER_CACHE_TTL_MS
- Réduisez le nombre de queries: Utilisez les materialized views
- Archive les old interactions (>90 jours)

---

## 📚 API Reference

### POST /api/app/interaction/track

Enregistre une interaction utilisateur.

```bash
curl -X POST http://localhost:5050/api/app/interaction/track \
  -H "Content-Type: application/json" \
  -d '{
    "interaction_type": "like",
    "target_user_id": "uuid-here",
    "content_id": "uuid-optional",
    "content_type": "video",
    "engagement_duration": 120
  }'
```

**Response:**

```json
{
    "success": true,
    "data": { "id": "...", "created_at": "..." }
}
```

### POST /api/app/feed/impression

Enregistre une impression de feed.

```bash
curl -X POST http://localhost:5050/api/app/feed/impression \
  -H "Content-Type: application/json" \
  -d '{
    "creator_id": "uuid-here",
    "impression_type": "immersive",
    "position": 1,
    "recommendation_score": 82.5
  }'
```

### GET /api/app/engagement/stats/:userId

Récupère les stats d'engagement.

```bash
curl http://localhost:5050/api/app/engagement/stats/uuid-here
```

### GET /api/app/discover/users

Récupère les utilisateurs recommandés (nouvel algo).

```bash
curl http://localhost:5050/api/app/discover/users
```

**Response:**

```json
{
  "success": true,
  "data": [
    { "id": "...", "name": "Creator 1", "followers_count": 1000, ... },
    { "id": "...", "name": "Creator 2", "followers_count": 500, ... }
  ],
  "algorithm": "xera1-v2-composite",
  "cached": false
}
```

---

## 🎓 Next Steps

1. **Implement immersive feed integration** - Modifier stream-page.js pour tracker
2. **Add personalization** - Utiliser user_affinity pour adapter par utilisateur
3. **A/B testing** - Comparer ancien vs nouvel algo
4. **Real-time analytics** - Créer dashboard temps réel
5. **MLops** - Entraîner modèles ML sur les données collectées

---

## 📝 Checklist d'implémentation

- [ ] Exécuter sql/engagement-tracking-schema.sql
- [ ] Importer recommendation-engine.js dans monetization-server.js
- [ ] Appeler setupEngagementTracking(app, supabase)
- [ ] Charger js/engagement-tracker.js dans HTML
- [ ] Intégrer trackInteraction() dans feed
- [ ] Intégrer trackFeedImpression() dans feed
- [ ] Intégrer trackContentMetrics() pour videos
- [ ] Tester /api/app/discover/users
- [ ] Vérifier les données dans feed_impressions table
- [ ] Déployer sur Vercel/production

---

## ✨ Avantages

✅ **Rétention:** Users vont rester grâce à meilleur contenu  
✅ **Engagement:** Algorithme favorise contenu de qualité  
✅ **Monetization:** Créateurs premium priorités  
✅ **Scalable:** Architecture optimisée pour performance  
✅ **Real-time:** Données d'engagement temps réel  
✅ **Fair:** Déterministe + randomisation = diversité

---

**Proof of Building: Le meilleur algorithme pour le meilleur feed! 🚀**

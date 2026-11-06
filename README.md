# XΞRA1 (`xera1-platform`)

> **"Traditional social media asks you to look successful. XΞRA1 demands proof of progression."**

![XERA1 Platform Banner](![alt text](image.png))

XΞRA1 est une plateforme **SocialTech** conçue pour les *builders* — ingénieurs, créateurs, indépendants, étudiants et hackers qui construisent activement au lieu de chercher la dopamine des algorithmes traditionnels.

Là où le web social classique valorise le bruit et la perfection artificielle, XΞRA1 récompense la **trajectoire**, la **régularité** et le **travail vérifiable**.

---

## 💡 Le Concept Central

L'écosystème XΞRA1 repose sur trois piliers fondamentaux :

1. **ARCs** : Vos objectifs structurés (e.g., *Lancer un SaaS*, *Master l'ingénierie IA*, *Concevoir un PCB en génie électrique*). Chaque ARC contient un but, des étapes clés et un historique d'exécution.
2. **Traces** : La preuve quotidienne de votre travail. Textes, métriques, extraits de code, visuels ou livrables. Pas de blabla, juste de l'exécution.
3. **Trajectory** : Votre tableau de bord dynamique visualisant votre constance, votre momentum, vos progrès réels et la croissance de vos ARCs au fil du temps.

---

## 🛠 Tech Stack

| Couche | Technologies |
| :--- | :--- |
| **Frontend** | HTML5, CSS3 Moderne, JavaScript (ES6+ Vanilla) |
| **Backend & APIs** | Node.js, Express.js, WebSockets, Web Push API |
| **Base de données & Infra** | Supabase (PostgreSQL / Auth / Realtime), Netlify, Firebase Admin |

---

## 📂 Architecture du Projet

```bash
XERA1/
├── icons/                      # Logos, assets graphiques et SVGs
├── js/                         # Logique applicative Frontend
│   ├── app.js                  # Cœur de l'application & routage client
│   ├── supabase-config.js      # Client & authentification Supabase
│   ├── streaming.js            # Flux live et intégration vidéo
│   ├── monetization.js         # Logique d'abonnement & monétisation
│   ├── creator-dashboard.js    # Métriques créateur & tableaux de bord
│   ├── analytics.js            # Calculs de trajectoire & statistiques
│   ├── messages.js             # Système de messagerie en temps réel
│   ├── notifications.js        # Web Push & alertes contextuelles
│   └── subscription-plans.js   # Gestion des offres et tiers
│
├── css/                        # Feuilles de style
│   ├── style.css               # Design system global & layout
│   ├── monetization.css        # UI de facturation & grilles de prix
│   ├── streaming-analytics.css # Dashboard analytique & composants stream
│   └── login.css               # UI Auth & onboarding
│
├── api/                        # Serverless Functions & Routes API
│   ├── admin/                  # Endpoints d'administration
│   ├── monetization/           # Traitement des paiements & webhooks
│   └── reminders/              # Microservices de relances automatiques
│
├── sql/                        # Schemas, migrations & RLS Supabase
│
├── server/                     # Backend Node.js / Express
│   ├── index.js                # Serveur principal & endpoints REST
│   ├── monetization-server.js  # Serveur dédié aux transactions
│   └── bot-runner.js           # Tâches de fond & bots d'automatisation
│
├── html/                       # Vues et pages principales
│   ├── index.html              # Landing page & Feed principal
│   ├── stream.html             # Interface de live streaming
│   ├── creator-dashboard.html  # Espace de gestion builder/créateur
│   └── monetization.html       # Hub d'abonnement
│
└── manifest.json               # Configuration Progressive Web App (PWA)
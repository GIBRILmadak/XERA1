# XERA1 Retention & Organic Virality Playbook

**Objectif:** augmenter la retention et faire grandir XERA1 sans demander explicitement aux utilisateurs "invite quelqu'un".

**Principe:** XERA1 ne doit pas pousser une invitation. XERA1 doit rendre la progression plus forte quand elle est vue, validee ou rejointe par une autre personne.

**Implementation V1:** `js/arcs.js`, `js/app-supabase.js`, `css/arcs.css`, `server/recommendation-engine.js`, `sql/witness-loop-schema.sql`.

---

## 1. La solution centrale: le Witness Loop

Le mecanisme principal s'appelle **Witness Loop**.

Sur XERA1, chaque ARC peut avoir:

- un **builder**: la personne qui execute;
- un **temoin**: quelqu'un qui suit la progression et valide certains jalons;
- un **co-builder**: quelqu'un qui rejoint l'ARC avec une contribution concrete;
- des **supporters**: personnes qui suivent l'ARC et reviennent aux traces importantes.

L'utilisateur ne voit jamais "invite un ami". Il voit plutot:

- "Choisir un temoin pour ce jalon"
- "Ajouter quelqu'un qui peut verifier cette progression"
- "Partager la carte de preuve"
- "Ouvrir ce jalon a un co-builder"
- "Demander un retour sur cette trace"

Psychologiquement, ce n'est pas du referral. C'est de la responsabilite sociale, de la preuve, et de la collaboration.

---

## 2. Pourquoi ca augmente la retention

La retention vient de trois forces:

1. **Progression visible:** l'utilisateur revient pour ne pas casser la trajectoire de son ARC.
2. **Responsabilite sociale:** quand un temoin suit un ARC, abandonner devient moins invisible.
3. **Retour social utile:** chaque trace peut generer feedback, validation ou opportunite.

La boucle quotidienne devient:

```
Avancer sur un ARC
-> publier une trace
-> recevoir validation / reaction / feedback
-> voir la trajectoire progresser
-> revenir pour le prochain jalon
```

Ce n'est pas un feed qui retient par distraction. C'est une identite publique qui retient par progression.

---

## 3. Pourquoi ca cree de la viralite sans la demander

Chaque utilisateur finit naturellement par faire entrer au moins une personne parce que certaines actions ont plus de valeur avec quelqu'un d'autre:

- un etudiant ajoute un mentor comme temoin;
- un fondateur ajoute un cofondateur ou beta-testeur;
- un createur partage une carte de preuve;
- un developpeur demande une revue sur une trace technique;
- un sportif ajoute un coach ou partenaire d'entrainement;
- un freelance montre une trajectoire a un client potentiel.

Le produit ne dit pas "invite". Le produit cree une situation ou l'utilisateur se dit: "Cette personne doit voir ca."

---

## 4. Les 5 features a construire

### Feature A: Proof Card partageable

Apres une trace importante, XERA1 genere une carte partageable:

- titre de l'ARC;
- jour de progression;
- extrait de la trace;
- progression actuelle;
- badge de momentum;
- lien profond vers l'ARC.

CTA discret:

- "Voir la progression"
- "Suivre cet ARC"
- "Verifier le jalon"

KPI:

- share rate par trace;
- visiteurs externes par carte;
- taux de conversion visiteur -> follow ARC;
- taux de conversion visiteur -> signup.

### Feature B: Temoin de jalon

Quand l'utilisateur cree ou complete un jalon, XERA1 propose:

- "Ajouter un temoin"
- "Demander une validation"
- "Recevoir un retour"

Le temoin recoit un lien qui ouvre directement le jalon. Il peut:

- valider;
- commenter;
- suivre l'ARC;
- creer son propre ARC inspire.

KPI:

- pourcentage d'ARC avec temoin;
- taux de retour J+1/J+7 des builders avec temoin vs sans temoin;
- validations par semaine;
- inscriptions venant d'un lien temoin.

### Feature C: Co-builder slot

Chaque ARC peut afficher des roles ouverts:

- designer;
- developpeur;
- beta tester;
- mentor;
- accountability partner;
- investisseur;
- client test.

Le wording important:

- pas "invite";
- plutot "ouvrir un role", "chercher un co-builder", "demander une expertise".

KPI:

- roles ouverts par ARC;
- demandes de collaboration;
- collaborations acceptees;
- retention des ARC collaboratifs vs solo.

### Feature D: Weekly Trajectory Recap

Chaque semaine, XERA1 genere un recap:

- traces publiees;
- momentum;
- jalons completes;
- meilleure preuve;
- prochaine action.

Le recap doit etre partageable en externe et utile en interne.

KPI:

- open rate du recap;
- share rate du recap;
- retour dans l'app apres recap;
- nouveaux followers par recap partage.

### Feature E: Inspired ARC

Quand un visiteur voit un ARC, il peut cliquer:

- "Demarrer un ARC similaire"
- "Construire ma version"
- "Suivre ce format"

Cela transforme la viralite en creation de contenu, pas seulement en inscription.

KPI:

- ARC crees depuis un ARC existant;
- activation J+1 des utilisateurs inspires;
- taux de premiere trace dans les 24h.

---

## 5. Changements algorithmiques

Le moteur de recommandation doit ajouter un score **social gravity**.

Signaux:

- nombre de temoins actifs;
- validations de jalons;
- collaborations acceptees;
- partages externes qui generent du retour;
- visiteurs qui suivent un ARC apres avoir vu une Proof Card;
- nouveaux ARC inspires par cet ARC.

Formule proposee:

```
final_score =
  current_recommendation_score
  + social_gravity_score * 0.12
  + proof_share_conversion_score * 0.08
```

Important: ne pas booster le spam de partage. Booster uniquement les partages qui produisent une action de qualite: follow, validation, commentaire utile, creation d'ARC, retour J+1.

---

## 6. Donnees a ajouter

Tables recommandees:

### `arc_witnesses`

- `id`
- `arc_id`
- `witness_user_id` nullable
- `witness_email` nullable
- `invited_by`
- `status`: pending, accepted, validated, declined
- `created_at`
- `accepted_at`

### `arc_milestone_validations`

- `id`
- `arc_id`
- `milestone_id`
- `validator_user_id`
- `validation_type`: witnessed, reviewed, approved
- `comment`
- `created_at`

### `proof_cards`

- `id`
- `arc_id`
- `content_id`
- `created_by`
- `slug`
- `view_count`
- `follow_count`
- `signup_count`
- `created_at`

### `arc_inspirations`

- `id`
- `source_arc_id`
- `new_arc_id`
- `created_by`
- `created_at`

---

## 7. Experience utilisateur ideale

### Apres creation d'un ARC

Au lieu de:

> Invite un ami

Afficher:

> Qui peut reconnaitre cette progression quand elle devient reelle?

Actions:

- Ajouter un temoin
- Ouvrir un role
- Continuer seul

### Apres une trace forte

Afficher une Proof Card prete:

> Cette trace est une preuve. Garde-la visible.

Actions:

- Copier le lien
- Partager
- Demander un retour

### Apres un jalon complete

Afficher:

> Ce jalon peut etre valide.

Actions:

- Demander validation
- Ajouter au recap
- Publier la carte de preuve

---

## 8. Plan d'execution en 14 jours

### Jours 1-3: instrumentation

- ajouter les tables de tracking;
- tracker proof_card_view, witness_added, milestone_validation, arc_inspired;
- connecter ces evenements a `js/engagement-tracker.js`.

### Jours 4-7: Proof Cards

- generer une carte pour chaque trace importante;
- ajouter un lien profond public;
- mesurer vues, follows, signups.

### Jours 8-10: Witness Loop

- ajouter temoin sur ARC/jalon;
- creer la page de validation;
- envoyer notification/email sobre.

### Jours 11-12: Inspired ARC

- bouton "Demarrer un ARC similaire";
- pre-remplir titre, categorie, duree, jalons;
- attribution a l'ARC source.

### Jours 13-14: ranking et analytics

- ajouter social_gravity_score;
- creer un dashboard simple;
- lancer A/B test: ARC avec witness prompt vs sans prompt.

---

## 9. Les KPI a suivre

Retention:

- D1, D7, D30;
- traces par utilisateur actif;
- ARC encore actifs apres 7 jours;
- taux de retour apres validation/commentaire;
- retention ARC avec temoin vs sans temoin.

Virality:

- K-factor global;
- proof cards partagees par utilisateur actif;
- visiteurs externes par carte;
- taux visiteur -> follow ARC;
- taux visiteur -> signup;
- nouveaux ARC inspires par ARC source.

Qualite:

- validations legitimes;
- commentaires utiles;
- collaborations acceptees;
- taux de signalement/spam;
- conversion vers createurs actifs, pas seulement comptes crees.

---

## 10. La regle produit a ne jamais casser

XERA1 ne doit pas devenir une machine a spam.

La viralite doit venir de la preuve:

- une trace utile;
- une progression visible;
- une validation reelle;
- une collaboration concrete;
- un ARC qui inspire un autre ARC.

La bonne question produit n'est pas:

> Comment pousser l'utilisateur a inviter?

La bonne question est:

> A quel moment sa progression devient-elle plus forte avec quelqu'un d'autre?

C'est la que XERA1 gagne.

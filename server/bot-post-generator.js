const crypto = require("crypto");

const {
    BOT_VIDEO_PROVIDER = "pexels",
    BOT_VIDEO_API_KEY = "GV89ZHRpcegXAPvv7D5bZOUt3Xo5EXogQ8SWWHSGrIsLJpw8Fe71W954",
    BOT_VIDEO_MAX_DURATION_SECONDS = "30",
    BOT_VIDEO_SEARCH_TIMEOUT_MS = "5000",
} = process.env;

// By default, reuse video provider/key for images as well so bots can fetch
// coherent media (videos + images) from the same provider without extra config.
const BOT_IMAGE_PROVIDER = process.env.BOT_IMAGE_PROVIDER || BOT_VIDEO_PROVIDER;
const BOT_IMAGE_API_KEY = process.env.BOT_IMAGE_API_KEY || BOT_VIDEO_API_KEY;
const BOT_IMAGE_SEARCH_TIMEOUT_MS =
    process.env.BOT_IMAGE_SEARCH_TIMEOUT_MS || BOT_VIDEO_SEARCH_TIMEOUT_MS;

const BOT_STYLES = ["builder", "storyteller", "mentor", "analyst"];

const FALLBACK_TOPICS = [
    "coding",
    "ai",
    "robotics",
    "entrepreneurship",
    "mechanics",
    "music",
    "gaming",
    "cooking",
    "fitness",
    "photography",
    "travel",
    "art",
    "science",
    "writing",
    "gardening",
    "diy",
    "general",
];

const TOPIC_LABELS = {
    robotics: "Robotique",
    ai: "IA",
    diy: "DIY",
    coding: "Code",
    entrepreneurship: "Startup",
    mechanics: "Mecanique",
    music: "Musique",
    gaming: "Gaming",
    cooking: "Cuisine",
    fitness: "Fitness",
    photography: "Photo",
    travel: "Voyage",
    art: "Art",
    science: "Science",
    writing: "Ecriture",
    gardening: "Jardin",
    general: "Projet",
};

const TOPIC_ALIASES = {
    robot: "robotics",
    robots: "robotics",
    robotics: "robotics",
    ia: "ai",
    ai: "ai",
    machinelearning: "ai",
    machine_learning: "ai",
    ml: "ai",
    diy: "diy",
    maker: "diy",
    coding: "coding",
    code: "coding",
    dev: "coding",
    development: "coding",
    entrepreneur: "entrepreneurship",
    entrepreneurship: "entrepreneurship",
    startup: "entrepreneurship",
    business: "entrepreneurship",
    mecanique: "mechanics",
    mechanics: "mechanics",
    music: "music",
    musique: "music",
    gaming: "gaming",
    game: "gaming",
    cooking: "cooking",
    cuisine: "cooking",
    fitness: "fitness",
    sport: "fitness",
    photography: "photography",
    photo: "photography",
    travel: "travel",
    voyage: "travel",
    art: "art",
    science: "science",
    writing: "writing",
    ecriture: "writing",
    gardening: "gardening",
    jardin: "gardening",
    general: "general",
};

const SHARED_HASHTAGS = [
    "#buildinpublic",
    "#xera1",
    "#progression",
    "#consistance",
];

const TOPIC_LIBRARY = {
    robotics: {
        projects: [
            "Atelier Motion",
            "Robot de tri compact",
            "Mini bras atelier",
            "Plateforme mobile V2",
        ],
        activities: [
            "calibration des servomoteurs du bras",
            "integration du capteur ultrason frontal",
            "reglage PID sur la base mobile",
            "test des trajectoires sur le banc",
            "assemblage de la platine de puissance",
            "impression 3D d'un nouveau support camera",
        ],
        results: [
            "les mouvements sont plus fluides sur les petits angles",
            "la marge d'erreur est descendue sur les cycles repetes",
            "la consommation moteur est plus stable",
            "les collisions parasites ont nettement baisse",
            "le robot tient mieux la cadence sur 30 minutes",
            "la precision de prise est montee sur les objets fins",
        ],
        nextSteps: [
            "valider le comportement avec une charge plus lourde",
            "durcir la fixation du poignet",
            "ajouter une alerte thermique sur les drivers",
            "tester un profil d'acceleration plus doux",
            "filmer une session complete de production",
            "passer sur un cycle de tests nocturnes",
        ],
        imageQueries: [
            "robotics,arduino,workshop",
            "robot,prototype,electronics",
            "engineering,robotic,lab",
            "maker,3dprint,robotics",
            "mechanical,robot,assembly",
        ],
        hashtags: [
            "#robotique",
            "#arduino",
            "#maker",
            "#automatisation",
            "#electronique",
            "#prototype",
            "#impression3d",
        ],
    },
    ai: {
        projects: [
            "Lab IA produit",
            "Assistant metier FR",
            "Modele Vision terrain",
            "Pipeline Data Sprint",
        ],
        activities: [
            "nettoyage du jeu de donnees d'entrainement",
            "fine tuning du modele de classement",
            "evaluation du prompt de moderation",
            "optimisation du pipeline d'inference",
            "ajout d'une passe de retrieval sur la base docs",
            "comparaison de deux strategies de chunking",
        ],
        results: [
            "la precision est meilleure sur les cas limites",
            "le temps de reponse moyen a baisse",
            "les faux positifs ont ete reduits",
            "la qualite des reponses longues est plus stable",
            "le modele garde mieux le contexte multi tours",
            "les sorties sont plus coherentes sur le francais",
        ],
        nextSteps: [
            "etendre les tests sur des donnees reelles",
            "ajouter une alerte sur la derive du score",
            "durcir les guardrails sur les prompts sensibles",
            "tester un reranker plus leger",
            "documenter les limites observees",
            "ouvrir une phase de beta interne",
        ],
        imageQueries: [
            "artificial-intelligence,data,computer",
            "machine-learning,code,screen",
            "data-science,workspace,laptop",
            "neural-network,technology,lab",
            "ai,analytics,programming",
        ],
        hashtags: [
            "#ia",
            "#machinelearning",
            "#datascience",
            "#llm",
            "#nlp",
            "#python",
            "#deeplearning",
        ],
    },
    diy: {
        projects: [
            "Atelier recup utile",
            "Maison DIY simple",
            "Serie bricolage malin",
            "Projet maker du week end",
        ],
        activities: [
            "decoupe des panneaux pour la version finale",
            "montage d'une fixation murale sur mesure",
            "poncage et reprise des bords visibles",
            "test d'un gabarit maison pour l'assemblage",
            "upgrade d'un outil avec pieces recuperees",
            "finitions peinture et protection de surface",
        ],
        results: [
            "le rendu est propre et plus solide",
            "le montage est plus rapide a reproduire",
            "la tolerance est meilleure sur les assemblages",
            "le systeme tient bien la charge en usage reel",
            "le cout materiel reste bas pour ce niveau de finition",
            "la version finale est plus compacte",
        ],
        nextSteps: [
            "documenter toutes les mesures dans un mini tuto",
            "tester la durabilite pendant une semaine",
            "adapter le plan a une version encore plus simple",
            "ajouter une option pliable",
            "preparer une liste precise de materiel",
            "filmer la procedure complete en time lapse",
        ],
        imageQueries: [
            "diy,workshop,tools",
            "woodworking,garage,project",
            "handmade,craft,workbench",
            "maker,tools,assembly",
            "home-improvement,drill,wood",
        ],
        hashtags: [
            "#diy",
            "#bricolage",
            "#faitmain",
            "#makers",
            "#upcycling",
            "#atelier",
            "#tuto",
        ],
    },
    coding: {
        projects: [
            "Stack Productif",
            "Refonte plateforme web",
            "Sprint backend API",
            "Journal dev quotidien",
        ],
        activities: [
            "refonte du flow de connexion mail + code",
            "nettoyage du module de notifications",
            "optimisation de la route de recherche",
            "durcissement des validations cote serveur",
            "decoupage du composant front le plus lourd",
            "instrumentation des erreurs critiques en prod",
        ],
        results: [
            "les erreurs de connexion sont mieux expliquees",
            "le temps de chargement initial est plus court",
            "les regressions sont detectees plus tot",
            "le code est plus lisible pour l'equipe",
            "les appels inutiles ont ete elimines",
            "la stabilite en pointe est meilleure",
        ],
        nextSteps: [
            "ajouter des tests e2e sur les cas edge",
            "publier une passe de refactor sur la couche auth",
            "surveiller les logs avec un seuil d'alerte",
            "documenter le comportement en cas d'erreur",
            "aligner le front et le back sur la meme spec",
            "ouvrir une revue technique avec l'equipe",
        ],
        imageQueries: [
            "developer,laptop,code",
            "programming,workspace,monitor",
            "software,engineering,desk",
            "coding,keyboard,screen",
            "web-development,office,computer",
        ],
        hashtags: [
            "#coding",
            "#dev",
            "#javascript",
            "#typescript",
            "#webdev",
            "#backend",
            "#frontend",
        ],
    },
    entrepreneurship: {
        projects: [
            "Startup Sprint",
            "Build & Launch",
            "MVP de terrain",
            "Studio produit",
        ],
        activities: [
            "interviews clients pour valider le besoin",
            "ajustement du pricing sur le plan de base",
            "revision de la proposition de valeur",
            "mise a jour du tunnel d'onboarding",
            "analyse des retours de la cohorte beta",
            "retravail du pitch pour les partenaires",
        ],
        results: [
            "le message est plus clair en premiere visite",
            "la conversion du test gratuit progresse",
            "les objections des utilisateurs sont mieux couvertes",
            "la retention semaine 1 est en hausse",
            "le pipeline commercial est plus qualifie",
            "les retours clients sont plus actionnables",
        ],
        nextSteps: [
            "tester une variante de landing plus directe",
            "relancer les comptes inactifs avec un email cible",
            "prioriser les demandes les plus frequentes",
            "poser des KPI hebdo par segment",
            "formaliser une roadmap produit sur 30 jours",
            "partager le bilan avec l'equipe operationnelle",
        ],
        imageQueries: [
            "startup,team,office",
            "business,planning,laptop",
            "entrepreneur,workspace,notebook",
            "product,meeting,whiteboard",
            "founder,analytics,desk",
        ],
        hashtags: [
            "#startup",
            "#entrepreneur",
            "#mvp",
            "#growth",
            "#saas",
            "#product",
            "#business",
        ],
    },
    mechanics: {
        projects: [
            "Atelier Precision",
            "Diagnostic Garage V3",
            "Serie maintenance pro",
            "Meca du quotidien",
        ],
        activities: [
            "controle du jeu sur la transmission",
            "alignement et reglage du systeme de freinage",
            "diagnostic de vibration sur l'axe principal",
            "reprise d'etancheite sur le bloc",
            "remontage complet du sous ensemble",
            "calage des tolerances en atelier",
        ],
        results: [
            "le fonctionnement est plus souple a froid",
            "la vibration a quasiment disparu",
            "la temperature reste stable en charge",
            "le bruit mecanique est mieux maitrise",
            "la fiabilite est bonne apres plusieurs cycles",
            "le rendement global est en hausse",
        ],
        nextSteps: [
            "passer un test longue duree sous charge",
            "verifier l'usure apres un cycle complet",
            "documenter les couples de serrage utilises",
            "retester apres 100 km de roulage",
            "preparer la prochaine session de maintenance",
            "croiser les mesures avec l'historique atelier",
        ],
        imageQueries: [
            "mechanic,workshop,tools",
            "automotive,garage,repair",
            "engineering,metal,workbench",
            "car,maintenance,mechanic",
            "industrial,assembly,mechanical",
        ],
        hashtags: [
            "#mecanique",
            "#atelier",
            "#maintenance",
            "#diagnostic",
            "#usinage",
            "#automobile",
            "#technique",
        ],
    },
    music: {
        projects: [
            "Session Studio Nuit",
            "EP Maison",
            "Carnet de prod musicale",
            "Live set evolution",
        ],
        activities: [
            "reprise du mix sur la section rythmique",
            "enregistrement d'une nouvelle prise voix",
            "design d'un patch synth plus organique",
            "equilibrage des basses sur le master",
            "edition fine des transitions du morceau",
            "test d'une version live plus energique",
        ],
        results: [
            "le morceau respire mieux dans le bas du spectre",
            "la voix passe mieux sans forcer",
            "la dynamique generale est plus propre",
            "la version live est plus impactante",
            "les details ressortent mieux au casque",
            "le rendu final est plus coherent entre plateformes",
        ],
        nextSteps: [
            "faire une ecoute croisee sur plusieurs enceintes",
            "tourner une courte preview video",
            "verrouiller la version finale du bridge",
            "preparer la cover et la sortie",
            "tester une batterie alternative sur le refrain",
            "ouvrir une session feedback avec 3 auditeurs",
        ],
        imageQueries: [
            "music,studio,mixer",
            "producer,headphones,recording",
            "guitar,piano,session",
            "dj,console,studio",
            "microphone,track,editing",
        ],
        hashtags: [
            "#music",
            "#musique",
            "#producer",
            "#studio",
            "#mixing",
            "#songwriting",
            "#livemusic",
        ],
    },
    gaming: {
        projects: [
            "Road to Master",
            "Build gaming nightly",
            "Journal stream performance",
            "Challenge ranked semaine",
        ],
        activities: [
            "review des rotations sur la map principale",
            "optimisation des reglages de sensibilite",
            "travail du timing sur les engagements",
            "analyse video des matchs perdus",
            "mise a jour de la strat d'equipe",
            "test d'un nouveau setup de stream",
        ],
        results: [
            "les decisions en fin de partie sont plus propres",
            "le ratio d'erreurs en early game a baisse",
            "la communication d'equipe est plus fluide",
            "les performances sont plus regulieres",
            "le niveau mecaniques est plus stable",
            "la qualite stream est meilleure",
        ],
        nextSteps: [
            "enchaîner une session de scrims ciblee",
            "travailler un plan anti rush plus simple",
            "caler un bloc de VOD review quotidien",
            "affiner les calls sur les phases critiques",
            "tester une macro differente sur la map 2",
            "partager les clips de reference avec la team",
        ],
        imageQueries: [
            "gaming,setup,keyboard",
            "esports,monitor,streamer",
            "videogame,controller,desk",
            "pc-gaming,rgb,studio",
            "game,team,tournament",
        ],
        hashtags: [
            "#gaming",
            "#esports",
            "#streamer",
            "#ranked",
            "#pcgaming",
            "#levelup",
            "#gameplay",
        ],
    },
    cooking: {
        projects: [
            "Cuisine Maison Propre",
            "Menu de la semaine",
            "Carnet recettes terrain",
            "Batch cooking efficace",
        ],
        activities: [
            "test d'une nouvelle cuisson basse temperature",
            "preparation des sauces de base de la semaine",
            "ajustement des assaisonnements du plat signature",
            "organisation du batch cooking du dimanche",
            "dressage d'une version plus legere du menu",
            "essai de fermentation courte sur legumes",
        ],
        results: [
            "les textures sont plus regulieres",
            "le gain de temps en semaine est net",
            "les saveurs sont plus equilibrees",
            "la conservation est meilleure",
            "la presentation est plus propre a l'assiette",
            "le cout matiere est mieux controle",
        ],
        nextSteps: [
            "preparer la fiche recette complete",
            "tester une variante vegetarienne",
            "optimiser les portions pour le meal prep",
            "filmer les etapes cle pour la communaute",
            "comparer deux methodes de cuisson sur le meme plat",
            "caler une session de degustation test",
        ],
        imageQueries: [
            "cooking,kitchen,food",
            "chef,meal,preparation",
            "recipe,homemade,plate",
            "food,restaurant,cook",
            "healthy-food,kitchen,ingredients",
        ],
        hashtags: [
            "#cuisine",
            "#cooking",
            "#recette",
            "#mealprep",
            "#foodie",
            "#homemade",
            "#cheflife",
        ],
    },
    fitness: {
        projects: [
            "Bloc training 12 semaines",
            "Routine force et cardio",
            "Journal perf quotidien",
            "Reset condition physique",
        ],
        activities: [
            "seance jambes avec focus technique",
            "bloc cardio fractionne en progression",
            "travail de mobilite sur hanches et dos",
            "session haut du corps orientee volume",
            "reprise du gainage long format",
            "test d'une routine de recuperation active",
        ],
        results: [
            "la posture reste propre jusqu'aux dernieres reps",
            "la recuperation entre sets est meilleure",
            "la frequence cardiaque redescend plus vite",
            "la sensation de puissance est plus nette",
            "la regularite de la semaine est maintenue",
            "les douleurs parasites sont mieux controlees",
        ],
        nextSteps: [
            "augmenter la charge de travail de 5 pourcent",
            "filmer la technique pour auto correction",
            "ajouter une seance cardio courte en plus",
            "surveiller le sommeil pour tenir le rythme",
            "fixer un mini objectif de repetition",
            "preparer un deload intelligent en fin de bloc",
        ],
        imageQueries: [
            "fitness,gym,workout",
            "training,weights,exercise",
            "sport,health,athlete",
            "crossfit,barbell,gym",
            "yoga,mobility,training",
        ],
        hashtags: [
            "#fitness",
            "#workout",
            "#training",
            "#gym",
            "#sport",
            "#fitlife",
            "#motivation",
        ],
    },
    photography: {
        projects: [
            "Journal photo terrain",
            "Serie portrait urbain",
            "Light study project",
            "Street frames weekly",
        ],
        activities: [
            "session portrait en lumiere naturelle",
            "test d'un cadrage plus serre en rue",
            "tri et etalonnage des RAW du week end",
            "essai d'une composition minimaliste",
            "shoot golden hour sur un nouveau spot",
            "travail du noir et blanc contraste doux",
        ],
        results: [
            "les tons de peau sont plus justes",
            "la serie est plus coherente visuellement",
            "les images gagnent en profondeur",
            "le rendu final est plus cinematique",
            "les contrastes sont mieux maitrises",
            "la narration de la serie est plus claire",
        ],
        nextSteps: [
            "imprimer une selection pour revue a froid",
            "tester un autre objectif sur la meme scene",
            "comparer deux workflows de retouche",
            "preparer une mini exposition en ligne",
            "revenir sur le spot avec une meteo differente",
            "monter un carousel avant apres pour la communaute",
        ],
        imageQueries: [
            "photography,camera,portrait",
            "street-photography,city,camera",
            "photographer,editing,studio",
            "landscape,sunset,camera",
            "photo,creative,light",
        ],
        hashtags: [
            "#photography",
            "#photo",
            "#portrait",
            "#streetphotography",
            "#editing",
            "#visualart",
            "#camera",
        ],
    },
    travel: {
        projects: [
            "Carnet de route actif",
            "Road trip journal",
            "Exploration week by week",
            "Guide local progressif",
        ],
        activities: [
            "repere des lieux hors circuit sur la prochaine etape",
            "organisation logistique du trajet de demain",
            "capture d'un lever de soleil sur la route",
            "test d'un itineraire plus court mais plus sauvage",
            "tri des photos et notes de la journee",
            "rencontre locale pour valider les bons plans terrain",
        ],
        results: [
            "le planning est plus souple et realiste",
            "les deplacements coutent moins cher",
            "la journee est mieux equilibree entre route et pause",
            "les spots retenus sont vraiment qualitatifs",
            "le contenu raconte mieux l'experience",
            "les imprévus sont mieux absorbes",
        ],
        nextSteps: [
            "preparer une check list materiel plus compacte",
            "tester un mode de deplacement alternatif",
            "integrer une halte locale recommandee",
            "publier une carte recap de l'etape",
            "filmer le parcours complet en sequence courte",
            "documenter budget et timing de facon transparente",
        ],
        imageQueries: [
            "travel,roadtrip,nature",
            "adventure,mountains,travel",
            "backpacking,landscape,journey",
            "city,travel,street",
            "vacation,explore,outdoor",
        ],
        hashtags: [
            "#travel",
            "#voyage",
            "#roadtrip",
            "#adventure",
            "#explore",
            "#wanderlust",
            "#travelphotography",
        ],
    },
    art: {
        projects: [
            "Serie Art quotidien",
            "Atelier illustration narrative",
            "Concept book progression",
            "Projet couleur et matiere",
        ],
        activities: [
            "croquis de composition pour la prochaine piece",
            "bloc couleur sur la version finale",
            "reprise des valeurs de lumiere sur le personnage",
            "test d'une texture plus organique",
            "iteration sur le line art principal",
            "exploration d'une palette plus chaude",
        ],
        results: [
            "la lecture visuelle est plus immediate",
            "la profondeur de scene fonctionne mieux",
            "les couleurs dialoguent mieux entre elles",
            "le style gagne en identite",
            "la piece est plus coherente dans l'ensemble",
            "le rendu est plus vivant sans perdre la structure",
        ],
        nextSteps: [
            "finaliser les details de premier plan",
            "preparer un time lapse du process",
            "tester une version noir et blanc pour valider les valeurs",
            "poser une couche de finition sur les textures",
            "ouvrir une session critique avec d'autres artistes",
            "produire la variante format affiche",
        ],
        imageQueries: [
            "art,painting,studio",
            "illustration,digital-art,tablet",
            "artist,canvas,creative",
            "drawing,sketchbook,artwork",
            "design,visual-art,workspace",
        ],
        hashtags: [
            "#art",
            "#artist",
            "#illustration",
            "#digitalart",
            "#drawing",
            "#creative",
            "#artwork",
        ],
    },
    science: {
        projects: [
            "Lab Notes ouvert",
            "Mini recherche appliquee",
            "Journal experience terrain",
            "Projet test & mesure",
        ],
        activities: [
            "preparation du protocole de mesure",
            "calibration des instruments du banc d'essai",
            "analyse preliminaire des echantillons",
            "verification de la reproductibilite des resultats",
            "mise a jour du tableau d'observations",
            "comparaison de deux hypotheses concurrentes",
        ],
        results: [
            "les mesures sont plus stables entre runs",
            "l'hypothese principale tient sur les premiers tests",
            "les biais de mesure ont ete reduits",
            "le signal utile ressort plus clairement",
            "la qualite des donnees est meilleure",
            "les anomalies sont mieux tracees",
        ],
        nextSteps: [
            "augmenter la taille d'echantillon pour valider",
            "rejouer le protocole avec un autre parametre",
            "documenter les limites de l'experience",
            "ouvrir une revue par un pair",
            "automatiser la collecte de mesures",
            "preparer une note de synthese courte",
        ],
        imageQueries: [
            "science,laboratory,research",
            "microscope,lab,analysis",
            "physics,experiment,science",
            "chemistry,lab,testing",
            "research,data,lab",
        ],
        hashtags: [
            "#science",
            "#research",
            "#experiment",
            "#stem",
            "#innovation",
            "#analysis",
            "#laboratory",
        ],
    },
    writing: {
        projects: [
            "Carnet d'ecriture continu",
            "Roman en chantier",
            "Newsletter atelier",
            "Serie textes courts",
        ],
        activities: [
            "rewrite du chapitre d'ouverture",
            "construction de l'arc narratif principal",
            "edition ligne par ligne du brouillon",
            "recherche de voix pour le personnage central",
            "travail du rythme sur les transitions",
            "clarification du plan editorial de la semaine",
        ],
        results: [
            "le texte est plus lisible et plus tendu",
            "la progression narrative est plus nette",
            "la voix du narrateur sonne plus juste",
            "les paragraphes respirent mieux",
            "la structure globale est plus solide",
            "les intentions sont plus claires pour le lecteur",
        ],
        nextSteps: [
            "faire une passe complete de coherence",
            "tester une version plus courte de l'introduction",
            "integrer les retours beta lecture",
            "preparer un extrait public pour feedback",
            "verrouiller le plan des trois prochains chapitres",
            "mettre en place une routine de relecture quotidienne",
        ],
        imageQueries: [
            "writing,notebook,laptop",
            "writer,desk,coffee",
            "books,author,workspace",
            "typing,creative-writing,office",
            "journal,pen,paper",
        ],
        hashtags: [
            "#writing",
            "#writer",
            "#storytelling",
            "#creativewriting",
            "#authorlife",
            "#blogging",
            "#draft",
        ],
    },
    gardening: {
        projects: [
            "Potager progression",
            "Jardin urbain patient",
            "Serie culture maison",
            "Cycle semis a recolte",
        ],
        activities: [
            "repiquage des jeunes plants en bacs",
            "ajustement de l'arrosage sur la parcelle sud",
            "taille d'entretien sur les plants les plus vigoureux",
            "preparation d'un nouveau melange de substrat",
            "mise en place du paillage sur les rangs exposes",
            "controle prevention sur les ravageurs",
        ],
        results: [
            "la croissance est plus reguliere",
            "les feuilles restent plus denses",
            "le sol garde mieux l'humidite",
            "les plants montrent moins de stress",
            "la reprise apres repiquage est bonne",
            "la parcelle est plus simple a entretenir",
        ],
        nextSteps: [
            "suivre l'evolution pendant les 5 prochains jours",
            "ajouter un support pour les tiges les plus hautes",
            "tester une rotation de culture differente",
            "documenter les dates de semis et recolte",
            "preparer la prochaine vague de plantations",
            "partager un recap avant apres du mois",
        ],
        imageQueries: [
            "gardening,plants,garden",
            "vegetable-garden,organic,green",
            "flowers,garden,outdoor",
            "urban-garden,plants,soil",
            "horticulture,plant-care,nature",
        ],
        hashtags: [
            "#gardening",
            "#garden",
            "#potager",
            "#plants",
            "#organic",
            "#growyourown",
            "#jardin",
        ],
    },
    general: {
        projects: [
            "Journal de progression",
            "Build quotidien",
            "Projet perso",
            "Routine de creation",
        ],
        activities: [
            "bloc de production sur la tache la plus importante",
            "organisation de la roadmap de la semaine",
            "nettoyage des points bloquants du projet",
            "mise a jour des priorites du sprint",
            "execution d'une session focus sans interruption",
            "revue des resultats et decisions du jour",
        ],
        results: [
            "la progression est claire et mesurable",
            "les prochains objectifs sont mieux definis",
            "le rythme quotidien devient plus stable",
            "les blocages sont leves plus vite",
            "la charge mentale est mieux maitrisee",
            "les actions ont plus d'impact concret",
        ],
        nextSteps: [
            "lancer la prochaine iteration demain matin",
            "consolider ce qui marche dans une checklist",
            "faire une revue complete en fin de semaine",
            "partager un recap transparent avec la communaute",
            "eliminer encore une source de friction",
            "transformer ce test en process reproductible",
        ],
        imageQueries: [
            "workspace,creative,project",
            "desk,laptop,planning",
            "teamwork,office,focus",
            "productivity,work,notebook",
            "build,creator,studio",
        ],
        hashtags: [
            "#buildinpublic",
            "#progression",
            "#focus",
            "#consistance",
            "#objectif",
            "#creation",
            "#dailywork",
        ],
    },
};

function toHashInt(seed, max) {
    if (!Number.isFinite(max) || max <= 0) return 0;
    const hex = crypto
        .createHash("sha1")
        .update(String(seed || "xera1"))
        .digest("hex")
        .slice(0, 8);
    return parseInt(hex, 16) % max;
}

function pickSeeded(arr, seed, fallback = "") {
    if (!Array.isArray(arr) || arr.length === 0) return fallback;
    return arr[toHashInt(seed, arr.length)];
}

function pickUniqueSeeded(arr, count, seed) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const copy = [...arr];
    copy.sort((a, b) => {
        const ah = toHashInt(`${seed}:a:${a}`, 0xffffffff);
        const bh = toHashInt(`${seed}:b:${b}`, 0xffffffff);
        return ah - bh;
    });
    return copy.slice(0, Math.max(0, count));
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseBotMeta(bot) {
    try {
        if (!bot || bot.meta == null) return {};
        if (typeof bot.meta === "object" && !Array.isArray(bot.meta)) {
            return { ...bot.meta };
        }
        return JSON.parse(bot.meta);
    } catch (_error) {
        return {};
    }
}

function normalizeTopic(topic) {
    const raw = String(topic || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "");
    if (!raw) return "general";
    return TOPIC_ALIASES[raw] || "general";
}

function resolveTopic(bot, meta, seed) {
    const rawExplicitTopic = String(meta.topic || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "");
    if (rawExplicitTopic) {
        const mapped = TOPIC_ALIASES[rawExplicitTopic];
        if (mapped) return mapped;
        if (rawExplicitTopic === "general") return "general";
    }

    const topicArrayValue = Array.isArray(meta.topics) ? meta.topics[0] : "";
    const normalizedArrayTopic = normalizeTopic(topicArrayValue);
    if (normalizedArrayTopic && normalizedArrayTopic !== "general") {
        return normalizedArrayTopic;
    }
    if (normalizedArrayTopic === "general" && topicArrayValue) return "general";

    return pickSeeded(FALLBACK_TOPICS, `${seed}:topic`, "general");
}

function resolveStyle(meta, seed) {
    const explicit = String(meta.bot_style || meta.style || "")
        .toLowerCase()
        .trim();
    if (BOT_STYLES.includes(explicit)) return explicit;
    return pickSeeded(BOT_STYLES, `${seed}:style`, "builder");
}

function resolveProjectName(meta, profile, seed) {
    const explicit = String(meta.project_name || meta.project || "").trim();
    if (explicit) return explicit;
    return pickSeeded(profile.projects, `${seed}:project`, "Projet");
}

function buildTitle(style, ctx, attempt) {
    const { projectName, topicLabel, activity, result } = ctx;
    const byStyle = {
        builder: [
            `${projectName}: ${activity}`,
            `${topicLabel} - ${activity}`,
            `Point d'etape: ${activity}`,
            `${activity} termine`,
        ],
        storyteller: [
            `Carnet du jour - ${activity}`,
            `Coulisses de ${projectName}: ${activity}`,
            `${projectName} avance: ${activity}`,
            `Session complete: ${activity}`,
        ],
        mentor: [
            `Retour terrain: ${activity}`,
            `Note utile: ${activity}`,
            `Ce qui a marche aujourd'hui: ${activity}`,
            `Lecon pratique: ${activity}`,
        ],
        analyst: [
            `Test valide - ${activity}`,
            `Mesure du jour: ${activity}`,
            `${projectName} - resultat sur ${activity}`,
            `${topicLabel} check: ${activity}`,
        ],
    };
    const source = byStyle[style] || byStyle.builder;
    const raw = source[attempt % source.length] || source[0] || activity;
    // If a title starts to repeat, we enrich it with result context.
    if (attempt >= source.length) return `${raw} | ${result}`;
    return raw;
}

function buildDescription(style, ctx) {
    const { projectName, activity, result, nextStep } = ctx;
    if (style === "storyteller") {
        return `Session du jour sur ${projectName}: ${activity}. Le changement visible: ${result}. Prochaine etape: ${nextStep}.`;
    }
    if (style === "mentor") {
        return `Point concret sur ${projectName}: ${activity}. Ce qui ressort en pratique: ${result}. A reproduire ensuite: ${nextStep}.`;
    }
    if (style === "analyst") {
        return `Run de validation sur ${projectName}: ${activity}. Observation principale: ${result}. Prochain test prevu: ${nextStep}.`;
    }
    return `Mise a jour sur ${projectName}: ${activity}. Resultat du jour: ${result}. Prochaine etape: ${nextStep}.`;
}

function normalizeHashtag(tag) {
    const compact = String(tag || "")
        .trim()
        .replace(/\s+/g, "");
    if (!compact) return "";
    return compact.startsWith("#") ? compact : `#${compact}`;
}

function buildHashtags(profile, topic, seed) {
    const topicTags = (profile.hashtags || [])
        .map(normalizeHashtag)
        .filter(Boolean);
    const pickedTopicTags = pickUniqueSeeded(
        topicTags,
        3,
        `${seed}:topic-tags`,
    );
    const shared = pickSeeded(SHARED_HASHTAGS, `${seed}:shared-tag`, "#xera1");
    const topicTag = normalizeHashtag(`#${topic}`);
    const tags = [...pickedTopicTags, shared, topicTag]
        .map(normalizeHashtag)
        .filter(Boolean);
    return Array.from(new Set(tags)).slice(0, 4);
}

function buildMediaUrl(profile, seed) {
    const query = pickSeeded(
        profile.imageQueries,
        `${seed}:image-query`,
        "workspace,project,build",
    );
    const uniqueSeed = crypto
        .createHash("sha1")
        .update(`${seed}:${query}`)
        .digest("hex")
        .slice(0, 24);
    return `https://picsum.photos/seed/${uniqueSeed}/1200/800`;
}

function dedupeStrings(values = []) {
    return Array.from(
        new Set(
            values.map((value) => String(value || "").trim()).filter(Boolean),
        ),
    );
}

function toSearchPhrase(value) {
    return String(value || "")
        .replace(/[#|/_,.-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildMediaSearchQueries(profile, topic, context = {}) {
    const topicLabel = TOPIC_LABELS[topic] || TOPIC_LABELS.general;
    const profileQueries = Array.isArray(profile?.imageQueries)
        ? profile.imageQueries.map((query) => toSearchPhrase(query))
        : [];
    const candidates = [
        toSearchPhrase(context.title || ""),
        `${topicLabel} ${context.activity || ""}`.trim(),
        `${topicLabel} ${context.projectName || ""}`.trim(),
        `${topicLabel} ${context.nextStep || ""}`.trim(),
        `${topicLabel} ${context.result || ""}`.trim(),
        `${topicLabel} workspace process`.trim(),
        ...profileQueries,
        topicLabel,
    ];
    return dedupeStrings(candidates).slice(0, 6);
}

function buildVideoSearchQueries(profile, topic, context = {}) {
    return buildMediaSearchQueries(profile, topic, context);
}

function buildFetchTimeout(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timeoutId),
    };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5000) {
    const timer = buildFetchTimeout(timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: timer.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        timer.clear();
    }
}

function pickPreferredVideoFile(video) {
    const files = Array.isArray(video?.video_files) ? video.video_files : [];
    const mp4Files = files.filter(
        (file) =>
            file &&
            String(file.file_type || "").toLowerCase() === "video/mp4" &&
            file.link,
    );
    if (mp4Files.length === 0) return null;
    const ranked = [...mp4Files].sort((a, b) => {
        const aScore =
            Math.abs((Number(a.width) || 0) - 1080) +
            Math.abs((Number(a.height) || 0) - 1920);
        const bScore =
            Math.abs((Number(b.width) || 0) - 1080) +
            Math.abs((Number(b.height) || 0) - 1920);
        return aScore - bScore;
    });
    return ranked[0] || null;
}

function normalizeRemoteVideoCandidate(video) {
    const file = pickPreferredVideoFile(video);
    const maxDurationSeconds = Number(BOT_VIDEO_MAX_DURATION_SECONDS) || 30;
    const durationSeconds = Number(video?.duration) || 0;
    if (
        !file?.link ||
        !durationSeconds ||
        durationSeconds > maxDurationSeconds
    ) {
        return null;
    }
    return {
        type: "video",
        mediaUrl: String(file.link),
        mediaDurationSeconds: durationSeconds,
        mediaSource: BOT_VIDEO_PROVIDER,
        mediaLabel: `remote-video-${video?.id || "unknown"}`,
    };
}

function pickPreferredPhotoUrl(photo) {
    const src = photo?.src || {};
    return (
        src.large2x ||
        src.large ||
        src.original ||
        src.medium ||
        src.small ||
        null
    );
}

function normalizeRemotePhotoCandidate(photo) {
    const url = pickPreferredPhotoUrl(photo);
    if (!url) return null;
    return {
        type: "image",
        mediaUrl: String(url),
        mediaDurationSeconds: null,
        mediaSource: BOT_IMAGE_PROVIDER,
        mediaLabel: `remote-photo-${photo?.id || "unknown"}`,
    };
}

async function findRemotePhotoAsset(profile, topic, seed, options = {}) {
    if (String(BOT_IMAGE_PROVIDER).toLowerCase() !== "pexels") return null;
    if (!String(BOT_IMAGE_API_KEY || "").trim()) return null;

    const recentMediaUrls = new Set(
        Array.isArray(options.recentMediaUrls)
            ? options.recentMediaUrls.filter(Boolean).map(String)
            : [],
    );
    const queries = buildMediaSearchQueries(profile, topic, options.context);
    const timeoutMs = Math.max(
        1000,
        Number(BOT_IMAGE_SEARCH_TIMEOUT_MS) || 5000,
    );

    for (const query of queries) {
        try {
            const payload = await fetchJsonWithTimeout(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`,
                {
                    headers: {
                        Authorization: String(BOT_IMAGE_API_KEY),
                    },
                },
                timeoutMs,
            );
            const candidates = (payload?.photos || [])
                .map(normalizeRemotePhotoCandidate)
                .filter(
                    (candidate) =>
                        candidate &&
                        !recentMediaUrls.has(String(candidate.mediaUrl)),
                );
            if (candidates.length > 0) {
                return pickSeeded(
                    candidates,
                    `${seed}:photo:${query}`,
                    candidates[0],
                );
            }
        } catch (_error) {
            // ignore individual provider errors and fall back to picsum
        }
    }

    return null;
}

async function findRemoteVideoAsset(profile, topic, seed, options = {}) {
    if (String(BOT_VIDEO_PROVIDER).toLowerCase() !== "pexels") return null;
    if (!String(BOT_VIDEO_API_KEY || "").trim()) return null;

    const recentMediaUrls = new Set(
        Array.isArray(options.recentMediaUrls)
            ? options.recentMediaUrls.filter(Boolean).map(String)
            : [],
    );
    const queries = buildVideoSearchQueries(profile, topic, options.context);
    const timeoutMs = Math.max(
        1000,
        Number(BOT_VIDEO_SEARCH_TIMEOUT_MS) || 5000,
    );

    for (const query of queries) {
        try {
            const payload = await fetchJsonWithTimeout(
                `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15`,
                {
                    headers: {
                        Authorization: String(BOT_VIDEO_API_KEY),
                    },
                },
                timeoutMs,
            );
            const candidates = (payload?.videos || [])
                .map(normalizeRemoteVideoCandidate)
                .filter(
                    (candidate) =>
                        candidate &&
                        !recentMediaUrls.has(String(candidate.mediaUrl)),
                );
            if (candidates.length > 0) {
                return pickSeeded(
                    candidates,
                    `${seed}:video:${query}`,
                    candidates[0],
                );
            }
        } catch (_error) {
            // ignore individual provider errors and fall back to image
        }
    }

    return null;
}

async function buildMediaAsset(profile, topic, seed, options = {}) {
    const safeProfile = profile || {};
    const recentMediaUrls = new Set(
        Array.isArray(options.recentMediaUrls)
            ? options.recentMediaUrls.filter(Boolean).map(String)
            : [],
    );
    const roll = getDeterministicRandom(`${seed}:media-roll`, 100);
    const shouldUseVideo = roll < 30;

    if (shouldUseVideo) {
        const remoteVideo = await findRemoteVideoAsset(
            safeProfile,
            topic,
            seed,
            {
                ...options,
                recentMediaUrls: Array.from(recentMediaUrls),
            },
        );
        if (remoteVideo) return remoteVideo;
    }

    const remotePhoto = await findRemotePhotoAsset(safeProfile, topic, seed, {
        ...options,
        recentMediaUrls: Array.from(recentMediaUrls),
    });
    if (remotePhoto) return remotePhoto;

    return {
        type: "image",
        mediaUrl: buildMediaUrl(safeProfile, seed),
        mediaDurationSeconds: null,
        mediaSource: "picsum",
        mediaLabel: "bot-image",
    };
}

async function buildBotPostDraft({
    bot,
    dayKey,
    postIndex = 1,
    recentPosts = [],
    recentMediaUrls = [],
} = {}) {
    const resolvedDay = String(dayKey || new Date().toISOString().slice(0, 10));
    const botId = String(bot?.user_id || bot?.id || bot?.display_name || "bot");
    const baseSeed = `${botId}:${resolvedDay}:${postIndex}`;
    const meta = parseBotMeta(bot);
    const topic = resolveTopic(bot, meta, baseSeed);
    const profile = TOPIC_LIBRARY[topic] || TOPIC_LIBRARY.general;
    const style = resolveStyle(meta, baseSeed);
    const projectName = resolveProjectName(meta, profile, baseSeed);
    const topicLabel = TOPIC_LABELS[topic] || TOPIC_LABELS.general;

    const recentTitleSet = new Set(
        (recentPosts || [])
            .map((row) => normalizeText(row?.title))
            .filter(Boolean),
    );
    const recentDescriptionSet = new Set(
        (recentPosts || [])
            .map((row) => normalizeText(row?.description))
            .filter(Boolean),
    );

    let finalTitle = "";
    let finalDescription = "";
    let chosenActivity = "";
    let chosenResult = "";
    let chosenNextStep = "";
    let chosenSeed = baseSeed;

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const attemptSeed = `${baseSeed}:attempt:${attempt}`;
        const activity = pickSeeded(
            profile.activities,
            `${attemptSeed}:activity`,
            "avancee sur le projet",
        );
        const result = pickSeeded(
            profile.results,
            `${attemptSeed}:result`,
            "la progression est visible",
        );
        const nextStep = pickSeeded(
            profile.nextSteps,
            `${attemptSeed}:next`,
            "continuer l'iteration demain",
        );

        const context = {
            projectName,
            topicLabel,
            activity,
            result,
            nextStep,
        };
        const title = buildTitle(style, context, attempt);
        const description = buildDescription(style, context);

        const normalizedTitle = normalizeText(title);
        const normalizedDescription = normalizeText(description);
        if (
            !recentTitleSet.has(normalizedTitle) &&
            !recentDescriptionSet.has(normalizedDescription)
        ) {
            finalTitle = title;
            finalDescription = description;
            chosenActivity = activity;
            chosenResult = result;
            chosenNextStep = nextStep;
            chosenSeed = attemptSeed;
            break;
        }
    }

    if (!finalTitle || !finalDescription) {
        const fallbackActivity = pickSeeded(
            profile.activities,
            `${baseSeed}:fallback-activity`,
            "avancee sur le projet",
        );
        const fallbackResult = pickSeeded(
            profile.results,
            `${baseSeed}:fallback-result`,
            "les choses avancent dans la bonne direction",
        );
        const fallbackNext = pickSeeded(
            profile.nextSteps,
            `${baseSeed}:fallback-next`,
            "nouvelle iteration prevue demain",
        );
        const context = {
            projectName,
            topicLabel,
            activity: fallbackActivity,
            result: fallbackResult,
            nextStep: fallbackNext,
        };
        finalTitle = `${buildTitle(style, context, 0)} (${resolvedDay})`;
        finalDescription = buildDescription(style, context);
        chosenActivity = fallbackActivity;
        chosenResult = fallbackResult;
        chosenNextStep = fallbackNext;
        chosenSeed = `${baseSeed}:fallback`;
    }

    const mediaAsset = await buildMediaAsset(profile, topic, chosenSeed, {
        recentMediaUrls,
        context: {
            title: finalTitle,
            projectName,
            topicLabel,
            activity: chosenActivity,
            result: chosenResult,
            nextStep: chosenNextStep,
        },
    });

    return {
        topic,
        style,
        projectName,
        activity: chosenActivity,
        result: chosenResult,
        nextStep: chosenNextStep,
        title: finalTitle,
        description: finalDescription,
        hashtags: buildHashtags(profile, topic, chosenSeed),
        mediaType: mediaAsset.type,
        mediaUrl: mediaAsset.mediaUrl,
        mediaDurationSeconds: mediaAsset.mediaDurationSeconds,
        mediaSource: mediaAsset.mediaSource,
        mediaLabel: mediaAsset.mediaLabel,
    };
}

module.exports = {
    buildBotPostDraft,
    normalizeTopic,
    parseBotMeta,
};

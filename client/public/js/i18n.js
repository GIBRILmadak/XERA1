/**
 * XERA1 Internationalization (i18n) Engine
 * Full multilingual support (French/English) with automatic browser detection,
 * instant DOM updates, variable substitution, and persistent preferences.
 */
(() => {
    const PRIMARY_STORAGE_KEY = "app_language";
    const SECONDARY_STORAGE_KEY = "rize_lang";
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

    // Built-in dictionaries for instant, offline, and file:// protocol execution
        const embeddedTranslations = {
        fr: {
          "common": {
                    "save": "Enregistrer",
                    "cancel": "Annuler",
                    "close": "Fermer",
                    "delete": "Supprimer",
                    "edit": "Modifier",
                    "loading": "Chargement...",
                    "saving": "Enregistrement...",
                    "search": "Rechercher",
                    "back": "Retour",
                    "next": "Suivant",
                    "confirm": "Confirmer",
                    "success": "Succès",
                    "error": "Erreur",
                    "warning": "Avertissement",
                    "yes": "Oui",
                    "no": "Non",
                    "copied": "Copié !",
                    "copy": "Copier",
                    "share": "Partager",
                    "view": "Voir",
                    "seeMore": "Voir plus",
                    "showLess": "Voir moins",
                    "none": "Aucun",
                    "all": "Tout",
                    "active": "Actif",
                    "pending": "En attente",
                    "verified": "Vérifié",
                    "unverified": "Non vérifié",
                    "public": "Public",
                    "private": "Privé",
                    "followers": "Abonnés",
                    "following": "Abonnements",
                    "add": "Ajouter",
                    "submit": "Soumettre",
                    "language": "Langue",
                    "start": "Démarrer",
                    "stop": "Arrêter",
                    "refresh": "Actualiser",
                    "retry": "Réessayer",
                    "optional": "Optionnel",
                    "required": "Obligatoire",
                    "total": "Total",
                    "details": "Détails",
                    "status": "Statut",
                    "date": "Date",
                    "time": "Heure",
                    "actions": "Actions"
          },
          "nav": {
                    "discover": "Découvrir",
                    "profile": "Ma Trajectoire",
                    "messages": "Messages",
                    "notifications": "Notifications",
                    "auth": "Connexion / Inscription",
                    "login": "Se connecter",
                    "register": "S'inscrire",
                    "logout": "Se déconnecter",
                    "settings": "Réglages",
                    "creatorDashboard": "Espace Créateur",
                    "subscriptions": "Abonnements & Badges",
                    "liveStream": "Directs / Lives",
                    "analytics": "Analytiques",
                    "documentation": "Documentation",
                    "howItWorks": "Comment ça marche",
                    "home": "Accueil",
                    "backToHome": "Retour à l'accueil",
                    "partnerConsole": "Console Partenaire",
                    "admin": "Administration",
                    "credits": "Crédits",
                    "privacyPolicy": "Confidentialité",
                    "termsOfService": "Conditions d'utilisation"
          },
          "hero": {
                    "eyebrow": "SUIVEZ VOS OBJECTIFS AVEC LES PROJETS",
                    "title": "Transformez votre progression en opportunités.",
                    "lede": "XERA1 est une infrastructure de progression où les builders documentent leur travail, attirent les bonnes audiences (investisseurs, collaborateurs, communauté) et transforment leurs avancées en réputation réelle.",
                    "bullet1": "Créez des projets (plans du début à la fin)",
                    "bullet2": "Publiez vos traces avec preuves, ciblez qui voit votre progression",
                    "bullet3": "Attirez collaborateurs, investisseurs ou soutien financier, et construisez une réputation basée sur l'exécution",
                    "cta": "Lancez votre premier projet",
                    "watchDemo": "Voir la démo 60s",
                    "meta": "Création de projet → mise à jour quotidienne → tableau de bord.",
                    "badge": "Aperçu démo 60s",
                    "footnote": "Essentiels : création projet → mise à jour → dashboard.",
                    "partners": "Nos partenaires",
                    "howItWorks": "Comment ça marche",
                    "seeExamples": "Voir des exemples",
                    "tapForSound": "Appuyez pour le son",
                    "muteSound": "Couper le son",
                    "feedTitle": "Fil de progression XERA1"
          },
          "fataChallenge": {
                    "title": "Challenge partenaire",
                    "subtitle": "Fata × XERA1 Challenger",
                    "status": "À démarrer",
                    "period": "15 sept. → 30 nov. 2026",
                    "goal": "3 étapes clés",
                    "reward": "Certification & bonus XERA1",
                    "step1": "1. Présenter un projet",
                    "step2": "2. Publier une preuve",
                    "step3": "3. Valider un jalon",
                    "connectionRequired": "Compte Fata non connecté",
                    "connectPrompt": "Connectez votre compte pour commencer le challenge.",
                    "pendingBadge": "Attribué après validation des trois étapes."
          },
          "auth": {
                    "welcomeTitle": "Bienvenue sur XERA1",
                    "welcomeSubtitle": "Connectez-vous pour continuer",
                    "tagline": "Documentez l'effort.",
                    "description": "Rejoignez une communauté de builders qui partagent leur progression authentique, sans filtres.",
                    "featureTransparent": "Progression transparente",
                    "featureCommunity": "Communauté authentique",
                    "featureDaily": "Suivi jour par jour",
                    "chooseProfile": "Choisissez votre profil",
                    "profilePersonal": "Personnel",
                    "profileCommunity": "Communauté",
                    "profileEnterprise": "Entreprise",
                    "specifyStatus": "Précisez votre statut",
                    "username": "Nom d'utilisateur",
                    "usernamePlaceholder": "Votre nom d'utilisateur",
                    "email": "Email",
                    "emailPlaceholder": "votre@email.com",
                    "password": "Mot de passe",
                    "passwordPlaceholder": "••••••••",
                    "confirmPassword": "Confirmer le mot de passe",
                    "rememberMe": "Se souvenir de moi",
                    "forgotPassword": "Mot de passe oublié ?",
                    "loginSubmit": "Se connecter",
                    "registerSubmit": "S'inscrire",
                    "noAccount": "Pas encore de compte ?",
                    "hasAccount": "Déjà un compte ?",
                    "createAccountLink": "Créer un compte",
                    "loginLink": "Se connecter",
                    "loginRequired": "Connexion requise",
                    "adminAccessDenied": "Accès refusé. Réservé aux administrateurs.",
                    "verifyAccountPrompt": "Veuillez vérifier votre compte pour continuer."
          },
          "discover": {
                    "title": "En mouvement",
                    "subtitle": "Trajectoires en direct, preuves d'abord.",
                    "searchPlaceholder": "Recherchez des créateurs ou des projets",
                    "filterAll": "Tout",
                    "filterLive": "Lives",
                    "filterVideo": "Vidéos",
                    "filterProjects": "Projets",
                    "filterFollowing": "Suivis",
                    "filterRecent": "Récent",
                    "emptyFeed": "Aucune publication pour le moment",
                    "loadMore": "Charger plus",
                    "publishUpdate": "Publier une mise à jour",
                    "proofOfWork": "Preuve de travail",
                    "milestone": "Jalon",
                    "like": "J'aime",
                    "comment": "Commenter",
                    "repost": "Republier",
                    "shareTrace": "Partager cette trace",
                    "viewTrace": "Voir la trace"
          },
          "profile": {
                    "trajectoryTitle": "Ma Trajectoire",
                    "myTrajectory": "Ma Trajectoire de Builder",
                    "publicTrajectory": "Trajectoire publique",
                    "editProfile": "Modifier le profil",
                    "bio": "Biographie",
                    "addBio": "Ajouter une biographie...",
                    "location": "Localisation",
                    "website": "Site Web",
                    "github": "GitHub",
                    "twitter": "X (Twitter)",
                    "linkedin": "LinkedIn",
                    "createdProjects": "Projets créés",
                    "activeArcs": "Arcs actifs",
                    "totalTraces": "Traces publiées",
                    "totalMilestones": "Jalons atteints",
                    "proofUploaded": "Preuves jointes",
                    "createNewArc": "Créer un ARC / Projet",
                    "addTrace": "Ajouter une trace",
                    "editArc": "Modifier l'ARC",
                    "deleteArc": "Supprimer l'ARC",
                    "arcTitle": "Titre du projet",
                    "arcDescription": "Description du projet",
                    "arcCategory": "Catégorie",
                    "traceTitle": "Titre de la trace",
                    "traceContent": "Qu'avez-vous accompli ?",
                    "proofMedia": "Média de preuve (images, vidéos, liens)",
                    "uploadProof": "Téléverser une preuve",
                    "attachProof": "Joindre un fichier",
                    "milestoneName": "Nom du jalon",
                    "milestoneCompleted": "Jalon validé !",
                    "targetDate": "Date cible",
                    "followersCount": "Abonnés",
                    "followingCount": "Abonnements",
                    "follow": "S'abonner",
                    "unfollow": "Se désabonner",
                    "messageUser": "Envoyer un message",
                    "supportUser": "Soutenir ce builder",
                    "emptyArcs": "Aucun projet/ARC créé pour le moment.",
                    "emptyTraces": "Aucune trace publiée pour l'instant.",
                    "tabsAll": "Aperçu",
                    "tabsArcs": "Projets & Arcs",
                    "tabsTraces": "Traces",
                    "tabsProof": "Preuves",
                    "tabsBadges": "Badges"
          },
          "dashboard": {
                    "controlCenter": "Centre de contrôle",
                    "title": "TABLEAU DE BORD CRÉATEUR",
                    "subtitle": "Suivez les soutiens reçus de votre communauté et gérez vos retraits Mobile Money.",
                    "overview": "Vue d'ensemble",
                    "donations": "Dons & Soutiens",
                    "revenue": "Revenus",
                    "payouts": "Paiements & Retraits",
                    "analytics": "Analytiques",
                    "audience": "Audience",
                    "recentTraces": "Traces récentes",
                    "createArc": "Créer un ARC / Projet",
                    "addTrace": "Ajouter une trace",
                    "totalEarnings": "Gains totaux",
                    "supporters": "Soutiens",
                    "goalProgress": "Objectif de progression",
                    "availableForWithdrawal": "Disponible au retrait",
                    "minWithdrawal": "Retrait minimum: $5.00",
                    "pendingEarnings": "Gains en attente",
                    "payoutMethod": "Portefeuille et retraits",
                    "mobileMoney": "Mobile Money (KPay / M-Pesa / Airtel)",
                    "phoneNumber": "Numéro de téléphone",
                    "withdrawButton": "Demander un retrait",
                    "withdrawSuccess": "Demande de retrait enregistrée avec succès !",
                    "transactionHistory": "Historique des transactions",
                    "noTransactions": "Aucune transaction enregistrée."
          },
          "settings": {
                    "title": "Réglages",
                    "subtitle": "Organisez votre compte, votre profil public et vos préférences depuis un seul espace.",
                    "searchPlaceholder": "Rechercher un réglage, section ou option",
                    "navPreferences": "Préférences",
                    "navPreferencesSub": "Langue, thème, emails",
                    "navAppearance": "Profil",
                    "navAppearanceSub": "Look et mise en page",
                    "navIdentity": "Identité",
                    "navIdentitySub": "Avatar, bannière, bio",
                    "navAccount": "Compte",
                    "navAccountSub": "Rôle Discover",
                    "navVerification": "Vérification",
                    "navVerificationSub": "Badge et statut",
                    "navSocials": "Réseaux",
                    "navSocialsSub": "Liens publics",
                    "navDirectHook": "Direct Hook",
                    "navDirectHookSub": "API & Webhooks",
                    "navPrivacy": "Confidentialité",
                    "navPrivacySub": "Visibilité et messages",
                    "navBlocked": "Blocages",
                    "navBlockedSub": "Utilisateurs bloqués",
                    "navSession": "Session",
                    "navSessionSub": "Sessions actives",
                    "navDanger": "Zone de danger",
                    "navDangerSub": "Suppression de compte",
                    "languageLabel": "Langue de l'interface",
                    "languageHint": "La langue est détectée automatiquement selon votre localisation.",
                    "themeLabel": "Thème",
                    "themeDark": "Mode sombre",
                    "themeLight": "Mode clair",
                    "themeHint": "Choisissez l'affichage qui vous convient.",
                    "emailNotifications": "RECEVOIR DES EMAILS",
                    "emailHint": "Vous pouvez couper ces emails à tout moment.",
                    "deleteAccountTitle": "Supprimer définitivement mon compte",
                    "deleteAccountWarning": "Avertissement : cette action est définitive et irréversible.",
                    "saveChanges": "Enregistrer les modifications",
                    "changesSaved": "Paramètres mis à jour !"
          },
          "messages": {
                    "inboxTitle": "Messagerie",
                    "newConversation": "Nouvelle discussion",
                    "typeMessage": "Écrivez un message...",
                    "send": "Envoyer",
                    "noMessages": "Aucun message pour l'instant",
                    "selectConversation": "Sélectionnez une conversation",
                    "searchConversations": "Rechercher une discussion",
                    "online": "En ligne",
                    "offline": "Hors ligne",
                    "typing": "En train d'écrire..."
          },
          "analytics": {
                    "title": "Analytiques de progression",
                    "subtitle": "Visualisez l'impact de vos traces et la croissance de votre réputation.",
                    "viewsTotal": "Vues totales",
                    "engagementRate": "Taux d'engagement",
                    "trajectoryViews": "Vues de votre trajectoire",
                    "topTraces": "Traces les plus vues",
                    "audienceDemographics": "Répartition de l'audience",
                    "exportData": "Exporter les données",
                    "dateRange": "Période"
          },
          "stream": {
                    "liveTitle": "Direct / Stream",
                    "createStreamTitle": "Créer un Live Stream",
                    "startStream": "Démarrer le direct",
                    "endStream": "Arrêter le direct",
                    "chatTitle": "Chat en direct",
                    "layoutSimple": "Layout: Simple",
                    "layoutCam": "Caméra seule",
                    "layoutScreen": "Écran seul",
                    "layoutBoth": "Caméra & Écran",
                    "videoSources": "Sources Vidéo",
                    "camera": "Caméra",
                    "screen": "Écran",
                    "selectCamera": "Sélection Caméra",
                    "streamName": "Titre du live stream",
                    "streamDescription": "Description du direct",
                    "startLive": "Lancer le direct",
                    "liveActive": "Direct en cours",
                    "viewers": "Spectateurs",
                    "hostName": "Hôte du direct",
                    "followStreamer": "Suivre le streamer",
                    "supportStreamer": "Soutenir ce direct",
                    "sendChatMessage": "Envoyer un message dans le chat",
                    "chatPlaceholder": "Discussion en direct...",
                    "adminPanel": "Panneau d'administration"
          },
          "monetization": {
                    "plansTitle": "Abonnements & Badges",
                    "plansSubtitle": "Fais passer ton profil au niveau pro.",
                    "planStandard": "Plan Standard",
                    "planMedium": "Plan Medium",
                    "planPro": "Plan Pro",
                    "popular": "Populaire",
                    "perMonth": "/ mois",
                    "perYear": "/ an",
                    "discountYearly": "-20% D'ÉCONOMIE",
                    "promoCode": "Code de réduction (optionnel)",
                    "unlockFeatures": "Ce que tu peux débloquer",
                    "confirmSubscription": "Confirmer l'abonnement",
                    "badgeVerification": "Obtenir un badge de vérification",
                    "supportCreator": "Soutenir ce créateur",
                    "kpayPayment": "Paiement Mobile Money (KPay)",
                    "paymentMethod": "Mode de paiement",
                    "mobileMoneyKpay": "Mobile Money KPay",
                    "enterPhone": "Saisissez votre numéro Mobile Money",
                    "payNow": "Payer maintenant"
          },
          "admin": {
                    "title": "Administration XERA1",
                    "subtitle": "Espace de gestion du système et des autorisations.",
                    "badgeAdminTitle": "Gestion des Badges",
                    "verificationsTitle": "Demandes de vérification",
                    "pendingRequests": "Demandes en attente",
                    "approve": "Approuver",
                    "reject": "Refuser",
                    "userList": "Liste des utilisateurs",
                    "systemLogs": "Journaux système",
                    "botsAdmin": "Gestion des bots"
          },
          "legal": {
                    "cguTitle": "Conditions d'utilisation – XERA1",
                    "privacyTitle": "Politique de confidentialité – XERA1",
                    "summary": "Sommaire",
                    "section1": "1. Objet",
                    "section2": "2. Présentation",
                    "section3": "3. Compte",
                    "section4": "4. Utilisation acceptable",
                    "section5": "5. Proof of Building",
                    "section6": "6. Contenu",
                    "section7": "7. Pages Pro",
                    "section8": "8. Abonnements",
                    "section9": "9. Soutien financier",
                    "section10": "10. Badges",
                    "lastUpdated": "Dernière mise à jour",
                    "contactUs": "Nous contacter"
          },
          "errors": {
                    "networkError": "Erreur de connexion réseau",
                    "loginFailed": "Échec de la connexion. Vérifiez vos identifiants.",
                    "fillFields": "Veuillez remplir tous les champs obligatoires.",
                    "unauthorized": "Vous devez être connecté pour effectuer cette action.",
                    "pageNotFound": "Oups, erreur 404",
                    "pageNotFoundDesc": "La page que vous cherchez n'existe pas ou a été déplacée.",
                    "backHome": "Retour à l'accueil"
          },
          "notifications": {
                    "panelTitle": "Notifications",
                    "markAllRead": "Tout marquer comme lu",
                    "noNotifications": "Aucune notification pour l'instant",
                    "newFollower": "Nouvel abonné",
                    "newComment": "Nouveau commentaire sur votre trace",
                    "newLike": "Quelqu'un a aimé votre mise à jour",
                    "newSupport": "Vous avez reçu un nouveau soutien !"
          },
          "navDiscover": "Découvrir",
          "navProfile": "Ma Trajectoire",
          "navAuth": "Connexion / Inscription",
          "heroEyebrow": "SUIVEZ VOS OBJECTIFS AVEC LES PROJETS",
          "heroTitle": "Transformez votre progression en opportunités.",
          "heroLede": "XERA1 est une infrastructure de progression où les builders documentent leur travail, attirent les bonnes audiences (investisseurs, collaborateurs, communauté) et transforment leurs avancées en réputation réelle.",
          "heroBullet1": "Créez des projets (plans du début à la fin)",
          "heroBullet2": "Publiez vos traces avec preuves, ciblez qui voit votre progression",
          "heroBullet3": "Attirez collaborateurs, investisseurs ou soutien financier, et construisez une réputation basée sur l'exécution",
          "heroCTA": "Lancez votre premier projet",
          "heroWatch": "Voir la démo 60s",
          "heroMeta": "Création de projet → mise à jour quotidienne → tableau de bord.",
          "heroBadge": "Aperçu démo 60s",
          "heroFootnote": "Essentiels : création projet → mise à jour → dashboard.",
          "discoverTitle": "En mouvement",
          "discoverSub": "Trajectoires en direct, preuves d'abord.",
          "searchPlaceholder": "Recherchez des créateurs ou des projets",
          "heroPartners": "Nos partenaires"
},
        en: {
          "common": {
                    "save": "Save",
                    "cancel": "Cancel",
                    "close": "Close",
                    "delete": "Delete",
                    "edit": "Edit",
                    "loading": "Loading...",
                    "saving": "Saving...",
                    "search": "Search",
                    "back": "Back",
                    "next": "Next",
                    "confirm": "Confirm",
                    "success": "Success",
                    "error": "Error",
                    "warning": "Warning",
                    "yes": "Yes",
                    "no": "No",
                    "copied": "Copied!",
                    "copy": "Copy",
                    "share": "Share",
                    "view": "View",
                    "seeMore": "See more",
                    "showLess": "Show less",
                    "none": "None",
                    "all": "All",
                    "active": "Active",
                    "pending": "Pending",
                    "verified": "Verified",
                    "unverified": "Unverified",
                    "public": "Public",
                    "private": "Private",
                    "followers": "Followers",
                    "following": "Following",
                    "add": "Add",
                    "submit": "Submit",
                    "language": "Language",
                    "start": "Start",
                    "stop": "Stop",
                    "refresh": "Refresh",
                    "retry": "Retry",
                    "optional": "Optional",
                    "required": "Required",
                    "total": "Total",
                    "details": "Details",
                    "status": "Status",
                    "date": "Date",
                    "time": "Time",
                    "actions": "Actions"
          },
          "nav": {
                    "discover": "Discover",
                    "profile": "My Trajectory",
                    "messages": "Messages",
                    "notifications": "Notifications",
                    "auth": "Login / Register",
                    "login": "Log In",
                    "register": "Sign Up",
                    "logout": "Log Out",
                    "settings": "Settings",
                    "creatorDashboard": "Creator Space",
                    "subscriptions": "Subscriptions & Badges",
                    "liveStream": "Live Streams",
                    "analytics": "Analytics",
                    "documentation": "Documentation",
                    "howItWorks": "How it works",
                    "home": "Home",
                    "backToHome": "Back to home",
                    "partnerConsole": "Partner Console",
                    "admin": "Administration",
                    "credits": "Credits",
                    "privacyPolicy": "Privacy Policy",
                    "termsOfService": "Terms of Service"
          },
          "hero": {
                    "eyebrow": "TRACK YOUR GOALS WITH PROJECTS",
                    "title": "Turn your progress into opportunities.",
                    "lede": "XERA1 is a progression infrastructure where builders document their work, attract the right audiences (investors, collaborators, community) and transform their progress into real reputation.",
                    "bullet1": "Create projects (plans from start to finish)",
                    "bullet2": "Publish your traces with proof, target who sees your progress",
                    "bullet3": "Attract collaborators, investors or financial support, and build a reputation based on execution",
                    "cta": "Start your first project",
                    "watchDemo": "Watch 60s demo",
                    "meta": "Project creation → trace logging → dashboard.",
                    "badge": "60s demo preview",
                    "footnote": "Essentials: project creation → trace logging → dashboard.",
                    "partners": "Our partners",
                    "howItWorks": "How it works",
                    "seeExamples": "See examples",
                    "tapForSound": "Tap for sound",
                    "muteSound": "Mute sound",
                    "feedTitle": "XERA1 Progress Feed"
          },
          "fataChallenge": {
                    "title": "Partner Challenge",
                    "subtitle": "Fata × XERA1 Challenger",
                    "status": "To start",
                    "period": "Sept 15 → Nov 30, 2026",
                    "goal": "3 key milestones",
                    "reward": "Certification & XERA1 bonus",
                    "step1": "1. Present a project",
                    "step2": "2. Publish a proof",
                    "step3": "3. Validate a milestone",
                    "connectionRequired": "Fata account not connected",
                    "connectPrompt": "Connect your account to start the challenge.",
                    "pendingBadge": "Awarded upon validation of all three steps."
          },
          "auth": {
                    "welcomeTitle": "Welcome to XERA1",
                    "welcomeSubtitle": "Log in to continue",
                    "tagline": "Document the effort.",
                    "description": "Join a community of builders sharing their authentic progress, without filters.",
                    "featureTransparent": "Transparent progress",
                    "featureCommunity": "Authentic community",
                    "featureDaily": "Daily tracking",
                    "chooseProfile": "Choose your profile",
                    "profilePersonal": "Personal",
                    "profileCommunity": "Community",
                    "profileEnterprise": "Enterprise",
                    "specifyStatus": "Specify your status",
                    "username": "Username",
                    "usernamePlaceholder": "Your username",
                    "email": "Email",
                    "emailPlaceholder": "your@email.com",
                    "password": "Password",
                    "passwordPlaceholder": "••••••••",
                    "confirmPassword": "Confirm password",
                    "rememberMe": "Remember me",
                    "forgotPassword": "Forgot password?",
                    "loginSubmit": "Log In",
                    "registerSubmit": "Sign Up",
                    "noAccount": "Don't have an account?",
                    "hasAccount": "Already have an account?",
                    "createAccountLink": "Create an account",
                    "loginLink": "Log In",
                    "loginRequired": "Login required",
                    "adminAccessDenied": "Access denied. Reserved for administrators.",
                    "verifyAccountPrompt": "Please verify your account to continue."
          },
          "discover": {
                    "title": "In motion",
                    "subtitle": "Live trajectories, proof first.",
                    "searchPlaceholder": "Search creators or projects",
                    "filterAll": "All",
                    "filterLive": "Lives",
                    "filterVideo": "Videos",
                    "filterProjects": "Projects",
                    "filterFollowing": "Following",
                    "filterRecent": "Recent",
                    "emptyFeed": "No posts yet",
                    "loadMore": "Load more",
                    "publishUpdate": "Publish an update",
                    "proofOfWork": "Proof of work",
                    "milestone": "Milestone",
                    "like": "Like",
                    "comment": "Comment",
                    "repost": "Repost",
                    "shareTrace": "Share this trace",
                    "viewTrace": "View trace"
          },
          "profile": {
                    "trajectoryTitle": "My Trajectory",
                    "myTrajectory": "My Builder Trajectory",
                    "publicTrajectory": "Public Trajectory",
                    "editProfile": "Edit Profile",
                    "bio": "Bio",
                    "addBio": "Add a bio...",
                    "location": "Location",
                    "website": "Website",
                    "github": "GitHub",
                    "twitter": "X (Twitter)",
                    "linkedin": "LinkedIn",
                    "createdProjects": "Projects Created",
                    "activeArcs": "Active Arcs",
                    "totalTraces": "Traces Published",
                    "totalMilestones": "Milestones Reached",
                    "proofUploaded": "Proofs Attached",
                    "createNewArc": "Create ARC / Project",
                    "addTrace": "Add a Trace",
                    "editArc": "Edit ARC",
                    "deleteArc": "Delete ARC",
                    "arcTitle": "Project Title",
                    "arcDescription": "Project Description",
                    "arcCategory": "Category",
                    "traceTitle": "Trace Title",
                    "traceContent": "What did you accomplish?",
                    "proofMedia": "Proof Media (images, videos, links)",
                    "uploadProof": "Upload Proof",
                    "attachProof": "Attach File",
                    "milestoneName": "Milestone Name",
                    "milestoneCompleted": "Milestone Reached!",
                    "targetDate": "Target Date",
                    "followersCount": "Followers",
                    "followingCount": "Following",
                    "follow": "Follow",
                    "unfollow": "Unfollow",
                    "messageUser": "Send Message",
                    "supportUser": "Support this builder",
                    "emptyArcs": "No project/ARC created yet.",
                    "emptyTraces": "No trace published yet.",
                    "tabsAll": "Overview",
                    "tabsArcs": "Projects & Arcs",
                    "tabsTraces": "Traces",
                    "tabsProof": "Proofs",
                    "tabsBadges": "Badges"
          },
          "dashboard": {
                    "controlCenter": "Control Center",
                    "title": "CREATOR DASHBOARD",
                    "subtitle": "Track support received from your community and manage your Mobile Money payouts.",
                    "overview": "Overview",
                    "donations": "Donations & Support",
                    "revenue": "Revenue",
                    "payouts": "Payouts & Withdrawals",
                    "analytics": "Analytics",
                    "audience": "Audience",
                    "recentTraces": "Recent Traces",
                    "createArc": "Create ARC / Project",
                    "addTrace": "Add a Trace",
                    "totalEarnings": "Total Earnings",
                    "supporters": "Supporters",
                    "goalProgress": "Goal Progress",
                    "availableForWithdrawal": "Available for Withdrawal",
                    "minWithdrawal": "Minimum Withdrawal: $5.00",
                    "pendingEarnings": "Pending Earnings",
                    "payoutMethod": "Wallet & Withdrawals",
                    "mobileMoney": "Mobile Money (KPay / M-Pesa / Airtel)",
                    "phoneNumber": "Phone Number",
                    "withdrawButton": "Request Withdrawal",
                    "withdrawSuccess": "Withdrawal request successfully registered!",
                    "transactionHistory": "Transaction History",
                    "noTransactions": "No transaction recorded."
          },
          "settings": {
                    "title": "Settings",
                    "subtitle": "Organize your account, public profile, and preferences in one place.",
                    "searchPlaceholder": "Search a setting, section, or option",
                    "navPreferences": "Preferences",
                    "navPreferencesSub": "Language, theme, emails",
                    "navAppearance": "Profile",
                    "navAppearanceSub": "Look and layout",
                    "navIdentity": "Identity",
                    "navIdentitySub": "Avatar, banner, bio",
                    "navAccount": "Account",
                    "navAccountSub": "Discover role",
                    "navVerification": "Verification",
                    "navVerificationSub": "Badge and status",
                    "navSocials": "Socials",
                    "navSocialsSub": "Public links",
                    "navDirectHook": "Direct Hook",
                    "navDirectHookSub": "API & Webhooks",
                    "navPrivacy": "Privacy",
                    "navPrivacySub": "Visibility & messages",
                    "navBlocked": "Blocked Users",
                    "navBlockedSub": "Blocked users list",
                    "navSession": "Session",
                    "navSessionSub": "Active sessions",
                    "navDanger": "Danger Zone",
                    "navDangerSub": "Account deletion",
                    "languageLabel": "Interface Language",
                    "languageHint": "Language is detected automatically based on your location.",
                    "themeLabel": "Theme",
                    "themeDark": "Dark mode",
                    "themeLight": "Light mode",
                    "themeHint": "Choose the display mode that suits you best.",
                    "emailNotifications": "RECEIVE EMAILS",
                    "emailHint": "You can turn off these emails at any time.",
                    "deleteAccountTitle": "Permanently delete my account",
                    "deleteAccountWarning": "Warning: this action is permanent and irreversible.",
                    "saveChanges": "Save changes",
                    "changesSaved": "Settings updated!"
          },
          "messages": {
                    "inboxTitle": "Messages",
                    "newConversation": "New conversation",
                    "typeMessage": "Type a message...",
                    "send": "Send",
                    "noMessages": "No messages yet",
                    "selectConversation": "Select a conversation",
                    "searchConversations": "Search conversation",
                    "online": "Online",
                    "offline": "Offline",
                    "typing": "Typing..."
          },
          "analytics": {
                    "title": "Progression Analytics",
                    "subtitle": "Visualize the impact of your traces and your growing reputation.",
                    "viewsTotal": "Total Views",
                    "engagementRate": "Engagement Rate",
                    "trajectoryViews": "Trajectory Views",
                    "topTraces": "Top Traces",
                    "audienceDemographics": "Audience Demographics",
                    "exportData": "Export Data",
                    "dateRange": "Time Period"
          },
          "stream": {
                    "liveTitle": "Live Stream",
                    "createStreamTitle": "Create a Live Stream",
                    "startStream": "Start Live Stream",
                    "endStream": "End Live Stream",
                    "chatTitle": "Live Chat",
                    "layoutSimple": "Layout: Simple",
                    "layoutCam": "Camera Only",
                    "layoutScreen": "Screen Only",
                    "layoutBoth": "Camera & Screen",
                    "videoSources": "Video Sources",
                    "camera": "Camera",
                    "screen": "Screen",
                    "selectCamera": "Select Camera",
                    "streamName": "Live Stream Title",
                    "streamDescription": "Stream Description",
                    "startLive": "Go Live",
                    "liveActive": "Live Streaming Active",
                    "viewers": "Viewers",
                    "hostName": "Stream Host",
                    "followStreamer": "Follow Streamer",
                    "supportStreamer": "Support this Stream",
                    "sendChatMessage": "Send a message in chat",
                    "chatPlaceholder": "Live discussion...",
                    "adminPanel": "Admin Panel"
          },
          "monetization": {
                    "plansTitle": "Subscriptions & Badges",
                    "plansSubtitle": "Take your profile to the pro level.",
                    "planStandard": "Standard Plan",
                    "planMedium": "Medium Plan",
                    "planPro": "Pro Plan",
                    "popular": "Popular",
                    "perMonth": "/ month",
                    "perYear": "/ year",
                    "discountYearly": "SAVE 20%",
                    "promoCode": "Discount code (optional)",
                    "unlockFeatures": "What you can unlock",
                    "confirmSubscription": "Confirm Subscription",
                    "badgeVerification": "Get a verification badge",
                    "supportCreator": "Support this creator",
                    "kpayPayment": "Mobile Money Payment (KPay)",
                    "paymentMethod": "Payment Method",
                    "mobileMoneyKpay": "KPay Mobile Money",
                    "enterPhone": "Enter your Mobile Money phone number",
                    "payNow": "Pay Now"
          },
          "admin": {
                    "title": "XERA1 Administration",
                    "subtitle": "System and permission management control panel.",
                    "badgeAdminTitle": "Badge Management",
                    "verificationsTitle": "Verification Requests",
                    "pendingRequests": "Pending Requests",
                    "approve": "Approve",
                    "reject": "Reject",
                    "userList": "User List",
                    "systemLogs": "System Logs",
                    "botsAdmin": "Bot Management"
          },
          "legal": {
                    "cguTitle": "Terms of Service – XERA1",
                    "privacyTitle": "Privacy Policy – XERA1",
                    "summary": "Table of Contents",
                    "section1": "1. Purpose",
                    "section2": "2. Overview",
                    "section3": "3. Account",
                    "section4": "4. Acceptable Use",
                    "section5": "5. Proof of Building",
                    "section6": "6. Content",
                    "section7": "7. Pro Pages",
                    "section8": "8. Subscriptions",
                    "section9": "9. Financial Support",
                    "section10": "10. Badges",
                    "lastUpdated": "Last updated",
                    "contactUs": "Contact Us"
          },
          "errors": {
                    "networkError": "Network connection error",
                    "loginFailed": "Login failed. Please check your credentials.",
                    "fillFields": "Please fill in all required fields.",
                    "unauthorized": "You must be logged in to perform this action.",
                    "pageNotFound": "Oops, 404 Error",
                    "pageNotFoundDesc": "The page you are looking for does not exist or has been moved.",
                    "backHome": "Back to Home"
          },
          "notifications": {
                    "panelTitle": "Notifications",
                    "markAllRead": "Mark all as read",
                    "noNotifications": "No notifications yet",
                    "newFollower": "New follower",
                    "newComment": "New comment on your trace",
                    "newLike": "Someone liked your update",
                    "newSupport": "You received new support!"
          },
          "navDiscover": "Discover",
          "navProfile": "My Trajectory",
          "navAuth": "Login / Register",
          "heroEyebrow": "TRACK YOUR GOALS WITH PROJECTS",
          "heroTitle": "Turn your progress into opportunities.",
          "heroLede": "XERA1 is a progression infrastructure where builders document their work, attract the right audiences (investors, collaborators, community) and transform their progress into real reputation.",
          "heroBullet1": "Create projects (plans from start to finish)",
          "heroBullet2": "Publish your traces with proof, target who sees your progress",
          "heroBullet3": "Attract collaborators, investors or financial support, and build a reputation based on execution",
          "heroCTA": "Start your first project",
          "heroWatch": "Watch 60s demo",
          "heroMeta": "Project creation → trace logging → dashboard.",
          "heroBadge": "60s demo preview",
          "heroFootnote": "Essentials: project creation → trace logging → dashboard.",
          "discoverTitle": "In motion",
          "discoverSub": "Live trajectories, proof first.",
          "searchPlaceholder": "Search creators or projects",
          "heroPartners": "Our partners"
}
    };

    let currentLang = "fr";

    function setCookie(name, value, maxAgeSeconds) {
        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
            value
        )}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
    }

    function getCookie(name) {
        const match = document.cookie
            .split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${encodeURIComponent(name)}=`));
        if (!match) return null;
        return decodeURIComponent(match.split("=")[1]);
    }

    /**
     * Automatic language detection based on requirement:
     * 1. localStorage app_language or rize_lang
     * 2. Browser navigator.language or navigator.languages
     * 3. If starts with 'en', set 'en'. Default: 'fr'
     */
    function detectLanguage() {
        // Preference check
        const storedAppLang = localStorage.getItem(PRIMARY_STORAGE_KEY);
        if (storedAppLang) return storedAppLang.startsWith("en") ? "en" : "fr";

        const storedRizeLang = localStorage.getItem(SECONDARY_STORAGE_KEY) || getCookie(PRIMARY_STORAGE_KEY) || getCookie(SECONDARY_STORAGE_KEY);
        if (storedRizeLang) return storedRizeLang.startsWith("en") ? "en" : "fr";

        // Browser detection
        const navLangs = navigator.languages || [navigator.language || navigator.userLanguage || ""];
        for (const lang of navLangs) {
            if (!lang) continue;
            const lower = lang.toLowerCase();
            if (lower.startsWith("en")) return "en";
            if (lower.startsWith("fr")) return "fr";
        }

        return "fr";
    }

    /**
     * Resolve a nested or flat translation key with variable substitution and fallback
     */
    function translate(key, params = {}, defaultText = null) {
        if (!key) return defaultText || "";

        const getFromDict = (dict, pathKey) => {
            if (!dict) return null;
            // Direct match
            if (dict[pathKey] !== undefined) return dict[pathKey];
            // Nested lookup
            const parts = pathKey.split(".");
            let curr = dict;
            for (const part of parts) {
                if (curr && typeof curr === "object" && curr[part] !== undefined) {
                    curr = curr[part];
                } else {
                    return null;
                }
            }
            return typeof curr === "string" ? curr : null;
        };

        const currentDict = embeddedTranslations[currentLang] || embeddedTranslations.fr;
        let value = getFromDict(currentDict, key);

        // Fallback to FR if missing in EN
        if (value === null && currentLang !== "fr") {
            const fallbackDict = embeddedTranslations.fr;
            value = getFromDict(fallbackDict, key);
        }

        if (value === null) {
            value = defaultText !== null ? defaultText : key;
        }

        // Variable substitution {varName} or { varName }
        if (params && typeof params === "object") {
            Object.keys(params).forEach((paramKey) => {
                const regex = new RegExp(`\\{\\s*${paramKey}\\s*\\}`, "g");
                value = String(value).replace(regex, params[paramKey]);
            });
        }

        return value;
    }

    /**
     * Update DOM elements with translation attributes
     */
    function applyTranslations() {
        document.documentElement.setAttribute("lang", currentLang);

        // Inner text translations
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            let params = {};
            try {
                const paramsAttr = el.getAttribute("data-i18n-params");
                if (paramsAttr) params = JSON.parse(paramsAttr);
            } catch (e) {
                /* ignore invalid params */
            }
            const isHtml = el.hasAttribute("data-i18n-html") || key.endsWith(".html");
            const translated = translate(key, params, el.getAttribute("data-i18n-default") || el.textContent);
            if (translated !== key) {
                if (isHtml) {
                    el.innerHTML = translated;
                } else {
                    el.textContent = translated;
                }
            }
        });

        // Placeholders
        document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            const translated = translate(key, {}, el.getAttribute("placeholder"));
            if (translated !== key) {
                el.setAttribute("placeholder", translated);
            }
        });

        // Titles
        document.querySelectorAll("[data-i18n-title]").forEach((el) => {
            const key = el.getAttribute("data-i18n-title");
            const translated = translate(key, {}, el.getAttribute("title"));
            if (translated !== key) {
                el.setAttribute("title", translated);
            }
        });

        // Aria Labels
        document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
            const key = el.getAttribute("data-i18n-aria");
            const translated = translate(key, {}, el.getAttribute("aria-label"));
            if (translated !== key) {
                el.setAttribute("aria-label", translated);
            }
        });

        // Button Values
        document.querySelectorAll("[data-i18n-value]").forEach((el) => {
            const key = el.getAttribute("data-i18n-value");
            const translated = translate(key, {}, el.getAttribute("value"));
            if (translated !== key) {
                el.setAttribute("value", translated);
            }
        });
    }

    /**
     * Synchronize language controls across the DOM
     */
    function refreshLanguageControls() {
        const selects = document.querySelectorAll("#lang-select, #header-lang-select, .lang-select, .nav-lang-select");
        selects.forEach((select) => {
            if (select && select.value !== currentLang) {
                select.value = currentLang;
            }
        });
    }

    /**
     * Manually change language & persist choice
     */
    function setLanguage(lang) {
        currentLang = lang === "en" ? "en" : "fr";
        localStorage.setItem(PRIMARY_STORAGE_KEY, currentLang);
        localStorage.setItem(SECONDARY_STORAGE_KEY, currentLang);
        setCookie(PRIMARY_STORAGE_KEY, currentLang, COOKIE_MAX_AGE);
        setCookie(SECONDARY_STORAGE_KEY, currentLang, COOKIE_MAX_AGE);

        applyTranslations();
        refreshLanguageControls();

        // Dispatch custom events for dynamic JS listeners
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent("i18n:languageChanged", { detail: { lang: currentLang } }));
            window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
        }
    }

    function init() {
        currentLang = detectLanguage();
        setLanguage(currentLang);

        // Bind language select controls across the document
        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            document.addEventListener("change", (e) => {
                if (
                    e.target &&
                    (e.target.id === "lang-select" ||
                        e.target.id === "header-lang-select" ||
                        e.target.classList.contains("lang-select") ||
                        e.target.classList.contains("nav-lang-select"))
                ) {
                    setLanguage(e.target.value);
                }
            });
        }
    }

    // Attempt optional async dictionary enrichment if locales json is hosted
    async function loadExternalLocales() {
        try {
            const resFr = await fetch("locales/fr.json");
            if (resFr.ok) {
                const dataFr = await resFr.json();
                Object.assign(embeddedTranslations.fr, dataFr);
            }
            const resEn = await fetch("locales/en.json");
            if (resEn.ok) {
                const dataEn = await resEn.json();
                Object.assign(embeddedTranslations.en, dataEn);
            }
            applyTranslations();
        } catch (e) {
            /* Silently fall back to embedded dictionaries */
        }
    }

    // Auto init on DOMReady or immediately if already loaded
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            init();
            loadExternalLocales();
        });
    } else {
        init();
        loadExternalLocales();
    }

    // Global Public API
    window.i18n = {
        t: translate,
        setLanguage,
        getLanguage: () => currentLang,
        applyTranslations,
        refreshControls: refreshLanguageControls,
        translations: embeddedTranslations
    };
    window.t = translate;
    window.setLanguage = setLanguage;
    window.initI18n = init;
    window.refreshLanguageControl = refreshLanguageControls;
})();

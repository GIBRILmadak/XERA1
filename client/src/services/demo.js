/**
 * Mode démonstration (développement uniquement : `VITE_DEMO=1 npm run dev`).
 * Sert à faire les captures d'écran sans compte ni clés Fata. Il n'est jamais
 * actif dans un build de production : `import.meta.env.DEV` vaut false.
 */
export const DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === '1';

const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();
const img = (seed, w = 900, h = 700) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const demoUsers = [
  { id: 'u1', name: 'Amani Kahindo', username: 'amani', avatar: 'https://i.pravatar.cc/160?img=47', title: 'Développeuse mobile · Goma', plan: 'medium', plan_status: 'active', account_type: 'personal', bio: 'Je construis des outils pour les petits commerces du Kivu. Une preuve par jour.', banner: img('xera-banner', 1400, 500), badge: 'verified', account_type: 'personal', followers_count: 1284 },
  { id: 'u2', name: 'Studio Lumbi', username: 'lumbi', avatar: 'https://i.pravatar.cc/160?img=12', title: 'Design produit', bio: 'Studio de design produit à Goma. Nous aidons les bâtisseurs à rendre leurs outils simples à utiliser.', account_type: 'enterprise', badge: 'verified', plan: 'pro', plan_status: 'active', followers_count: 2400 },
  { id: 'u3', name: 'Jonas Mwamba', username: 'jonas', avatar: 'https://i.pravatar.cc/160?img=33', title: 'Hardware & IoT', account_subtype: 'investor' },
  { id: 'u4', name: 'Grace Neema', username: 'grace', avatar: 'https://i.pravatar.cc/160?img=5', title: 'Agritech' },
  { id: 'u5', name: 'Ilunga Tech', username: 'ilunga', avatar: 'https://i.pravatar.cc/160?img=60', title: 'Énergie solaire' },
];
const byId = Object.fromEntries(demoUsers.map((u) => [u.id, u]));

export const demoArcs = [
  { id: 'a1', user_id: 'u1', title: 'Caisse mobile hors-ligne', goal: 'Permettre aux boutiques de vendre sans réseau', description: "Une appli Android qui enregistre les ventes sans connexion et synchronise le soir. Testée avec 6 boutiques à Goma.", status: 'in_progress', stage_level: 'prototype', duration_days: 60, start_date: ago(24 * 21), milestones: [{ title: 'Maquettes validées' }, { title: 'Ventes hors-ligne' }, { title: 'Synchronisation' }, { title: 'Pilote 6 boutiques' }], media_url: img('arc-pos') , users: byId.u1, proofCount: 14, validated: 2 },
  { id: 'a2', user_id: 'u3', title: 'Station météo à 15 $', goal: 'Mesures fiables pour les agriculteurs', description: 'Capteurs ESP32 + panneau solaire, données envoyées par SMS.', status: 'in_progress', stage_level: 'build', milestones: [{ title: 'Prototype' }, { title: 'Boîtier étanche' }, { title: '10 stations' }], media_url: img('arc-meteo'), users: byId.u3, proofCount: 9, validated: 1 },
  { id: 'a3', user_id: 'u4', title: 'Marché du lait en ligne', goal: 'Relier 40 éleveurs aux laiteries', description: 'Commandes WhatsApp + tableau de bord.', status: 'completed', milestones: [{ title: 'Enquête' }, { title: 'MVP' }, { title: '40 éleveurs' }], media_url: img('arc-lait'), users: byId.u4, proofCount: 22, validated: 3 },
];
const arcById = Object.fromEntries(demoArcs.map((a) => [a.id, a]));

export const demoContent = [
  { id: 'c1', user_id: 'u1', arc_id: 'a1', state: 'success', type: 'image', day_number: 21, title: 'Synchronisation qui tient enfin', description: "200 ventes saisies hors-ligne dans la boutique de Maman Furaha, tout est remonté ce soir sans doublon. Le correctif de l'horodatage a marché.", media_url: img('proof-sync'), created_at: ago(2), views: 1840, encouragements: 126, tags: ['android', 'offline'] },
  { id: 'c2', user_id: 'u3', arc_id: 'a2', state: 'failure', type: 'image', day_number: 12, title: "Le boîtier prend l'eau", description: "Premier test sous la pluie : humidité dans le capteur après 40 minutes. Je passe à un joint silicone et à une ventilation par le bas.", media_url: img('proof-rain'), created_at: ago(5), views: 640, encouragements: 58, tags: ['hardware'] },
  { id: 'c3', user_id: 'u2', state: 'pause', type: 'text', day_number: 33, title: 'Pause volontaire cette semaine', description: 'On revoit la direction artistique avec nos premiers clients avant de continuer. Retour lundi avec les nouvelles maquettes.', created_at: ago(9), views: 310, encouragements: 21 },
  { id: 'c4', user_id: 'u4', arc_id: 'a3', state: 'success', type: 'image', day_number: 47, title: '40 éleveurs connectés 🎉', description: 'Objectif atteint deux semaines avant la fin. Merci à la coopérative de Masisi.', media_url: img('proof-milk'), created_at: ago(26), views: 4210, encouragements: 389, tags: ['agritech'] },
  { id: 'c5', user_id: 'u5', state: 'success', type: 'image', day_number: 8, title: 'Premier kit installé', description: "Panneau 100 W et batterie lithium chez une couturière : elle travaille maintenant jusqu'à 21 h.", media_url: img('proof-solar'), created_at: ago(30), views: 980, encouragements: 77 },
].map((c) => ({ ...c, users: byId[c.user_id], arcs: c.arc_id ? arcById[c.arc_id] : null }));

export const demoMe = { ...byId.u1, email: 'amani@example.com' };

export const demoNotifications = [
  { id: 'n1', type: 'encouragement', message: 'Jonas Mwamba a encouragé « Synchronisation qui tient enfin »', created_at: ago(1), read: false, actor: byId.u3 },
  { id: 'n2', type: 'follow', message: 'Grace Neema vous suit maintenant', created_at: ago(4), read: false, actor: byId.u4 },
  { id: 'n3', type: 'fata', message: 'Fata a enregistré votre ARC pour le challenge', created_at: ago(20), read: true },
  { id: 'n4', type: 'milestone', message: 'Studio Lumbi a validé le jalon « Maquettes validées »', created_at: ago(50), read: true, actor: byId.u2 },
];

export const demoInbox = [
  { id: 'd1', other: byId.u2, unreadCount: 2, otherLastReadAt: ago(0.1), lastMessage: { body: 'On peut caler un appel jeudi pour les maquettes ?', sender_id: 'u2', created_at: ago(0.4) } },
  { id: 'd2', other: byId.u3, unreadCount: 0, muted: true, lastMessage: { body: 'Merci pour le conseil sur le joint 👍', sender_id: 'u1', created_at: ago(6) } },
  { id: 'd3', other: byId.u5, unreadCount: 0, lastMessage: { body: 'Tu as utilisé quel régulateur ?', created_at: ago(30) } },
];

export const demoMessages = [
  { id: 'm1', sender_id: 'u2', body: "Salut Amani ! On a vu ta preuve d'hier, super boulot sur la synchro.", created_at: ago(3) },
  { id: 'm2', sender_id: 'u1', body: "Merci ! Ça a été long, l'horodatage me rendait fou 😅", created_at: ago(2.8) },
  { id: 'm3', sender_id: 'u2', body: 'On aimerait te proposer de refaire les écrans de caisse avec toi.', created_at: ago(0.5), edited_at: ago(0.45) },
  { id: 'm5', sender_id: 'u1', body: 'Avec plaisir, jeudi 15 h ça me va.', reply_to_id: 'm3', created_at: ago(0.3) },
  { id: 'm4', sender_id: 'u2', body: 'On peut caler un appel jeudi pour les maquettes ?', created_at: ago(0.4) },
  { id: 'm6', sender_id: 'u2', body: null, deleted_at: ago(0.2), created_at: ago(0.25) },
];

// --- Fata : état modifiable par ?fataDemo=new|linked|progress|done|revoked
function fataScenario() {
  try {
    return new URLSearchParams(window.location.search).get('fataDemo') || 'progress';
  } catch {
    return 'progress';
  }
}

function events(s) {
  const ev = (req, status, extra = {}) => ({ requirement_id: req, status, updated_at: ago(1), created_at: ago(2), challenge_id: 'xera1-test', ...extra });
  if (s === 'progress') return [ev('req_arc', 'delivered', { fata_event_id: 'fata_evt_7Q2' }), ev('req_preuve', 'retry')];
  if (s === 'done') return ['req_arc', 'req_preuve', 'req_jalon'].map((r, i) => ev(r, 'delivered', { fata_event_id: `fata_evt_${i}` }));
  if (s === 'revoked') return [ev('req_arc', 'delivered'), ev('req_preuve', 'failed', { last_error: '403 link_revoked' })];
  return [];
}

export const demoFata = {
  status: async () => {
    const s = fataScenario();
    const connected = s !== 'new';
    return {
      connected,
      challengeId: 'xera1-test',
      linkage: connected ? { preferred_username: 'amani.k', fata_sub: 'fata_9d81c2e04ab7f3', fata_iss: 'https://fata.app/oidc', metadata: { challenge_selections: s === 'linked' ? {} : { 'xera1-test': { arc_id: 'a1' } } } } : null,
      qualification: s === 'done' ? { challenge_id: 'xera1-test', badge_awarded: false, visibility_boost_active: false, visibility_multiplier: 5 } : null,
      celebrationPending: false,
      pendingEvents: events(s),
    };
  },
  start: async () => 'https://fata.app/oidc/authorize?demo=1',
  participate: async () => ({ ok: true }),
  arcs: async () => {
    const s = fataScenario();
    const selected = s === 'linked' ? null : 'a1';
    return {
      selection: selected ? { arc_id: selected, selected_at: ago(30) } : null,
      arcs: [
        { id: 'a1', title: 'Caisse mobile hors-ligne', milestoneCount: 4, eligible: true, selected: selected === 'a1' },
        { id: 'a9', title: 'Blog perso', milestoneCount: 1, eligible: false, selected: false },
      ],
    };
  },
  select: async (arcId) => ({ arc: demoArcs.find((a) => a.id === arcId), delivery: { status: 'delivered' } }),
  sync: async () => ({ pendingEvents: events(fataScenario()) }),
};

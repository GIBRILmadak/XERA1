/**
 * Pages pro XERA1 — même modèle que js/professional-pages.js
 * (professional_pages, page_followers, professional_certifications,
 * professional_cta_leads, contenus author_type PAGE_PRO, validation de preuves).
 */
import { supabase } from './supabase';
import { USER_BADGE_COLUMNS } from './badges';
import { DEMO } from './demo';

export const CERT_TYPES = [
  ['employee', 'Employé'],
  ['student', 'Étudiant'],
  ['partner', 'Partenaire'],
  ['alumni', 'Ancien'],
  ['contractor', 'Prestataire'],
];

export const CTA_OBJECTIVES = [
  ['sales', 'Ventes / contact commercial'],
  ['recruitment', 'Recrutement'],
  ['investment', 'Investissement'],
  ['partnership', 'Partenariat'],
];

export function buildSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const isPhone = (v) => String(v || '').trim().length >= 6 && /^[\d\s()+./-]+$/.test(String(v).trim());

/** Bouton d'action de la page (getProfessionalCta). */
export function pageCta(page) {
  const cta = page?.metadata?.professional_cta || {};
  const dest = String(cta.url || page?.website_url || '').trim();
  const phone = isPhone(dest);
  const url = phone ? `tel:${dest.replace(/[^\d+]/g, '')}` : dest && !/^[a-z][a-z\d+.-]*:/i.test(dest) ? `https://${dest}` : dest;
  return { objective: cta.objective || 'sales', label: cta.label || 'Visiter le site', type: phone ? 'phone' : 'external', url };
}

const DEMO_PAGE = {
  id: 'p1',
  owner_id: 'u2',
  name: 'Studio Lumbi',
  slug: 'studio-lumbi',
  bio: 'Studio de design produit à Goma.',
  description: 'Nous concevons des outils simples pour les commerces et les coopératives de l’Est de la RDC. Nous recrutons des designers et des développeurs mobiles.',
  avatar_url: 'https://i.pravatar.cc/160?img=12',
  banner_url: 'https://picsum.photos/seed/lumbi/1400/500',
  industry: 'Design, Logiciel',
  location: 'Goma, RDC',
  website_url: 'lumbi.studio',
  hiring_needs: ['Design mobile', 'React', 'Figma'],
  is_verified: true,
  metadata: { professional_cta: { label: 'Travailler avec nous', objective: 'partnership' } },
};

export async function getPage(slugOrId) {
  if (DEMO) return DEMO_PAGE;
  const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data } = await supabase.from('professional_pages').select('*').eq(isUuid ? 'id' : 'slug', slugOrId).maybeSingle();
  return data;
}

export async function getMyPages(userId) {
  if (DEMO) return userId === 'u2' ? [DEMO_PAGE] : [];
  const { data } = await supabase.from('professional_pages').select('*').eq('owner_id', userId).order('created_at');
  return data || [];
}

export async function isNameAvailable(name) {
  if (DEMO) return true;
  const { count } = await supabase.from('professional_pages').select('id', { count: 'exact', head: true }).eq('slug', buildSlug(name));
  return (count || 0) === 0;
}

export async function createPage(ownerId, d) {
  const name = d.name.trim();
  const slug = buildSlug(name);
  if (!slug) throw new Error('Nom de page invalide.');
  const payload = {
    owner_id: ownerId,
    name,
    slug,
    bio: d.bio || '',
    description: d.description || '',
    industry: (d.industries || []).join(', ') || null,
    location: d.location || null,
    hiring_needs: d.hiringNeeds || [],
    talent_interests: d.talentInterests || [],
    avatar_url: d.avatarUrl || null,
    banner_url: d.bannerUrl || null,
    website_url: String(d.websiteUrl || '').trim(),
    metadata: { professional_cta: { label: d.ctaLabel || 'Visiter le site', objective: d.ctaObjective || 'sales', url: String(d.ctaUrl || d.websiteUrl || '').trim() } },
  };
  if (DEMO) return { ...DEMO_PAGE, ...payload, id: 'p-new' };
  const { data, error } = await supabase.from('professional_pages').insert(payload).select().single();
  if (error) throw new Error(error.code === '23505' ? 'Ce nom de page est déjà pris.' : error.message);
  return data;
}

export async function updatePage(pageId, updates) {
  if (DEMO) return { ...DEMO_PAGE, ...updates };
  const { data, error } = await supabase.from('professional_pages').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', pageId).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------------- Abonnés de la page

export async function pageFollowState(pageId, userId) {
  if (DEMO) return { following: false, count: 412 };
  const [{ count }, mine] = await Promise.all([
    supabase.from('page_followers').select('id', { count: 'exact', head: true }).eq('page_id', pageId),
    userId ? supabase.from('page_followers').select('id', { count: 'exact', head: true }).eq('page_id', pageId).eq('user_id', userId) : { count: 0 },
  ]);
  return { following: (mine.count || 0) > 0, count: count || 0 };
}

export async function setPageFollow(pageId, userId, on) {
  if (DEMO) return;
  if (on) {
    const { error } = await supabase.from('page_followers').insert({ page_id: pageId, user_id: userId });
    if (error && error.code !== '23505') throw new Error(error.message);
  } else {
    await supabase.from('page_followers').delete().eq('page_id', pageId).eq('user_id', userId);
  }
}

// ---------------- Publications de la page (actualités, événements)

const CONTENT_COLS = `id, user_id, page_id, author_type, type, state, title, description, media_url, metadata, views, encouragements_count, created_at, users(${USER_BADGE_COLUMNS})`;

export async function pagePosts(pageId) {
  if (DEMO) {
    return [
      { id: 'pp1', page_id: pageId, author_type: 'PAGE_PRO', type: 'image', title: 'Nous recrutons 2 designers', description: 'Rejoignez le studio pour concevoir la prochaine génération d’outils pour les commerçants du Kivu.', media_url: 'https://picsum.photos/seed/lumbi-news/900/500', metadata: { sub_type: 'news' }, created_at: new Date(Date.now() - 864e5).toISOString() },
      { id: 'pp2', page_id: pageId, author_type: 'PAGE_PRO', type: 'text', title: 'Atelier design produit', description: 'Deux heures pour apprendre à tester vos maquettes avec de vrais utilisateurs.', metadata: { sub_type: 'event', event_date: '2026-12-12T15:00', location: 'Goma, Impact Hub' }, created_at: new Date(Date.now() - 3 * 864e5).toISOString() },
    ];
  }
  const { data } = await supabase.from('content').select(CONTENT_COLS).eq('page_id', pageId).eq('author_type', 'PAGE_PRO').eq('is_deleted', false).order('created_at', { ascending: false }).limit(40);
  return data || [];
}

export async function createPagePost(page, userId, post) {
  const payload = {
    page_id: page.id,
    user_id: userId,
    author_type: 'PAGE_PRO',
    author_id: page.id,
    type: post.media_url ? 'image' : 'text',
    state: 'success',
    title: post.title.trim(),
    description: post.description.trim(),
    media_url: post.media_url || null,
    media_urls: post.media_url ? [post.media_url] : [],
    metadata: post.kind === 'event' ? { sub_type: 'event', event_date: post.eventDate || null, location: post.location || null } : { sub_type: 'news' },
  };
  if (DEMO) return { id: `pp${Date.now()}`, ...payload, created_at: new Date().toISOString() };
  const { data, error } = await supabase.from('content').insert(payload).select(CONTENT_COLS).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function pageArcs(pageId) {
  if (DEMO) return [];
  const { data } = await supabase.from('arcs').select('id, title, goal, status, milestones, media_url, user_id, page_id').eq('page_id', pageId).order('created_at', { ascending: false });
  return data || [];
}

/** Preuves validées par la page (sceau d'approbation). */
export async function setTraceValidation(contentId, pageId, valid) {
  if (DEMO) return;
  const { error } = await supabase
    .from('content')
    .update(valid ? { is_validated_pro: true, validated_by_page_id: pageId } : { is_validated_pro: false, validated_by_page_id: null })
    .eq('id', contentId);
  if (error) throw new Error(error.message);
}

// ---------------- Équipe certifiée

export async function pageTeam(pageId, { includeInactive = false } = {}) {
  if (DEMO) return [];
  let q = supabase.from('professional_certifications').select(`*, users(${USER_BADGE_COLUMNS}, title)`).eq('page_id', pageId).order('created_at');
  if (!includeInactive) q = q.eq('status', 'active');
  const { data } = await q;
  return data || [];
}

export async function certifyUser(pageId, userId, type, title) {
  const payload = { page_id: pageId, user_id: userId, type, title: title || (type === 'student' ? 'Étudiant' : 'Membre'), status: 'active', start_date: new Date().toISOString().slice(0, 10), metadata: {} };
  if (DEMO) return payload;
  const { data, error } = await supabase.from('professional_certifications').upsert(payload, { onConflict: 'page_id, user_id, type' }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function revokeCertification(certId) {
  if (DEMO) return;
  const { error } = await supabase.from('professional_certifications').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', certId);
  if (error) throw new Error(error.message);
}

export async function userCertifications(userId) {
  if (DEMO) return [];
  const { data } = await supabase.from('professional_certifications').select('*, professional_pages(id, name, slug, avatar_url, is_verified)').eq('user_id', userId).eq('status', 'active');
  return data || [];
}

// ---------------- Prospects (bouton d'action)

export async function submitLead(page, values) {
  if (DEMO) return;
  const { error } = await supabase.from('professional_cta_leads').insert({ page_id: page.id, objective: pageCta(page).objective, name: values.name, company: values.company, email: values.email });
  if (error) throw new Error("Impossible d'envoyer la demande.");
}

export async function pageLeads(pageId) {
  if (DEMO) return [];
  const { data } = await supabase.from('professional_cta_leads').select('*').eq('page_id', pageId).order('created_at', { ascending: false }).limit(100);
  return data || [];
}

// ---------------- Correspondance des profils (scoreUserAgainstPage)

const tokens = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

export const needTokens = (page) => [...new Set((page?.hiring_needs || []).flatMap(tokens))];

export function scoreUserAgainstPage(user, page) {
  const need = needTokens(page);
  if (!user || !need.length) return { score: 0, matched: [], missing: need };
  const profile = new Set(tokens([user.name, user.title, user.bio, user.account_subtype, user.account_type, user.badge].join(' ')));
  const matched = need.filter((t) => profile.has(t));
  const missing = need.filter((t) => !profile.has(t));
  const completeness = (user.title ? 8 : 0) + (user.bio ? 8 : 0);
  return { score: Math.min(100, Math.round((matched.length / need.length) * 84 + completeness)), matched, missing };
}

export async function recommendedProfiles(page, excludeIds = []) {
  if (!needTokens(page).length) return [];
  if (DEMO) return [{ id: 'u1', name: 'Amani Kahindo', avatar: 'https://i.pravatar.cc/160?img=47', title: 'Développeuse mobile React', bio: 'Design mobile et Figma', matchScore: 88 }];
  const { data } = await supabase.from('users').select(`${USER_BADGE_COLUMNS}, title, bio, updated_at`).neq('id', page.owner_id).not('is_bot', 'is', true).order('updated_at', { ascending: false }).limit(200);
  const skip = new Set(excludeIds);
  return (data || [])
    .filter((u) => !skip.has(u.id))
    .map((u) => ({ ...u, matchScore: scoreUserAgainstPage(u, page).score }))
    .filter((u) => u.matchScore > 16)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);
}

export async function searchUsers(term) {
  if (DEMO || !term.trim()) return [];
  const { data } = await supabase.from('users').select(`${USER_BADGE_COLUMNS}, title`).ilike('name', `%${term.trim().replace(/[%_]/g, '')}%`).limit(8);
  return data || [];
}

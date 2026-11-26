/**
 * Accès aux données XERA1 (Supabase). Mêmes tables et mêmes colonnes que
 * l'interface historique, pour que les déclencheurs Fata côté base
 * (arcs, content, arc_milestone_validations) restent la source de vérité.
 */
import { supabase } from './supabase';
import { USER_BADGE_COLUMNS } from './badges';
import {
  DEMO,
  demoArcs,
  demoContent,
  demoMe,
  demoNotifications,
  demoUsers,
} from './demo';

const CONTENT_COLUMNS =
  `id, user_id, author_id, author_type, page_id, arc_id, day_number, type, state, title, description, media_url, media_urls, views, encouragements_count, tags, metadata, created_at, users(${USER_BADGE_COLUMNS}), arcs(id, title, status, user_id)`;

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Fil

export async function fetchFeed({ filter = 'all', limit = 24, userIds } = {}) {
  if (DEMO) {
    await wait();
    return filter === 'all' ? demoContent : demoContent.filter((c) => c.state === filter);
  }
  let query = supabase
    .from('content')
    .select(CONTENT_COLUMNS)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (['success', 'failure', 'pause'].includes(filter)) query = query.eq('state', filter);
  if (userIds?.length) query = query.in('user_id', userIds);
  return unwrap(await query) || [];
}

export async function fetchContent(id) {
  if (DEMO) return demoContent.find((c) => c.id === id) || null;
  return unwrap(await supabase.from('content').select(CONTENT_COLUMNS).eq('id', id).maybeSingle());
}

export async function fetchEncouraged(userId, contentIds) {
  if (DEMO || !userId || !contentIds.length) return new Set();
  const { data } = await supabase
    .from('content_encouragements')
    .select('content_id')
    .eq('user_id', userId)
    .in('content_id', contentIds);
  return new Set((data || []).map((r) => r.content_id));
}

export async function setEncouragement(userId, contentId, on) {
  if (DEMO) return;
  if (on) {
    const { error } = await supabase.from('content_encouragements').insert({ user_id: userId, content_id: contentId });
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await supabase.from('content_encouragements').delete().eq('user_id', userId).eq('content_id', contentId));
  }
}

// ---------------------------------------------------------------- ARC

export function milestoneList(arc) {
  const raw = Array.isArray(arc?.milestones) ? arc.milestones : [];
  return raw
    .map((m) => (typeof m === 'string' ? { title: m } : m))
    .filter((m) => String(m?.title || '').trim());
}

export async function fetchArc(id) {
  if (DEMO) return demoArcs.find((a) => a.id === id) || null;
  return unwrap(
    await supabase.from('arcs').select(`*, users(${USER_BADGE_COLUMNS})`).eq('id', id).maybeSingle(),
  );
}

export async function fetchArcContent(arcId) {
  if (DEMO) return demoContent.filter((c) => c.arc_id === arcId);
  return (
    unwrap(
      await supabase
        .from('content')
        .select(CONTENT_COLUMNS)
        .eq('arc_id', arcId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
    ) || []
  );
}

export async function fetchArcValidations(arcId) {
  if (DEMO) return [{ content_id: 'c1', validation_type: 'self_reported' }];
  const { data } = await supabase
    .from('arc_milestone_validations')
    .select('id, content_id, validator_user_id, validation_type, comment, created_at')
    .eq('arc_id', arcId);
  return data || [];
}

export async function fetchRecentArcs(limit = 12) {
  if (DEMO) return demoArcs;
  const arcs =
    unwrap(
      await supabase
        .from('arcs')
        .select(`id, title, goal, status, milestones, media_url, user_id, created_at, users(${USER_BADGE_COLUMNS})`)
        .is('page_id', null)
        .order('created_at', { ascending: false })
        .limit(limit),
    ) || [];
  return attachValidated(arcs);
}

/** Nombre de jalons validés par leur auteur, pour la barre de progression des cartes ARC. */
async function attachValidated(arcs) {
  if (!arcs.length) return arcs;
  const { data } = await supabase
    .from('arc_milestone_validations')
    .select('arc_id, content_id')
    .eq('validation_type', 'self_reported')
    .in('arc_id', arcs.map((a) => a.id));
  const byArc = {};
  for (const row of data || []) (byArc[row.arc_id] ||= new Set()).add(row.content_id);
  return arcs.map((a) => ({ ...a, validated: byArc[a.id]?.size || 0 }));
}

export async function fetchUserArcs(userId) {
  if (DEMO) return demoArcs.filter((a) => a.user_id === userId);
  const arcs =
    unwrap(
      await supabase
        .from('arcs')
        .select('id, title, goal, description, status, milestones, media_url, stage_level, start_date, duration_days, user_id, page_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ) || [];
  return attachValidated(arcs);
}

export async function createArc(userId, arc) {
  if (DEMO) {
    await wait(500);
    return { id: 'a-new', ...arc };
  }
  const payload = {
    user_id: userId,
    status: 'in_progress',
    title: arc.title.trim(),
    goal: arc.goal?.trim() || null,
    description: arc.description?.trim() || null,
    milestones: arc.milestones.map((title) => ({ title })),
    stage_level: arc.stage_level || null,
    opportunity_intents: [],
    duration_days: arc.duration_days || null,
    start_date: arc.start_date || new Date().toISOString(),
    media_url: arc.media_url || null,
    media_type: arc.media_type || null,
  };
  return unwrap(await supabase.from('arcs').insert([payload]).select('id').single());
}

/**
 * Publie une preuve (ligne `content`). Le déclencheur PostgreSQL crée la tâche
 * d'envoi Fata dans la même transaction (contrat §8).
 */
export async function createProof(userId, proof) {
  if (DEMO) {
    await wait(500);
    return { id: 'c-new', created_at: new Date().toISOString(), ...proof };
  }
  const payload = {
    user_id: userId,
    author_type: 'USER',
    author_id: userId,
    arc_id: proof.arc_id || null,
    day_number: proof.day_number ?? null,
    type: proof.media_type === 'video' ? 'video' : proof.media_url ? 'image' : 'text',
    state: proof.state || 'success',
    title: proof.title.trim(),
    description: proof.description?.trim() || '',
    media_url: proof.media_url || null,
    media_urls: proof.media_url ? [proof.media_url] : [],
  };
  return unwrap(await supabase.from('content').insert(payload).select('id, created_at').single());
}

export async function validateMilestone({ arcId, contentId, validatorId, isOwner, comment }) {
  if (DEMO) {
    await wait(400);
    return { id: 'v-new', created_at: new Date().toISOString() };
  }
  const { data, error } = await supabase
    .from('arc_milestone_validations')
    .insert({
      arc_id: arcId,
      content_id: contentId,
      validator_user_id: validatorId,
      validation_type: isOwner ? 'self_reported' : 'witnessed',
      comment: comment?.trim() || null,
    })
    .select('id, created_at')
    .single();
  if (error?.code === '23505') return { duplicate: true };
  if (error) throw error;
  return data;
}

export async function nextDayNumber(arcId) {
  if (DEMO || !arcId) return null;
  const { data } = await supabase
    .from('content')
    .select('day_number')
    .eq('arc_id', arcId)
    .order('day_number', { ascending: false })
    .limit(1);
  const last = Number(data?.[0]?.day_number);
  return Number.isFinite(last) ? last + 1 : 1;
}

// ---------------------------------------------------------------- Médias

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export async function uploadMedia(userId, file, folder = 'content') {
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new Error('Utilisez une image ou une vidéo.');
  if (file.size > 200 * 1024 * 1024) throw new Error('Fichier trop lourd (200 Mo maximum).');
  if (DEMO) {
    await wait(600);
    return { url: URL.createObjectURL(file), type: isVideo ? 'video' : 'image' };
  }
  const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
  const path = `${folder}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || "Échec de l'envoi du fichier.");
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return { url: data.publicUrl, type: isVideo ? 'video' : 'image' };
}

// ---------------------------------------------------------------- Profils

export async function fetchUser(id) {
  if (DEMO) return demoUsers.find((u) => u.id === id || u.username === id) || null;
  return unwrap(await supabase.from('users').select('*').eq('id', id).maybeSingle());
}

export async function fetchUserContent(userId) {
  if (DEMO) return demoContent.filter((c) => c.user_id === userId);
  return (
    unwrap(
      await supabase
        .from('content')
        .select(CONTENT_COLUMNS)
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(60),
    ) || []
  );
}

export async function fetchFollowCounts(userId) {
  if (DEMO) return { followers: 1284, following: 312 };
  const [a, b] = await Promise.all([
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { followers: a.count || 0, following: b.count || 0 };
}

export async function fetchFollowing(userId) {
  if (DEMO) return ['u2', 'u3'];
  const { data } = await supabase.from('followers').select('following_id').eq('follower_id', userId);
  return (data || []).map((r) => r.following_id);
}

export async function isFollowing(followerId, followingId) {
  if (DEMO) return false;
  const { count } = await supabase
    .from('followers')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  return (count || 0) > 0;
}

export async function setFollow(followerId, followingId, on) {
  if (DEMO) return;
  if (on) {
    const { error } = await supabase.from('followers').insert({ follower_id: followerId, following_id: followingId, created_at: new Date().toISOString() });
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await supabase.from('followers').delete().eq('follower_id', followerId).eq('following_id', followingId));
  }
}

export async function updateProfile(userId, fields) {
  if (DEMO) return { ...demoMe, ...fields };
  return unwrap(
    await supabase.from('users').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', userId).select().single(),
  );
}

/** Chiffres publics de la plateforme pour la page d'accueil. */
export async function fetchPlatformStats() {
  if (DEMO) return { builders: 1840, projects: 612, proofs: 9430 };
  const head = (table, apply = (q) => q) =>
    apply(supabase.from(table).select('id', { count: 'exact', head: true })).then((r) => r.count || 0);
  const [builders, projects, proofs] = await Promise.all([
    head('users', (q) => q.not('is_bot', 'is', true)),
    head('arcs'),
    head('content', (q) => q.eq('is_deleted', false)),
  ]);
  return { builders, projects, proofs };
}

/** Nombre exact de contenus publiés (paliers contributeur). */
export async function countUserContent(userId) {
  if (DEMO) return 24;
  const { count } = await supabase
    .from('content')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_deleted', false);
  return count || 0;
}

// ---------------------------------------------------------------- Recherche

export async function search(term) {
  const q = term.trim();
  if (!q) return { users: [], arcs: [] };
  if (DEMO) {
    const l = q.toLowerCase();
    return {
      users: demoUsers.filter((u) => u.name.toLowerCase().includes(l)),
      arcs: demoArcs.filter((a) => a.title.toLowerCase().includes(l)),
    };
  }
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const [users, arcs] = await Promise.all([
    supabase.from('users').select(`${USER_BADGE_COLUMNS}, title`).ilike('name', like).limit(12),
    supabase.from('arcs').select(`id, title, goal, status, milestones, media_url, user_id, users(${USER_BADGE_COLUMNS})`).ilike('title', like).limit(12),
  ]);
  return { users: users.data || [], arcs: arcs.data || [] };
}

export async function fetchSuggestedUsers(excludeId) {
  if (DEMO) return demoUsers.filter((u) => u.id !== 'u1').slice(0, 4);
  let query = supabase.from('users').select(`${USER_BADGE_COLUMNS}, title`).not('is_bot', 'is', true).order('created_at', { ascending: false }).limit(8);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;
  // Écarte les comptes sans vrai nom (anciens profils « undefined undefined »).
  return (data || []).filter((u) => String(u.name || '').replace(/\b(undefined|null)\b/gi, '').trim());
}

// ---------------------------------------------------------------- Notifications

export async function fetchNotifications(userId) {
  if (DEMO) return demoNotifications;
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);
  return data || [];
}

export async function countUnreadNotifications(userId) {
  if (DEMO) return 2;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  return count || 0;
}

export async function markAllNotificationsRead(userId) {
  if (DEMO) return;
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

// Messagerie : voir services/dm.js
export { fetchInbox, openConversation } from './dm';

export { demoMe };

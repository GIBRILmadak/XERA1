import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Avatar, Badge, Button, EmptyState, Skeleton, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { apiFetch } from '../services/api';
import { SUPER_ADMIN_ID, USER_BADGE_COLUMNS } from '../services/badges';
import { supabase } from '../services/supabase';
import { DEMO } from '../services/demo';
import { timeAgo } from '../lib/format';

const TABS = [
  ['pulse', 'monitoring', 'Vue d’ensemble'],
  ['payments', 'payments', 'Paiements'],
  ['withdrawals', 'account_balance_wallet', 'Retraits'],
  ['codes', 'sell', 'Codes promo'],
  ['partners', 'handshake', 'Partenariats'],
  ['announcements', 'campaign', 'Annonces'],
  ['badges', 'verified', 'Badges'],
  ['moderation', 'gavel', 'Modération'],
  ['bots', 'smart_toy', 'Bots'],
  ['feedback', 'reviews', 'Retours'],
  ['email', 'forward_to_inbox', 'E-mail à tous'],
];

const fmtDate = (v) => (v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const api = (path, opts) => (DEMO ? Promise.resolve({}) : apiFetch(path, opts));

function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setData(await fn());
    } catch (e) {
      setError(e.message);
      setData((d) => d || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, load };
}

function ErrorLine({ error }) {
  return error ? (
    <div className="form-error" style={{ marginBottom: 10 }}>
      <Icon name="error" />
      <span>{error}</span>
    </div>
  ) : null;
}

/** Recherche d'un utilisateur par nom ou identifiant. */
function UserPicker({ onPick, placeholder = 'Nom ou identifiant d’un membre' }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim();
      if (!term || DEMO) return setFound([]);
      const isId = /^[0-9a-f-]{36}$/i.test(term);
      const query = supabase.from('users').select(`${USER_BADGE_COLUMNS}, banned_until, banned_reason`).limit(8);
      const { data } = await (isId ? query.eq('id', term) : query.ilike('name', `%${term.replace(/[%_]/g, '')}%`));
      setFound(data || []);
    }, 280);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="input-wrap">
        <Icon name="person_search" />
        <input className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un membre" />
      </div>
      {found.length > 0 && (
        <div className="list card" style={{ padding: 4 }}>
          {found.map((u) => (
            <button
              key={u.id}
              className="list-item"
              onClick={() => {
                onPick(u);
                setQ('');
                setFound([]);
              }}
            >
              <Avatar user={u} size={32} />
              <UserName user={u} className="title grow" />
              <Icon name="chevron_right" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Onglets

function Pulse() {
  const { data } = useLoad(async () => {
    if (DEMO) return { users: 1840, content: 9430, lives: 1, payments: 3, withdrawals: 2, feedback: 12 };
    const head = (t, f = (q) => q) => f(supabase.from(t).select('id', { count: 'exact', head: true })).then((r) => r.count || 0);
    const [users, content, lives] = await Promise.all([head('users'), head('content', (q) => q.eq('is_deleted', false)), head('streaming_sessions', (q) => q.eq('status', 'live'))]);
    const [p, w] = await Promise.all([apiFetch('/api/admin/subscription-payments?status=pending&limit=50').catch(() => ({})), apiFetch('/api/admin/withdrawal-requests?status=pending,processing&limit=50').catch(() => ({}))]);
    return { users, content, lives, payments: (p.items || p.payments || []).length, withdrawals: (w.items || w.requests || []).length };
  }, []);
  if (!data) return <Skeleton height={120} radius={12} />;
  return (
    <div className="kpi-grid">
      {[
        ['group', 'Membres', data.users],
        ['photo_library', 'Preuves publiées', data.content],
        ['sensors', 'Lives en cours', data.lives],
        ['payments', 'Paiements à valider', data.payments],
        ['account_balance_wallet', 'Retraits à traiter', data.withdrawals],
      ].map(([i, l, v]) => (
        <div key={l} className="kpi">
          <Icon name={i} />
          <strong>{v}</strong>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Payments() {
  const { toast } = useUi();
  const { data, error, load } = useLoad(async () => {
    const r = await api('/api/admin/subscription-payments?status=pending&limit=50');
    return r.items || r.payments || [];
  }, []);
  async function confirm(p) {
    const ref = window.prompt('Référence de transaction (facultatif)') ?? null;
    if (ref === null) return;
    try {
      await api('/api/admin/subscription-payments/confirm', { method: 'POST', body: { payment_id: p.id, transaction_ref_id: ref.trim() || null, operator_ref_id: null, note: null } });
      toast('success', 'Paiement confirmé', 'Le plan est activé.');
      load();
    } catch (e) {
      toast('error', 'Confirmation impossible', e.message);
    }
  }
  async function fail(p) {
    const reason = window.prompt('Motif du refus (facultatif)');
    if (reason === null) return;
    try {
      await api('/api/admin/subscription-payments/fail', { method: 'POST', body: { payment_id: p.id, reason: reason.trim() || null } });
      toast('success', 'Paiement marqué en échec');
      load();
    } catch (e) {
      toast('error', 'Action impossible', e.message);
    }
  }
  return (
    <>
      <ErrorLine error={error} />
      {!data ? (
        <Skeleton height={100} radius={12} />
      ) : data.length === 0 ? (
        <EmptyState art="payment" title="Aucun paiement en attente" />
      ) : (
        <div className="list card" style={{ padding: 6 }}>
          {data.map((p) => (
            <div key={p.id} className="list-item admin-row">
              <Avatar user={p.user || {}} size={36} />
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>
                  {p.user?.name || p.userId} · {String(p.plan || '').toUpperCase()} {p.billingCycle === 'annual' ? '(annuel)' : ''}
                </span>
                <span className="sub">
                  {p.amount} {p.currency} · {p.provider || p.method} · {fmtDate(p.createdAt)} {p.checkoutRefId ? `· réf. ${p.checkoutRefId}` : ''}
                </span>
              </span>
              <Button size="sm" variant="primary" onClick={() => confirm(p)}>Confirmer</Button>
              <Button size="sm" variant="ghost" className="btn--danger" onClick={() => fail(p)}>Refuser</Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Withdrawals() {
  const { toast } = useUi();
  const { data, error, load } = useLoad(async () => {
    const r = await api('/api/admin/withdrawal-requests?status=pending,processing&limit=50');
    return r.items || r.requests || [];
  }, []);
  async function setStatus(r, status) {
    const operatorRef = status === 'paid' ? window.prompt('Référence opérateur du versement') : '';
    if (operatorRef === null) return;
    const note = status === 'rejected' ? window.prompt('Motif du refus') : '';
    if (note === null) return;
    try {
      await api('/api/admin/withdrawal-requests/status', { method: 'POST', body: { request_id: r.id, status, operator_ref_id: operatorRef?.trim() || null, note: note?.trim() || null } });
      toast('success', 'Retrait mis à jour');
      load();
    } catch (e) {
      toast('error', 'Action impossible', e.message);
    }
  }
  return (
    <>
      <ErrorLine error={error} />
      {!data ? (
        <Skeleton height={100} radius={12} />
      ) : data.length === 0 ? (
        <EmptyState art="payment" title="Aucun retrait à traiter" />
      ) : (
        <div className="list card" style={{ padding: 6 }}>
          {data.map((r) => (
            <div key={r.id} className="list-item admin-row">
              <Avatar user={r.user || {}} size={36} />
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>
                  ${Number(r.amountUsd || 0).toFixed(2)} · {r.user?.name || r.creatorId}
                </span>
                <span className="sub">
                  {r.providerLabel || r.provider} · {r.accountName} · {r.walletNumber} · {fmtDate(r.requestedAt || r.createdAt)} · {r.status}
                </span>
              </span>
              {r.status === 'pending' && <Button size="sm" onClick={() => setStatus(r, 'processing')}>En traitement</Button>}
              <Button size="sm" variant="primary" onClick={() => setStatus(r, 'paid')}>Payé</Button>
              <Button size="sm" variant="ghost" className="btn--danger" onClick={() => setStatus(r, 'rejected')}>Refuser</Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Codes() {
  const { toast } = useUi();
  const [f, setF] = useState({ code: '', plan: 'pro', percent: '', duration: '30', maxUses: '', from: '', until: '' });
  const { data, error, load } = useLoad(async () => {
    const r = await api('/api/admin/discount-codes');
    return r.items || r.codes || [];
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api('/api/admin/discount-codes', {
        method: 'POST',
        body: { code: f.code.trim().toUpperCase(), plan: f.plan, discount_percent: Number(f.percent), benefit_duration_days: Number(f.duration), max_uses: f.maxUses ? Number(f.maxUses) : undefined, valid_from: f.from || undefined, valid_until: f.until || undefined },
      });
      toast('success', 'Code créé');
      setF({ ...f, code: '', percent: '' });
      load();
    } catch (err) {
      toast('error', 'Création impossible', err.message);
    }
  }
  async function deactivate(id) {
    try {
      await api(`/api/admin/discount-codes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      load();
    } catch (err) {
      toast('error', 'Action impossible', err.message);
    }
  }
  return (
    <div className="stack">
      <form className="card card--pad admin-form" onSubmit={create}>
        <input className="input" placeholder="BIENVENUE10" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required aria-label="Code" />
        <select className="select" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} aria-label="Plan">
          {['standard', 'medium', 'pro', 'elite', 'page_verification'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="input" type="number" min="1" max="100" placeholder="% de réduction" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} required aria-label="Pourcentage" />
        <input className="input" type="number" min="1" placeholder="Durée (jours)" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} required aria-label="Durée" />
        <input className="input" type="number" min="1" placeholder="Utilisations max (illimité)" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} aria-label="Utilisations max" />
        <input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="Valide à partir du" />
        <input className="input" type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} aria-label="Valide jusqu’au" />
        <Button variant="primary" icon="add">Créer le code</Button>
      </form>
      <ErrorLine error={error} />
      <div className="list card" style={{ padding: 6 }}>
        {(data || []).map((c) => (
          <div key={c.id} className="list-item admin-row">
            <span className="lead-icon"><Icon name="sell" /></span>
            <span className="grow">
              <span className="title" style={{ display: 'block' }}>{c.code} · −{Number(c.discount_percent)} % · {c.plan || '?'}</span>
              <span className="sub">
                {Number(c.benefit_duration_days)} j · {Number(c.uses_count || 0)}{c.max_uses ? `/${c.max_uses}` : ''} utilisations · {fmtDate(c.valid_from)} → {c.valid_until ? fmtDate(c.valid_until) : 'sans fin'}
              </span>
            </span>
            {c.active ? <Button size="sm" variant="ghost" className="btn--danger" onClick={() => deactivate(c.id)}>Désactiver</Button> : <Badge>Inactif</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Partners() {
  const { toast } = useUi();
  const [f, setF] = useState({ name: '', access: '', discount: '', start: '', end: '' });
  const [newCode, setNewCode] = useState({});
  const { data, error, load } = useLoad(async () => {
    const r = await api('/api/admin/partners');
    return r.items || r.partners || [];
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api('/api/admin/partners', { method: 'POST', body: { name: f.name.trim(), access_code: f.access.trim().toUpperCase(), discount_code: f.discount.trim().toUpperCase(), start_date: new Date(f.start).toISOString(), end_date: new Date(f.end).toISOString() } });
      toast('success', 'Partenariat créé');
      setF({ name: '', access: '', discount: '', start: '', end: '' });
      load();
    } catch (err) {
      toast('error', 'Création impossible', err.message);
    }
  }
  async function addCode(id, kind) {
    const code = (newCode[id] || '').trim().toUpperCase();
    if (!code) return;
    try {
      await api(`/api/admin/partners/${encodeURIComponent(id)}/codes`, { method: 'POST', body: { kind, code } });
      toast('success', 'Code ajouté');
      setNewCode({ ...newCode, [id]: '' });
      load();
    } catch (err) {
      toast('error', 'Ajout impossible', err.message);
    }
  }
  return (
    <div className="stack">
      <form className="card card--pad admin-form" onSubmit={create}>
        <input className="input" placeholder="Y Combinator" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required aria-label="Nom" />
        <input className="input" placeholder="Code partenaire (YCOMBINATOR2026)" value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })} required aria-label="Code partenaire" />
        <input className="input" placeholder="Code réduction 20 % (YCOMBINATOR)" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} required aria-label="Code réduction" />
        <input className="input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required aria-label="Début" />
        <input className="input" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} required aria-label="Fin" />
        <Button variant="primary" icon="add">Créer le partenariat</Button>
      </form>
      <ErrorLine error={error} />
      {(data || []).map((p) => (
        <section key={p.id} className="card card--pad stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{p.name}</strong>
            <Badge tone={p.status === 'active' ? 'success' : undefined}>{p.status}</Badge>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            Partenaire : {(p.partner_codes || []).map((c) => c.code).join(', ') || '—'} · Réduction 20 % : {(p.partner_discount_codes || []).map((c) => c.code).join(', ') || '—'} · {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
          </span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input grow" style={{ minWidth: 160 }} placeholder="Nouveau code" value={newCode[p.id] || ''} onChange={(e) => setNewCode({ ...newCode, [p.id]: e.target.value })} aria-label="Nouveau code" />
            <Button size="sm" onClick={() => addCode(p.id, 'partner')}>Code partenaire</Button>
            <Button size="sm" onClick={() => addCode(p.id, 'discount')}>Code réduction 20 %</Button>
          </div>
        </section>
      ))}
    </div>
  );
}

function Announcements() {
  const { user } = useAuth();
  const { toast } = useUi();
  const [f, setF] = useState({ id: null, title: '', body: '', pinned: false });
  const { data, load } = useLoad(async () => {
    if (DEMO) return [];
    const { data: rows } = await supabase.from('admin_announcements').select('*').is('deleted_at', null).order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    return rows || [];
  }, []);
  async function save(e) {
    e.preventDefault();
    try {
      if (f.id) {
        const { error } = await supabase.from('admin_announcements').update({ title: f.title.trim(), body: f.body.trim(), is_pinned: f.pinned, updated_at: new Date().toISOString() }).eq('id', f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('admin_announcements').insert({ title: f.title.trim(), body: f.body.trim(), is_pinned: f.pinned, author_id: user.id });
        if (error) throw error;
      }
      toast('success', f.id ? 'Annonce modifiée' : 'Annonce publiée');
      setF({ id: null, title: '', body: '', pinned: false });
      load();
    } catch (err) {
      toast('error', 'Enregistrement impossible', err.message);
    }
  }
  async function remove(a) {
    if (!window.confirm('Supprimer cette annonce ?')) return;
    await supabase.from('admin_announcements').update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq('id', a.id);
    load();
  }
  return (
    <div className="stack">
      <form className="card card--pad stack" onSubmit={save}>
        <input className="input" placeholder="Titre de l’annonce" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required aria-label="Titre" />
        <textarea className="textarea" placeholder="Contenu de l’annonce" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required aria-label="Contenu" />
        <label className="row" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Épingler en haut
        </label>
        <div className="row">
          <Button variant="primary" icon="campaign">{f.id ? 'Enregistrer' : 'Publier l’annonce'}</Button>
          {f.id && <Button type="button" variant="ghost" onClick={() => setF({ id: null, title: '', body: '', pinned: false })}>Annuler</Button>}
        </div>
      </form>
      {(data || []).map((a) => (
        <section key={a.id} className="card card--pad stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{a.is_pinned && '📌 '}{a.title}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{timeAgo(a.created_at)}</span>
          </div>
          <p className="muted" style={{ whiteSpace: 'pre-line', fontSize: 14 }}>{a.body}</p>
          <div className="row">
            <Button size="sm" icon="edit" onClick={() => setF({ id: a.id, title: a.title, body: a.body, pinned: a.is_pinned })}>Modifier</Button>
            <Button size="sm" variant="ghost" className="btn--danger" icon="delete" onClick={() => remove(a)}>Supprimer</Button>
          </div>
        </section>
      ))}
    </div>
  );
}

function Badges() {
  const { toast } = useUi();
  const [target, setTarget] = useState(null);
  const [type, setType] = useState('creator');
  const [plan, setPlan] = useState('');
  const [pageQ, setPageQ] = useState('');
  const [pagesFound, setPagesFound] = useState([]);
  const { data: requests, load } = useLoad(async () => {
    if (DEMO) return [];
    const { data } = await supabase.from('verification_requests').select(`id, user_id, type, status, created_at, users(${USER_BADGE_COLUMNS})`).eq('status', 'pending').order('created_at');
    return data || [];
  }, []);

  async function grant(userId, t, giftPlan) {
    if (giftPlan) await apiFetch('/api/admin/gift-plan', { method: 'POST', body: { target_user_id: userId, plan: giftPlan } });
    const { error } = await supabase.from('verified_badges').upsert({ user_id: userId, type: t }, { onConflict: 'user_id,type' });
    if (error) throw error;
    await supabase.from('verification_requests').update({ status: 'approved' }).eq('user_id', userId).eq('type', t).eq('status', 'pending');
  }
  async function revoke(userId, t) {
    const { error } = await supabase.from('verified_badges').delete().eq('user_id', userId).eq('type', t);
    if (error) throw error;
  }
  async function act(fn, ok) {
    try {
      await fn();
      toast('success', ok);
      load();
    } catch (e) {
      toast('error', 'Action impossible', e.message);
    }
  }
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!pageQ.trim() || DEMO) return setPagesFound([]);
      const { data } = await supabase.from('professional_pages').select('id, name, slug, avatar_url, is_verified').ilike('name', `%${pageQ.trim().replace(/[%_]/g, '')}%`).limit(6);
      setPagesFound(data || []);
    }, 280);
    return () => clearTimeout(t);
  }, [pageQ]);

  return (
    <div className="stack">
      <section className="card card--pad stack">
        <h3 style={{ fontSize: 16 }}>Demandes de vérification ({requests?.length || 0})</h3>
        {!requests?.length ? (
          <p className="muted">Aucune demande en attente.</p>
        ) : (
          <div className="list">
            {requests.map((r) => (
              <div key={r.id} className="list-item admin-row">
                <Avatar user={r.users || {}} size={34} />
                <span className="grow">
                  <UserName user={r.users || {}} className="title" />
                  <span className="sub" style={{ display: 'block' }}>{r.type === 'staff' ? 'Équipe / entreprise' : 'Créateur'} · {timeAgo(r.created_at)}</span>
                </span>
                <Button size="sm" variant="primary" onClick={() => act(() => grant(r.user_id, r.type, plan || null), 'Vérification accordée')}>Approuver</Button>
                <Button size="sm" variant="ghost" className="btn--danger" onClick={() => act(() => supabase.from('verification_requests').update({ status: 'rejected' }).eq('id', r.id), 'Demande refusée')}>Refuser</Button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card card--pad stack">
        <h3 style={{ fontSize: 16 }}>Attribuer ou retirer un badge</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select className="select" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de badge">
            <option value="creator">Créateur vérifié</option>
            <option value="staff">Équipe / entreprise</option>
            <option value="fata">Fata</option>
          </select>
          <select className="select" style={{ width: 'auto' }} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Offrir un plan">
            <option value="">Sans plan offert</option>
            <option value="standard">Offrir Standard</option>
            <option value="medium">Offrir Medium</option>
            <option value="pro">Offrir Pro (badge Gold)</option>
          </select>
        </div>
        {target ? (
          <div className="list-item admin-row card" style={{ padding: 10 }}>
            <Avatar user={target} size={36} />
            <UserName user={target} className="title grow" />
            <Button size="sm" variant="primary" onClick={() => act(() => grant(target.id, type, plan || null), 'Badge attribué')}>Attribuer</Button>
            <Button size="sm" variant="ghost" className="btn--danger" onClick={() => act(() => revoke(target.id, type), 'Badge retiré')}>Retirer</Button>
            <button className="icon-btn" onClick={() => setTarget(null)} aria-label="Changer de membre"><Icon name="close" /></button>
          </div>
        ) : (
          <UserPicker onPick={setTarget} />
        )}
      </section>
      <section className="card card--pad stack">
        <h3 style={{ fontSize: 16 }}>Pages vérifiées</h3>
        <div className="input-wrap">
          <Icon name="apartment" />
          <input className="input" placeholder="Nom de la page pro" value={pageQ} onChange={(e) => setPageQ(e.target.value)} aria-label="Rechercher une page" />
        </div>
        {pagesFound.map((p) => (
          <div key={p.id} className="list-item admin-row">
            <Avatar user={{ name: p.name, avatar: p.avatar_url }} size={34} />
            <Link to={`/page/${p.slug || p.id}`} className="title grow">{p.name}</Link>
            <Button size="sm" variant="primary" onClick={() => act(() => grant(p.id, 'page', null), 'Page vérifiée')}>Vérifier</Button>
            <Button size="sm" variant="ghost" className="btn--danger" onClick={() => act(() => revoke(p.id, 'page'), 'Vérification retirée')}>Retirer</Button>
          </div>
        ))}
      </section>
    </div>
  );
}

function Moderation() {
  const { user } = useAuth();
  const { toast } = useUi();
  const [target, setTarget] = useState(null);
  const [hours, setHours] = useState('24');
  const [reason, setReason] = useState('');
  const banned = target?.banned_until && Date.parse(target.banned_until) > Date.now();
  async function ban() {
    const h = Math.max(1, parseInt(hours, 10) || 0);
    const until = new Date(Date.now() + h * 3600e3).toISOString();
    const { error } = await supabase.from('users').update({ banned_until: until, banned_reason: reason.trim() || null, banned_by: user.id, banned_at: new Date().toISOString() }).eq('id', target.id);
    if (error) return toast('error', 'Bannissement impossible', error.message);
    setTarget({ ...target, banned_until: until });
    toast('success', 'Compte banni', `Pendant ${h} h.`);
  }
  async function unban() {
    const { error } = await supabase.from('users').update({ banned_until: null, banned_reason: null, banned_by: null, banned_at: null }).eq('id', target.id);
    if (error) return toast('error', 'Action impossible', error.message);
    setTarget({ ...target, banned_until: null });
    toast('success', 'Bannissement levé');
  }
  return (
    <section className="card card--pad stack">
      <h3 style={{ fontSize: 16 }}>Bannir un compte</h3>
      {target ? (
        <>
          <div className="list-item admin-row card" style={{ padding: 10 }}>
            <Avatar user={target} size={36} />
            <span className="grow">
              <UserName user={target} className="title" />
              <span className="sub" style={{ display: 'block' }}>{banned ? `Banni jusqu’au ${fmtDate(target.banned_until)}` : 'Compte actif'}</span>
            </span>
            <button className="icon-btn" onClick={() => setTarget(null)} aria-label="Changer de membre"><Icon name="close" /></button>
          </div>
          {banned ? (
            <Button variant="primary" icon="lock_open" onClick={unban}>Lever le bannissement</Button>
          ) : (
            <div className="admin-form">
              <input className="input" type="number" min="1" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Durée en heures" placeholder="Durée (heures)" />
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (facultatif)" aria-label="Motif" />
              <Button className="btn--danger" icon="block" onClick={ban}>Bannir</Button>
            </div>
          )}
        </>
      ) : (
        <UserPicker onPick={setTarget} />
      )}
      <p className="muted" style={{ fontSize: 12.5 }}>Pour masquer une publication, utilisez le menu « Admin » sur la publication dans le fil.</p>
    </section>
  );
}

function Bots() {
  const { toast } = useUi();
  const [count, setCount] = useState('');
  const { data: st, error, load } = useLoad(() => api('/api/admin/bots/status'), []);
  async function call(path, body, ok) {
    try {
      await api(path, { method: 'POST', body });
      toast('success', ok);
      load();
    } catch (e) {
      toast('error', 'Action impossible', e.message);
    }
  }
  return (
    <div className="stack">
      <ErrorLine error={error} />
      <div className="kpi-grid">
        <div className="kpi"><Icon name="smart_toy" /><strong>{st?.totalBots ?? '—'}</strong><span>Bots au total</span></div>
        <div className="kpi"><Icon name="play_circle" /><strong>{st?.activeCount ?? '—'}</strong><span>Actifs</span></div>
        <div className="kpi"><Icon name="tune" /><strong>{st?.configuredActiveCount ?? '—'}</strong><span>Objectif actifs</span></div>
        <div className="kpi"><Icon name="bolt" /><strong>{st?.forcePosts ? 'Oui' : 'Non'}</strong><span>Publications forcées</span></div>
      </div>
      <section className="card card--pad admin-form">
        <input className="input" type="number" min="0" placeholder="Nombre de bots actifs" value={count} onChange={(e) => setCount(e.target.value)} aria-label="Nombre de bots actifs" />
        <Button onClick={() => call('/api/admin/bots/set-active-count', { count: Number(count) }, 'Nombre mis à jour')}>Appliquer</Button>
        <Button onClick={() => call('/api/admin/bots/set-force-posts', { enabled: !st?.forcePosts }, 'Réglage mis à jour')}>{st?.forcePosts ? 'Désactiver' : 'Activer'} les publications forcées</Button>
        <Button variant="primary" icon="play_arrow" onClick={() => call('/api/admin/bots/run-now', undefined, 'Exécution lancée')}>Lancer maintenant</Button>
        <Button
          className="btn--danger"
          icon="delete"
          onClick={() => window.confirm('Supprimer tous les bots ?') && call('/api/admin/bots/delete-all', undefined, 'Bots supprimés')}
        >
          Tout supprimer
        </Button>
      </section>
      {(st?.sample || []).length > 0 && (
        <div className="list card" style={{ padding: 6 }}>
          {st.sample.map((b) => (
            <div key={b.user_id} className="list-item admin-row">
              <Avatar user={{ name: b.display_name, avatar: b.avatar_url }} size={34} />
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>{b.display_name}</span>
                <span className="sub">Publie vers {b.schedule_hour} h · encourage {b.encourage_days} j</span>
              </span>
              <button className={`switch${b.active ? ' is-on' : ''}`} role="switch" aria-checked={b.active} onClick={() => call('/api/admin/bots/toggle-active', { user_id: b.user_id, active: !b.active }, 'Bot mis à jour')} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MOODS = { happy: '😀', love: '😍', neutral: '😐', sad: '😕', angry: '😡' };

function Feedback() {
  const { data } = useLoad(async () => {
    if (DEMO) return [];
    const { data: rows } = await supabase.from('feedback_inbox').select('id, created_at, mood, comment, sender_user_id').order('created_at', { ascending: false }).limit(200);
    return rows || [];
  }, []);
  if (!data) return <Skeleton height={100} radius={12} />;
  if (!data.length) return <EmptyState art="chat" title="Aucun retour pour le moment" />;
  return (
    <div className="list card" style={{ padding: 6 }}>
      {data.map((f) => (
        <div key={f.id} className="list-item" style={{ alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22 }}>{MOODS[f.mood] || '💬'}</span>
          <span className="grow">
            <span style={{ display: 'block', fontSize: 14.5, whiteSpace: 'pre-line' }}>{f.comment || <em className="muted">Sans commentaire</em>}</span>
            <span className="sub">
              {timeAgo(f.created_at)} {f.sender_user_id && <Link to={`/u/${f.sender_user_id}`} style={{ textDecoration: 'underline' }}>voir le membre</Link>}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Email() {
  const { toast } = useUi();
  const [f, setF] = useState({ subject: '', body: '', ctaLabel: '', ctaUrl: '' });
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    if (!window.confirm('Envoyer cet e-mail à TOUS les membres ?')) return;
    setBusy(true);
    try {
      const r = await api('/api/admin/broadcast-email', { method: 'POST', body: f, timeout: 60000 });
      toast('success', 'E-mail envoyé', r?.sent ? `${r.sent} destinataires.` : undefined);
      setF({ subject: '', body: '', ctaLabel: '', ctaUrl: '' });
    } catch (err) {
      toast('error', 'Envoi impossible', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card card--pad stack" onSubmit={send}>
      <input className="input" placeholder="Sujet de l’e-mail" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required aria-label="Sujet" />
      <textarea className="textarea" style={{ minHeight: 160 }} placeholder="Contenu de l’e-mail (sauts de ligne conservés)" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required aria-label="Contenu" />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input className="input grow" placeholder="Texte du bouton (ex. Ouvrir l’app)" value={f.ctaLabel} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} aria-label="Texte du bouton" />
        <input className="input grow" placeholder="Lien du bouton (facultatif)" value={f.ctaUrl} onChange={(e) => setF({ ...f, ctaUrl: e.target.value })} aria-label="Lien du bouton" />
      </div>
      <Button variant="primary" icon="send" loading={busy}>Envoyer à tout le monde</Button>
    </form>
  );
}

const PANELS = { pulse: Pulse, payments: Payments, withdrawals: Withdrawals, codes: Codes, partners: Partners, announcements: Announcements, badges: Badges, moderation: Moderation, bots: Bots, feedback: Feedback, email: Email };

export default function Admin({ initialTab = 'pulse' }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const allowed = DEMO || user?.id === SUPER_ADMIN_ID;
  const Panel = PANELS[tab];
  return (
    <>
      <TopBar back title="Administration" />
      <main className="main main--wide">
        {!allowed ? (
          <div className="card card--pad" style={{ textAlign: 'center' }}>
            <Art name="verified" size={150} />
            <h2 style={{ fontSize: 20 }}>Accès refusé</h2>
            <p className="muted">Vous n’avez pas les droits nécessaires.</p>
          </div>
        ) : (
          <>
            <div className="chip-row admin-tabs" role="tablist">
              {TABS.map(([k, icon, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`chip${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Panel />
            </div>
          </>
        )}
      </main>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Badge, Button, EmptyState, Skeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { apiFetch } from '../services/api';
import { canReceiveSupport, isPlanActive } from '../services/badges';
import { supabase } from '../services/supabase';
import { DEMO } from '../services/demo';

/** Opérateurs acceptés par le serveur (SUPPORTED_MOBILE_MONEY_PROVIDERS). */
const PROVIDERS = [
  ['RD Congo', [['VODACOM_MPESA_COD', 'Vodacom M-Pesa'], ['AIRTEL_COD', 'Airtel Money'], ['ORANGE_COD', 'Orange Money'], ['MTN_MOMO_COD', 'MTN MoMo']]],
  ['Rwanda', [['MTN_MOMO_RWA', 'MTN MoMo'], ['AIRTEL_RWA', 'Airtel Money']]],
  ['Ouganda', [['MTN_MOMO_UGA', 'MTN MoMo'], ['AIRTEL_OAPI_UGA', 'Airtel Money']]],
  ['Kenya', [['MPESA_KEN', 'M-Pesa']]],
  ['Congo-Brazzaville', [['MTN_MOMO_COG', 'MTN MoMo'], ['AIRTEL_COG', 'Airtel Money']]],
  ['Cameroun', [['MTN_MOMO_CMR', 'MTN MoMo'], ['ORANGE_CMR', 'Orange Money']]],
  ['Côte d’Ivoire', [['MTN_MOMO_CIV', 'MTN MoMo'], ['ORANGE_CIV', 'Orange Money']]],
  ['Bénin', [['MTN_MOMO_BEN', 'MTN MoMo'], ['MOOV_BEN', 'Moov Money']]],
  ['Sénégal', [['ORANGE_SEN', 'Orange Money'], ['FREE_SEN', 'Free Money']]],
  ['Gabon', [['AIRTEL_GAB', 'Airtel Money']]],
  ['Sierra Leone', [['ORANGE_SLE', 'Orange Money']]],
  ['Zambie', [['MTN_MOMO_ZMB', 'MTN MoMo'], ['AIRTEL_OAPI_ZMB', 'Airtel Money'], ['ZAMTEL_ZMB', 'Zamtel']]],
];

const WITHDRAWAL_STATUS = {
  pending: ['En attente', 'pause'],
  processing: ['En traitement', 'violet'],
  paid: ['Payé', 'success'],
  rejected: ['Refusé', 'failure'],
  canceled: ['Annulé', undefined],
};
const TX_STATUS = { succeeded: ['Réussi', 'success'], pending: ['En attente', 'pause'], failed: ['Échoué', 'failure'], refunded: ['Remboursé', undefined] };

const usd = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const DEMO_OVERVIEW = {
  wallet: { availableBalance: 42.5, pendingIncoming: 7.5, pendingWithdrawals: 10, paidWithdrawals: 120, minimumWithdrawalUsd: 5, canRequestWithdrawal: true },
  payoutSettings: { provider: 'VODACOM_MPESA_COD', providerLabel: 'Vodacom M-Pesa (RD Congo)', accountName: 'Amani Kahindo', walletNumber: '+243 81 234 5678', status: 'active' },
  withdrawals: [
    { id: 'w1', amountUsd: 10, status: 'pending', requestedAt: new Date(Date.now() - 864e5).toISOString(), providerLabel: 'Vodacom M-Pesa' },
    { id: 'w2', amountUsd: 120, status: 'paid', requestedAt: new Date(Date.now() - 20 * 864e5).toISOString(), providerLabel: 'Vodacom M-Pesa', operatorRefId: 'MP2611A93' },
  ],
};

function useOverview() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setOverview(DEMO ? DEMO_OVERVIEW : await apiFetch('/api/monetization/overview'));
    } catch (e) {
      setError(e.message);
      setOverview((o) => o || { wallet: {}, withdrawals: [] });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { overview, error, load };
}

function PayoutForm({ current, onSaved }) {
  const { toast } = useUi();
  const [form, setForm] = useState({ provider: current?.provider || '', account_name: current?.accountName || '', wallet_number: current?.walletNumber || '', notes: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!form.provider || !form.account_name.trim() || !form.wallet_number.trim()) return toast('error', 'Champs manquants', 'Opérateur, nom du titulaire et numéro sont obligatoires.');
    setBusy(true);
    try {
      if (!DEMO) await apiFetch('/api/monetization/payout-settings', { method: 'POST', body: form });
      toast('success', 'Compte de retrait enregistré');
      onSaved();
    } catch (err) {
      toast('error', 'Enregistrement impossible', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="po-provider">Opérateur Mobile Money</label>
        <select id="po-provider" className="select" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} required>
          <option value="">Choisir un opérateur</option>
          {PROVIDERS.map(([country, list]) => (
            <optgroup key={country} label={country}>
              {list.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="field grow" style={{ minWidth: 180 }}>
          <label htmlFor="po-name">Nom du titulaire</label>
          <input id="po-name" className="input" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} maxLength={160} required />
        </div>
        <div className="field grow" style={{ minWidth: 180 }}>
          <label htmlFor="po-number">Numéro Mobile Money</label>
          <input id="po-number" className="input" inputMode="tel" placeholder="+243…" value={form.wallet_number} onChange={(e) => setForm({ ...form, wallet_number: e.target.value })} maxLength={32} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="po-notes">Note pour l’équipe (facultatif)</label>
        <input id="po-notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={160} />
      </div>
      <Button variant="primary" loading={busy} icon="save">
        Enregistrer le compte
      </Button>
    </form>
  );
}

export default function CreatorSpace() {
  const { user } = useAuth();
  const { toast } = useUi();
  const { overview, error, load } = useOverview();
  const [editPayout, setEditPayout] = useState(false);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [txs, setTxs] = useState(null);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (DEMO) {
        const now = Date.now();
        setTxs([10, 5, 3, 25].map((g, i) => ({ id: `t${i}`, type: 'support', status: 'succeeded', amount_gross: g, amount_commission_xera: g * 0.25, amount_net_creator: g * 0.75, created_at: new Date(now - i * 3 * 864e5).toISOString() })));
        return;
      }
      let q = supabase.from('transactions').select('*').eq('to_user_id', user.id).order('created_at', { ascending: false }).limit(100);
      if (period !== 'all') q = q.gte('created_at', new Date(Date.now() - Number(period) * 864e5).toISOString());
      const { data } = await q;
      if (alive) setTxs(data || []);
    })();
    return () => {
      alive = false;
    };
  }, [user.id, period]);

  const totals = useMemo(() => {
    const ok = (txs || []).filter((t) => t.status === 'succeeded');
    return {
      net: ok.reduce((n, t) => n + Number(t.amount_net_creator || 0), 0),
      gross: ok.reduce((n, t) => n + Number(t.amount_gross || 0), 0),
      count: ok.filter((t) => t.type === 'support').length,
    };
  }, [txs]);

  const wallet = overview?.wallet || {};
  const payout = overview?.payoutSettings || null;
  const min = Number(wallet.minimumWithdrawalUsd || 5);
  const available = Number(wallet.availableBalance || 0);
  const canSupport = canReceiveSupport(user);
  const planName = isPlanActive(user) && user?.plan ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1) : null;

  let notice = null;
  if (!payout?.walletNumber) notice = ['warning', 'Enregistrez votre compte Mobile Money pour pouvoir demander un retrait.'];
  else if (payout.status && payout.status !== 'active') notice = ['warning', 'Votre compte Mobile Money est inactif. Réenregistrez-le avant de demander un retrait.'];
  else if (available < min) notice = ['info', `Votre solde disponible est inférieur au minimum de retrait (${usd(min)}).`];
  else notice = ['success', 'Votre portefeuille est prêt. Toute demande est envoyée à l’équipe pour validation.'];

  async function withdraw(e) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) return toast('error', 'Montant invalide');
    if (value < min) return toast('error', 'Montant trop faible', `Minimum : ${usd(min)}.`);
    if (value > available) return toast('error', 'Solde insuffisant', `Disponible : ${usd(available)}.`);
    setSending(true);
    try {
      if (!DEMO) await apiFetch('/api/monetization/withdrawals', { method: 'POST', body: { amount: value } });
      toast('success', 'Demande de retrait envoyée', 'L’équipe la valide puis l’envoie sur votre Mobile Money.');
      setAmount('');
      load();
    } catch (err) {
      toast('error', 'Retrait impossible', err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <TopBar back title="Espace créateur" actions={<button className="icon-btn" onClick={load} aria-label="Actualiser"><Icon name="refresh" /></button>} />
      <main className="main main--wide">
        <section className={`card card--pad creator-status${canSupport ? ' is-on' : ''}`}>
          <Art name={canSupport ? 'payment' : 'trophy'} size={120} />
          <div className="grow stack" style={{ gap: 6 }}>
            <Badge tone={canSupport ? 'success' : undefined} icon={canSupport ? 'check_circle' : 'lock'}>
              {canSupport ? 'Soutiens activés' : 'Soutiens non activés'}
            </Badge>
            <h2 style={{ fontSize: 19 }}>{canSupport ? 'Votre communauté peut vous soutenir.' : 'Activez les soutiens de votre communauté.'}</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              {canSupport
                ? `Plan ${planName || 'actif'} · vous recevez 75 % de chaque soutien confirmé.`
                : 'Un abonnement Medium ou Pro actif suffit, sans seuil d’abonnés.'}
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Link to="/abonnements" className={`btn btn--sm${canSupport ? '' : ' btn--primary'}`}>
                <Icon name="workspace_premium" /> {canSupport ? 'Gérer mon abonnement' : 'Voir les abonnements'}
              </Link>
              <Link to={`/u/${user.id}`} className="btn btn--sm btn--ghost">
                <Icon name="person" /> Mon profil
              </Link>
            </div>
          </div>
        </section>

        <div className="section-title">
          <h2>Portefeuille</h2>
        </div>
        {error && (
          <div className="form-error" style={{ marginBottom: 12 }}>
            <Icon name="error" />
            <span>{error}</span>
          </div>
        )}
        {overview === null ? (
          <Skeleton height={120} radius={12} />
        ) : (
          <>
            <div className="wallet-grid">
              <div className="wallet-main">
                <span>Solde disponible</span>
                <strong>{usd(available)}</strong>
                <small>Retrait minimum : {usd(min)}</small>
              </div>
              <div className="stat">
                <strong>{usd(wallet.pendingIncoming)}</strong>
                <span>Soutiens en attente</span>
              </div>
              <div className="stat">
                <strong>{usd(wallet.pendingWithdrawals)}</strong>
                <span>Retraits en cours</span>
              </div>
              <div className="stat">
                <strong>{usd(wallet.paidWithdrawals)}</strong>
                <span>Déjà versés</span>
              </div>
            </div>
            <div className={`wallet-notice is-${notice[0]}`}>
              <Icon name={notice[0] === 'success' ? 'check_circle' : notice[0] === 'warning' ? 'warning' : 'info'} />
              <span>{notice[1]}</span>
            </div>

            <div className="creator-cols">
              <section className="card card--pad stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 16 }}>Compte de retrait</h3>
                  {payout?.walletNumber && !editPayout && (
                    <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditPayout(true)}>
                      Modifier
                    </Button>
                  )}
                </div>
                {payout?.walletNumber && !editPayout ? (
                  <div className="payout-summary">
                    <span className="lead-icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--success-soft)', color: 'var(--success)' }}>
                      <Icon name="account_balance_wallet" />
                    </span>
                    <div>
                      <strong>{payout.providerLabel || payout.provider}</strong>
                      <span>
                        {payout.accountName} · {payout.walletNumber}
                      </span>
                    </div>
                    <Badge tone={payout.status === 'active' ? 'success' : 'failure'}>{payout.status === 'active' ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                ) : (
                  <PayoutForm
                    current={payout}
                    onSaved={() => {
                      setEditPayout(false);
                      load();
                    }}
                  />
                )}
              </section>

              <section className="card card--pad">
                <h3 style={{ fontSize: 16, marginBottom: 12 }}>Demander un retrait</h3>
                <form className="stack" onSubmit={withdraw}>
                  <div className="field">
                    <label htmlFor="wd-amount">Montant (USD)</label>
                    <input
                      id="wd-amount"
                      className="input"
                      type="number"
                      min={min}
                      max={available || undefined}
                      step="0.01"
                      placeholder={`${min} minimum`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!wallet.canRequestWithdrawal}
                    />
                    <span className="hint">Envoyé automatiquement sur votre compte Mobile Money après validation.</span>
                  </div>
                  <Button variant="primary" icon="send" loading={sending} disabled={!wallet.canRequestWithdrawal}>
                    Demander le retrait
                  </Button>
                </form>
              </section>
            </div>

            <div className="section-title">
              <h2>Retraits</h2>
            </div>
            {(overview.withdrawals || []).length === 0 ? (
              <p className="muted" style={{ fontSize: 14 }}>Aucune demande de retrait pour l’instant.</p>
            ) : (
              <div className="card list" style={{ padding: 6 }}>
                {overview.withdrawals.map((w) => {
                  const [label, tone] = WITHDRAWAL_STATUS[w.status] || [w.status];
                  return (
                    <div key={w.id || w.requestedAt} className="list-item">
                      <span className="lead-icon"><Icon name="south_west" /></span>
                      <span className="grow">
                        <span className="title" style={{ display: 'block' }}>{usd(w.amountUsd)}</span>
                        <span className="sub">
                          {dateTime(w.requestedAt || w.createdAt)} · {w.providerLabel || w.provider}
                          {w.operatorRefId ? ` · réf. ${w.operatorRefId}` : ''}
                        </span>
                      </span>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="section-title">
          <h2>Revenus des soutiens</h2>
          <select className="select" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Période">
            <option value="all">Tout</option>
            <option value="30">30 jours</option>
            <option value="7">7 jours</option>
          </select>
        </div>
        <div className="stats" style={{ marginBottom: 14 }}>
          <div className="stat"><strong>{usd(totals.net)}</strong><span>Net reçu (75 %)</span></div>
          <div className="stat"><strong>{usd(totals.gross)}</strong><span>Montant brut</span></div>
          <div className="stat"><strong>{totals.count}</strong><span>Soutiens</span></div>
        </div>
        {txs === null ? (
          <Skeleton height={80} radius={12} />
        ) : txs.length === 0 ? (
          <EmptyState art="payment" title="Aucun soutien pour le moment" text="Partagez votre profil : vos soutiens apparaîtront ici." />
        ) : (
          <div className="card list" style={{ padding: 6 }}>
            {txs.map((t) => {
              const [label, tone] = TX_STATUS[t.status] || [t.status];
              return (
                <div key={t.id} className="list-item">
                  <span className="lead-icon" style={{ color: '#f472b6' }}><Icon name="favorite" filled /></span>
                  <span className="grow">
                    <span className="title" style={{ display: 'block' }}>
                      +{usd(t.amount_net_creator)} <small className="muted" style={{ fontWeight: 500 }}>sur {usd(t.amount_gross)}</small>
                    </span>
                    <span className="sub">
                      {dateTime(t.created_at)} · {t.type === 'support' ? 'Soutien' : t.type} · commission {usd(t.amount_commission_xera)}
                    </span>
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

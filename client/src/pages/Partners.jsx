import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Badge, Button, EmptyState, Skeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { apiFetch } from '../services/api';
import { MOBILE_MONEY_PROVIDERS } from '../services/payments';
import { getMyPages } from '../services/pages';
import { DEMO } from '../services/demo';

/** Console partenaire (commissions.html) : mêmes routes /api/partners/*. */
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;
const CONTACTS = (
  <div className="partner-contacts">
    <a href="mailto:ild.faida@xera1.xyz"><Icon name="mail" size={18} /> ild.faida@xera1.xyz</a>
    <a href="mailto:gibril@xera1.xyz"><Icon name="mail" size={18} /> gibril@xera1.xyz</a>
    <a href="https://wa.me/243849102405" target="_blank" rel="noreferrer"><Icon name="chat" size={18} /> WhatsApp : +243 849 102 405</a>
  </div>
);

export default function Partners() {
  const { user } = useAuth();
  const { toast } = useUi();
  const [pages, setPages] = useState(null);
  const [pageId, setPageId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [payout, setPayout] = useState({ provider: '', account_name: '', wallet_number: '' });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    getMyPages(user.id).then((list) => {
      setPages(list);
      if (list[0]) setPageId(list[0].id);
    });
  }, [user.id]);

  const load = useCallback(async () => {
    if (!pageId) return;
    setData(null);
    setError('');
    try {
      const d = DEMO
        ? { active: true, partner: 'Studio Lumbi', discountCode: { code: 'LUMBI20', discount_percent: 20 }, metrics: { total: 84.5, available: 32, paid: 52.5, affiliates: 17, donations: 41, donationGross: 338 }, commissions: [{ id: 1, created_at: new Date().toISOString(), amount_gross: 10, commission_amount: 2.5, status: 'available' }], payoutSetting: null }
        : await apiFetch(`/api/partners/dashboard?page_id=${encodeURIComponent(pageId)}`);
      setData(d);
      if (d.payoutSetting) setPayout({ provider: d.payoutSetting.provider || '', account_name: d.payoutSetting.account_name || '', wallet_number: d.payoutSetting.wallet_number || '' });
    } catch (e) {
      setError(e.message);
    }
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  async function activate(e) {
    e.preventDefault();
    setBusy('activate');
    try {
      if (!DEMO) await apiFetch('/api/partners/activate', { method: 'POST', body: { professional_page_id: pageId, code } });
      toast('success', 'Partenariat activé');
      load();
    } catch (err) {
      toast('error', 'Activation impossible', err.message);
    } finally {
      setBusy('');
    }
  }

  async function savePayout(e) {
    e.preventDefault();
    setBusy('payout');
    try {
      if (!DEMO) await apiFetch('/api/partners/payout-settings', { method: 'POST', body: { professional_page_id: pageId, ...payout } });
      toast('success', 'Compte de retrait enregistré');
    } catch (err) {
      toast('error', 'Enregistrement impossible', err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <TopBar back title="Console partenaire" />
      <main className="main main--wide">
        {pages === null ? (
          <Skeleton height={140} radius={12} />
        ) : pages.length === 0 ? (
          <EmptyState art="community" title="Aucune page pro" text="La console partenaire est rattachée à une Page Professionnelle." action={<Link to="/pages/nouvelle" className="btn btn--primary"><Icon name="add" /> Créer une page pro</Link>} />
        ) : (
          <>
            {pages.length > 1 && (
              <select className="select" style={{ marginBottom: 14 }} value={pageId} onChange={(e) => setPageId(e.target.value)} aria-label="Page">
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            {error ? (
              <div className="form-error"><Icon name="error" /><span>{error}</span></div>
            ) : !data ? (
              <Skeleton height={200} radius={12} />
            ) : !data.active ? (
              <div className="partner-locked">
                <section className="card card--pad stack">
                  <Art name={data.reason === 'expired_or_revoked' ? 'empty' : 'verified'} size={150} />
                  <span className="eyebrow">{data.reason === 'expired_or_revoked' ? 'Partenariat inactif' : 'Programme partenaire'}</span>
                  <h2 style={{ fontSize: 22 }}>{data.reason === 'expired_or_revoked' ? 'Votre partenariat est arrivé à son terme.' : 'Votre espace commissions est verrouillé.'}</h2>
                  <p className="muted">
                    {data.reason === 'expired_or_revoked'
                      ? 'Le code partenaire associé à votre Page Professionnelle n’est plus actif. Vos données de commissions restent conservées.'
                      : 'Cette Page Professionnelle n’est pas encore rattachée à un partenariat XERA1. Notre équipe sera heureuse d’échanger avec vous.'}
                  </p>
                  {CONTACTS}
                </section>
                {data.reason !== 'expired_or_revoked' && (
                  <form className="card card--pad stack" onSubmit={activate}>
                    <h3 style={{ fontSize: 17 }}>Vous avez déjà un code ?</h3>
                    <p className="muted" style={{ fontSize: 14 }}>Si XERA1 vous a transmis un code partenaire, saisissez-le ici pour ouvrir votre espace commissions.</p>
                    <input className="input" placeholder="CODE-PARTENAIRE" maxLength={60} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Code partenaire" required />
                    <Button variant="primary" icon="lock_open" loading={busy === 'activate'}>Activer le partenariat</Button>
                  </form>
                )}
              </div>
            ) : (
              <div className="stack">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div>
                    <span className="eyebrow">Tableau de bord partenaire</span>
                    <h1 style={{ fontSize: 24 }}>Commissions · {data.partner}</h1>
                  </div>
                  <Badge tone="success" icon="check_circle">Partenariat actif</Badge>
                </div>
                {data.discountCode && (
                  <section className="card card--pad partner-code">
                    <div>
                      <span className="eyebrow">Votre code de réduction</span>
                      <strong>{data.discountCode.code}</strong>
                      <span className="muted">{Number(data.discountCode.discount_percent || 0)} % de réduction pour votre communauté</span>
                    </div>
                    <Button icon="content_copy" onClick={() => navigator.clipboard?.writeText(data.discountCode.code).then(() => toast('success', 'Code copié'))}>Copier</Button>
                  </section>
                )}
                <div className="wallet-main">
                  <span>Disponible maintenant</span>
                  <strong>{usd(data.metrics.available)}</strong>
                  <small>Fonds disponibles pour versement</small>
                </div>
                <div className="kpi-grid">
                  {[
                    ['payments', 'Total', usd(data.metrics.total)],
                    ['savings', 'Versé', usd(data.metrics.paid)],
                    ['group_add', 'Affiliés', data.metrics.affiliates],
                    ['favorite', 'Dons', data.metrics.donations],
                    ['volunteer_activism', 'Dons éligibles', usd(data.metrics.donationGross)],
                  ].map(([i, l, v]) => (
                    <div key={l} className="kpi"><Icon name={i} /><strong>{v}</strong><span>{l}</span></div>
                  ))}
                </div>
                <div className="section-title"><h2>Historique des commissions</h2><span className="muted" style={{ fontSize: 13 }}>{data.commissions.length} entrée(s)</span></div>
                {data.commissions.length === 0 ? (
                  <p className="muted">Aucune commission pour le moment.</p>
                ) : (
                  <div className="card list" style={{ padding: 6 }}>
                    {data.commissions.map((c, i) => (
                      <div key={c.id || i} className="list-item">
                        <span className="lead-icon"><Icon name="add_card" /></span>
                        <span className="grow">
                          <span className="title" style={{ display: 'block' }}>+{usd(c.commission_amount)} <small className="muted">sur un don de {usd(c.amount_gross)}</small></span>
                          <span className="sub">{new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
                        </span>
                        <Badge>{c.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <form className="card card--pad stack" onSubmit={savePayout}>
                  <h3 style={{ fontSize: 16 }}>Compte de retrait Mobile Money</h3>
                  <select className="select" value={payout.provider} onChange={(e) => setPayout({ ...payout, provider: e.target.value })} required aria-label="Réseau Mobile Money">
                    <option value="">Choisir un réseau</option>
                    {MOBILE_MONEY_PROVIDERS.map(([country, list]) => (
                      <optgroup key={country} label={country}>
                        {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <input className="input" placeholder="Titulaire du compte" maxLength={80} value={payout.account_name} onChange={(e) => setPayout({ ...payout, account_name: e.target.value })} required />
                  <input className="input" type="tel" placeholder="+243810000000" maxLength={32} value={payout.wallet_number} onChange={(e) => setPayout({ ...payout, wallet_number: e.target.value })} required />
                  <Button variant="primary" icon="save" loading={busy === 'payout'}>Enregistrer le compte de retrait</Button>
                </form>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

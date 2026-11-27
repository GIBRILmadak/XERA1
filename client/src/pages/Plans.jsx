import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { isPlanActive } from '../services/badges';
import { openSubscription } from '../services/payments';

/** Mêmes plans, prix et avantages que js/subscription-plans-data.js. */
const ANNUAL_DISCOUNT = 0.2;
const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    monthly: 2.99,
    icon: 'verified',
    text: 'Affirmez votre profil avec un badge vérifié et un bonus de visibilité.',
    features: ['Badge de vérification bleu', 'Bonus de visibilité dans les recommandations des Pages Pro'],
  },
  {
    id: 'medium',
    name: 'Medium',
    monthly: 7.99,
    icon: 'trending_up',
    tag: 'Populaire',
    text: 'Personnalisez votre profil, recevez des soutiens et profitez d’un score de visibilité ×1,5 dans le feed.',
    features: [
      'Badge de vérification bleu',
      'Score de visibilité dans le feed multiplié par 1,5',
      'Personnalisation avancée du profil',
      'Priorité renforcée dans les recommandations',
      'Réception des soutiens dès l’activation de l’abonnement',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 14.99,
    icon: 'workspace_premium',
    tag: 'Recommandé',
    featured: true,
    text: 'Le palier créateur : visibilité ×5 dans le feed, badge Gold, streaming HD et lives privés.',
    features: [
      'Tous les avantages Medium',
      'Réception des soutiens dès l’activation du plan, sans seuil d’abonnés',
      'Score de visibilité dans le feed multiplié par 5',
      'Badge de vérification Gold',
      'Qualité de lives en HD',
      'Lives privés réservés aux followers',
      'Accès au dashboard des soutiens et des retraits',
    ],
  },
];

const PAGE_VERIFICATION = {
  id: 'page_verification',
  name: 'Vérification Page Pro',
  monthly: 25,
  text: 'Vérification premium pour Pages Pro : plus de visibilité, plus de crédibilité, badge de vérification et accès aux meilleurs profils.',
  features: [
    'Badge de vérification officiel sur la page',
    'Jusqu’à 10 fois plus de visibilité dans Discover et les recommandations',
    'Crédibilité renforcée auprès des talents et partenaires',
    'Accès prioritaire aux meilleurs profils du réseau',
  ],
};

/** premium-plans.html : 40 $/mois ou 384 $/an. */
const ELITE = {
  id: 'elite',
  name: 'Elite',
  prices: { monthly: 40, annual: 384 },
  features: ['Recherche illimitée par domaine', 'Profils certifiés uniquement', 'Contact direct illimité', 'Filtres avancés du Momentum Engine', 'Support prioritaire 24/7'],
};

const FAQ = [
  ['Comment fonctionne la monétisation ?', 'Un abonnement Medium ou Pro actif permet de recevoir des soutiens dès son activation, sans seuil d’abonnés. Le bouton apparaît sur le profil et les contenus éligibles.'],
  ['Quelle commission prend XERA1 ?', 'XERA1 prélève une commission de 25 % sur chaque soutien confirmé. Vous recevez 75 % du montant, avant les éventuels frais du prestataire de paiement. Par exemple, pour un soutien de 10 $, votre part est de 7,50 $.'],
  ['Puis-je changer de plan à tout moment ?', 'Oui, vous pouvez upgrader ou downgrader votre plan à tout moment. Si vous passez à un plan supérieur, vous serez facturé au prorata. Si vous downgradez, le changement prendra effet à la fin de votre période de facturation actuelle.'],
  ['Comment sont payés les revenus ?', 'Les revenus sont versés par Mobile Money (Airtel Money, Orange Money, M-Pesa). Les revenus des soutiens sont disponibles immédiatement, tandis que les revenus vidéo sont calculés et payés mensuellement.'],
  ['Faut-il un nombre minimum d’abonnés pour recevoir des soutiens ?', 'Non. Un abonnement Medium ou Pro actif suffit pour recevoir des soutiens. Les revenus déjà crédités restent consultables dans votre dashboard.'],
];

const usd = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
const price = (monthly, cycle) => (cycle === 'annual' ? monthly * 12 * (1 - ANNUAL_DISCOUNT) : monthly);

export default function Plans() {
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState('monthly');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(0);
  const currentPlan = isPlanActive(user) ? String(user?.plan || '').toLowerCase() : '';

  async function choose(plan, billing = cycle) {
    if (!user) return navigate(`/connexion?redirect=${encodeURIComponent('/abonnements')}`);
    setBusy(plan.id);
    try {
      await openSubscription({
        planId: plan.id,
        planName: plan.name,
        billingCycle: billing,
        userId: user.id,
        discountCode: code.trim(),
        onSuccess: () => toast('success', 'Abonnement activé', `Bienvenue dans le plan ${plan.name} !`),
      });
    } catch (error) {
      toast('error', 'Paiement indisponible', error.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <TopBar back title="Abonnements" />
      <main className="main main--wide">
        <section className="plans-hero">
          <div>
            <span className="eyebrow">XERA1 Premium</span>
            <h1>Faites décoller votre visibilité.</h1>
            <p>Badge vérifié, soutiens de la communauté, visibilité multipliée dans le feed et lives HD.</p>
            <ul className="plans-trust">
              <li><Icon name="shield" size={18} /> Paiement sécurisé</li>
              <li><Icon name="receipt_long" size={18} /> Facturation claire</li>
              <li><Icon name="tune" size={18} /> Gestion depuis ton profil</li>
            </ul>
          </div>
          <Art name="payment" size={210} />
        </section>

        {currentPlan && (
          <div className="form-note" style={{ marginBottom: 16 }}>
            <Icon name="check_circle" />
            <span>
              Votre plan actuel : <strong style={{ color: 'var(--text)' }}>{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</strong>
              {user?.plan_ends_at ? ` — jusqu’au ${new Date(user.plan_ends_at).toLocaleDateString('fr-FR')}` : ''}
            </span>
          </div>
        )}

        <div className="plans-toolbar">
          <div className="tabs" role="tablist" style={{ maxWidth: 320 }}>
            <button role="tab" aria-selected={cycle === 'monthly'} className={`tab${cycle === 'monthly' ? ' is-active' : ''}`} onClick={() => setCycle('monthly')}>
              Mensuel
            </button>
            <button role="tab" aria-selected={cycle === 'annual'} className={`tab${cycle === 'annual' ? ' is-active' : ''}`} onClick={() => setCycle('annual')}>
              Annuel <span className="save-pill">−20 %</span>
            </button>
          </div>
          <div className="input-wrap plans-code">
            <Icon name="sell" />
            <input className="input" placeholder="Code promo (facultatif)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code promo" />
          </div>
        </div>

        <div className="plans-grid">
          {PLANS.map((p) => {
            const amount = price(p.monthly, cycle);
            const isCurrent = currentPlan === p.id;
            return (
              <article key={p.id} className={`plan-card${p.featured ? ' is-featured' : ''}`}>
                {p.tag && <span className="plan-tag">{p.tag}</span>}
                <span className={`plan-icon plan-icon--${p.id}`}>
                  <Icon name={p.icon} filled />
                </span>
                <h2>{p.name}</h2>
                <p className="muted">{p.text}</p>
                <div className="plan-price">
                  <strong>{usd(amount)}</strong>
                  <span>/ {cycle === 'annual' ? 'an' : 'mois'}</span>
                </div>
                {cycle === 'annual' && <span className="plan-save">Soit {usd(amount / 12)} / mois · économie de {usd(p.monthly * 12 - amount)}</span>}
                <Button variant={p.featured ? 'primary' : undefined} block loading={busy === p.id} disabled={isCurrent} onClick={() => choose(p)}>
                  {isCurrent ? 'Plan actuel' : `Choisir ${p.name}`}
                </Button>
                <ul className="plan-features">
                  {p.features.map((f) => (
                    <li key={f}>
                      <Icon name="check" size={18} />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="section-title">
          <h2>Pour les recruteurs et les organisations</h2>
        </div>
        <div className="plans-grid plans-grid--two">
          <article className="plan-card plan-card--elite">
            <span className="plan-tag">Talent Explorer</span>
            <span className="plan-icon plan-icon--elite">
              <Icon name="travel_explore" />
            </span>
            <h2>Elite</h2>
            <p className="muted">Recrutez les meilleurs talents : accès illimité à la base certifiée XERA1 et au moteur de recherche Elite.</p>
            <div className="plan-price">
              <strong>{usd(ELITE.prices[cycle])}</strong>
              <span>/ {cycle === 'annual' ? 'an' : 'mois'}</span>
            </div>
            <Button block loading={busy === 'elite'} disabled={currentPlan === 'elite'} onClick={() => choose(ELITE, cycle)}>
              {currentPlan === 'elite' ? 'Plan actuel' : 'Choisir Elite'}
            </Button>
            <ul className="plan-features">
              {ELITE.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={18} />
                  {f}
                </li>
              ))}
            </ul>
          </article>
          <article className="plan-card">
            <span className="plan-tag">Nouveau</span>
            <span className="plan-icon plan-icon--page">
              <Icon name="domain_verification" />
            </span>
            <h2>{PAGE_VERIFICATION.name}</h2>
            <p className="muted">{PAGE_VERIFICATION.text}</p>
            <div className="plan-price">
              <strong>{usd(price(PAGE_VERIFICATION.monthly, cycle))}</strong>
              <span>/ {cycle === 'annual' ? 'an' : 'mois'}</span>
            </div>
            <Button block loading={busy === PAGE_VERIFICATION.id} onClick={() => choose(PAGE_VERIFICATION)}>
              Payer la vérification
            </Button>
            <ul className="plan-features">
              {PAGE_VERIFICATION.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={18} />
                  {f}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="section-title">
          <h2>Questions fréquentes</h2>
        </div>
        <div className="card faq">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`faq-item${open === i ? ' is-open' : ''}`}>
              <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{q}</span>
                <Icon name="expand_more" />
              </button>
              <div className="faq-a">
                <p>{a}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: 'center' }}>
          Paiement par Mobile Money (Airtel Money, Orange Money, M-Pesa). <Link to="/reglages" style={{ textDecoration: 'underline' }}>Gérer mon compte</Link>
        </p>
      </main>
    </>
  );
}

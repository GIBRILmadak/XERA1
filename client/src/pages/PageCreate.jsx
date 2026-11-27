import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import MediaPicker from '../components/MediaPicker';
import { Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { CTA_OBJECTIVES, buildSlug, createPage, isNameAvailable } from '../services/pages';

const INDUSTRIES = ['Technologie', 'Logiciel', 'Design', 'Éducation', 'Santé', 'Agriculture', 'Énergie', 'Finance', 'Commerce', 'Médias', 'ONG', 'Communauté', 'Industrie', 'Transport'];

const STEPS = [
  { icon: 'apartment', title: 'Nom de votre page', desc: 'Choisissez un nom qui représente votre marque ou organisation officielle.' },
  { icon: 'sell', title: 'Secteurs d’activité', desc: 'Jusqu’à 3 secteurs pour être trouvé par les bons talents.' },
  { icon: 'notes', title: 'Mission et description', desc: 'Racontez votre histoire et vos objectifs stratégiques.' },
  { icon: 'image', title: 'Logo et bannière', desc: 'L’identité visuelle qui s’affichera partout sur XERA1.' },
  { icon: 'bolt', title: 'Ce que vous recherchez', desc: 'Compétences ou technologies : elles servent à vous recommander des profils.' },
  { icon: 'ads_click', title: 'Action principale', desc: 'Un bouton qui ouvre un lien, appelle un numéro ou recueille des demandes.' },
];

export default function PageCreate() {
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({ name: '', industries: [], bio: '', description: '', location: '', logo: null, banner: null, needs: [], need: '', websiteUrl: '', ctaLabel: 'Visiter le site', ctaObjective: 'sales', ctaUrl: '' });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  async function next() {
    if (step === 0) {
      if (d.name.trim().length < 2 || !buildSlug(d.name)) return toast('error', 'Nom requis', 'Donnez un nom à votre page.');
      setBusy(true);
      const ok = await isNameAvailable(d.name).catch(() => true);
      setBusy(false);
      if (!ok) return toast('error', 'Nom déjà pris', 'Choisissez un autre nom.');
    }
    if (step === 2 && !d.description.trim()) return toast('error', 'Description requise', 'Décrivez votre organisation en quelques lignes.');
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    try {
      const page = await createPage(user.id, {
        name: d.name,
        industries: d.industries,
        bio: d.bio,
        description: d.description,
        location: d.location,
        avatarUrl: d.logo?.url,
        bannerUrl: d.banner?.url,
        hiringNeeds: d.needs,
        talentInterests: d.needs,
        websiteUrl: d.websiteUrl,
        ctaLabel: d.ctaLabel,
        ctaObjective: d.ctaObjective,
        ctaUrl: d.ctaUrl,
      });
      toast('success', 'Page créée', `Bienvenue sur la page ${page.name} !`);
      navigate(`/page/${page.slug}`, { replace: true });
    } catch (e) {
      toast('error', 'Création impossible', e.message);
      setBusy(false);
    }
  }

  function addNeed() {
    const v = d.need.trim();
    if (!v || d.needs.includes(v) || d.needs.length >= 12) return;
    setD((x) => ({ ...x, needs: [...x.needs, v], need: '' }));
  }

  const s = STEPS[step];
  return (
    <>
      <TopBar back title="Créer une page pro" />
      <main className="main">
        <div className="wizard-progress" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>
        {step === 0 && (
          <div className="wizard-hero">
            <Art name="community" size={170} />
            <p className="muted">Déployez votre entité professionnelle et commencez à recruter ou à collaborer.</p>
          </div>
        )}
        <section className="card card--pad stack wizard-step" key={step}>
          <span className="wizard-icon">
            <Icon name={s.icon} />
          </span>
          <div>
            <span className="eyebrow">
              Étape {step + 1} / {STEPS.length}
            </span>
            <h2 style={{ fontSize: 20, marginTop: 4 }}>{s.title}</h2>
            <p className="muted" style={{ fontSize: 14 }}>{s.desc}</p>
          </div>

          {step === 0 && (
            <>
              <input className="input" placeholder="Ex. Studio Lumbi" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoFocus aria-label="Nom de la page" />
              {d.name && <span className="hint">Adresse : xera1.xyz/page/{buildSlug(d.name)}</span>}
              <input className="input" placeholder="Ville, pays (facultatif)" value={d.location} onChange={(e) => set('location', e.target.value)} maxLength={80} aria-label="Localisation" />
            </>
          )}

          {step === 1 && (
            <div className="chip-wrap">
              {INDUSTRIES.map((ind) => {
                const on = d.industries.includes(ind);
                return (
                  <button
                    key={ind}
                    type="button"
                    className={`chip${on ? ' is-active' : ''}`}
                    onClick={() => set('industries', on ? d.industries.filter((x) => x !== ind) : d.industries.length < 3 ? [...d.industries, ind] : d.industries)}
                  >
                    {on && <Icon name="check" />}
                    {ind}
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <>
              <input className="input" placeholder="Slogan (facultatif)" value={d.bio} onChange={(e) => set('bio', e.target.value)} maxLength={140} aria-label="Slogan" />
              <textarea className="textarea" placeholder="Votre mission, vos réalisations, ce que vous construisez…" value={d.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} aria-label="Description" />
            </>
          )}

          {step === 3 && (
            <div className="stack">
              <div className="field">
                <span className="field-label">Logo officiel</span>
                <MediaPicker value={d.logo} onChange={(v) => set('logo', v)} folder="pages" label="Importer le logo" />
              </div>
              <div className="field">
                <span className="field-label">Bannière</span>
                <MediaPicker value={d.banner} onChange={(v) => set('banner', v)} folder="pages" label="Importer la bannière" />
              </div>
            </div>
          )}

          {step === 4 && (
            <>
              <div className="row">
                <input
                  className="input"
                  placeholder="Ex. React, Design mobile, Comptabilité"
                  value={d.need}
                  onChange={(e) => set('need', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNeed();
                    }
                  }}
                  aria-label="Compétence recherchée"
                />
                <Button type="button" icon="add" onClick={addNeed}>Ajouter</Button>
              </div>
              <div className="chip-wrap">
                {d.needs.map((n) => (
                  <button key={n} type="button" className="chip is-active" onClick={() => set('needs', d.needs.filter((x) => x !== n))}>
                    {n} <Icon name="close" />
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <input className="input" placeholder="Site web (ex. monentreprise.com)" value={d.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} aria-label="Site web" />
              <input className="input" placeholder="Texte du bouton" value={d.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} maxLength={40} aria-label="Texte du bouton" />
              <select className="select" value={d.ctaObjective} onChange={(e) => set('ctaObjective', e.target.value)} aria-label="Objectif">
                {CTA_OBJECTIVES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input className="input" placeholder="Lien ou numéro de téléphone (sinon le site web)" value={d.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} aria-label="Lien ou numéro" />
            </>
          )}

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Button type="button" variant="ghost" icon="arrow_back" onClick={() => (step ? setStep(step - 1) : navigate(-1))}>
              {step ? 'Retour' : 'Annuler'}
            </Button>
            <Button variant="primary" loading={busy} onClick={next}>
              {step === STEPS.length - 1 ? 'Créer la page' : 'Continuer'}
              {step < STEPS.length - 1 && <Icon name="arrow_forward" />}
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}

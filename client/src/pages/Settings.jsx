import { useEffect, useState } from 'react';
import { getMyPages } from '../services/pages';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import { Avatar } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';

/** Pages encore servies par l'ancienne interface (migration progressive). */
const LEGACY = [{ to: '/live/nouveau', icon: 'sensors', title: 'Lancer un live', sub: 'Diffuser votre travail en direct' }];

/** Lien vers la page pro de l'utilisateur, ou vers la création s'il n'en a pas. */
function ProPageRow({ userId }) {
  const [page, setPage] = useState(undefined);
  useEffect(() => {
    getMyPages(userId).then((list) => setPage(list[0] || null)).catch(() => setPage(null));
  }, [userId]);
  return page ? (
    <Row to={`/page/${page.slug || page.id}`} icon="apartment" title={page.name} sub="Gérer ma page professionnelle" />
  ) : (
    <Row to="/pages/nouvelle" icon="apartment" title="Créer une page pro" sub="La page de votre entreprise ou organisation" />
  );
}

function Row({ to, href, icon, title, sub, onClick, trailing, danger }) {
  const content = (
    <>
      <span className="lead-icon" style={danger ? { color: 'var(--failure)' } : undefined}>
        <Icon name={icon} />
      </span>
      <span className="grow">
        <span className="title" style={{ display: 'block', color: danger ? 'var(--failure)' : undefined }}>{title}</span>
        {sub && <span className="sub">{sub}</span>}
      </span>
      {trailing ?? <Icon name={href ? 'open_in_new' : 'chevron_right'} />}
    </>
  );
  if (to) return <Link to={to} className="list-item">{content}</Link>;
  if (href) return <a href={href} className="list-item">{content}</a>;
  return (
    <button type="button" className="list-item" onClick={onClick}>
      {content}
    </button>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useUi();
  const navigate = useNavigate();

  return (
    <>
      <TopBar back title="Réglages" />
      <main className="main">
        {user && (
          <Link to={`/u/${user.id}`} className="card list-item" style={{ padding: 16, marginBottom: 14 }}>
            <Avatar user={user} size={54} />
            <span className="grow">
              <span className="title" style={{ display: 'block', fontSize: 16 }}>{user.name || 'Mon profil'}</span>
              <span className="sub">{user.email}</span>
            </span>
            <Icon name="chevron_right" />
          </Link>
        )}

        <section className="card settings-group">
          <h2>Apparence</h2>
          <Row
            icon={theme === 'light' ? 'light_mode' : 'dark_mode'}
            title="Thème sombre"
            sub="Le noir profond d’origine de XERA"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            trailing={<span className={`switch${theme !== 'light' ? ' is-on' : ''}`} role="switch" aria-checked={theme !== 'light'} />}
          />
        </section>

        <section className="card settings-group">
          <h2>Challenge & partenaires</h2>
          <Row to="/fata" icon="emoji_events" title="Challenge Fata" sub="Compte relié, ARC et étapes" />
          <Row to="/abonnements" icon="workspace_premium" title="Abonnements XERA" sub="Standard, Medium, Pro, Elite" />
          <Row to="/espace-createur" icon="account_balance_wallet" title="Espace créateur" sub="Soutiens, portefeuille et retraits" />
          {user && <ProPageRow userId={user.id} />}
          <Row to="/partenaires" icon="handshake" title="Console partenaire" sub="Commissions et code de réduction" />
          <Row to="/talents" icon="person_search" title="Talent Explorer" sub="Les profils classés par élan" />
          <Row to="/statistiques" icon="insights" title="Statistiques" sub="Score d’élan, activité, analyse du compte" />
          <Row to="/abonnements" icon="verified" title="Vérification du compte" sub="Badge vérifié bleu ou Gold" />
        </section>

        {user && (
          <section className="card settings-group">
            <h2>Créateur & compte</h2>
            {LEGACY.map((item) => (
              <Row key={item.to || item.href} {...item} />
            ))}
          </section>
        )}

        <section className="card settings-group">
          <h2>Informations</h2>
          <Row to="/credits" icon="favorite" title="Remerciements" sub="Ceux grâce à qui XERA1 existe" />
          <Row href="/cgu" icon="gavel" title="Conditions d’utilisation" />
          <Row href="/privacy" icon="shield_person" title="Confidentialité" />
        </section>

        {user && (
          <section className="card settings-group">
            <Row
              icon="logout"
              title="Se déconnecter"
              danger
              trailing={false}
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            />
          </section>
        )}
        <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 20 }}>XERA1 · Proof of Building</p>
      </main>
    </>
  );
}

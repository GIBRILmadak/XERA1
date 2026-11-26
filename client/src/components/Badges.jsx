import { useEffect, useState } from 'react';
import {
  ambassadorBadge,
  contributorBadge,
  fataBadge,
  getBadgeSets,
  loadBadgeSets,
  planBadge,
  roleBadge,
  subscribeBadgeSets,
  verificationBadge,
} from '../services/badges';

export function useBadgeSets() {
  const [sets, setSets] = useState(getBadgeSets);
  useEffect(() => {
    const unsubscribe = subscribeBadgeSets(setSets);
    // Les listes ont pu arriver entre le premier rendu et l'abonnement.
    loadBadgeSets().then(() => setSets(getBadgeSets()));
    return unsubscribe;
  }, []);
  return sets;
}

/** Badges collés au nom : vérification (ou ambassadeur) + Fata, comme avant. */
export function NameBadges({ user, size = 16 }) {
  const sets = useBadgeSets();
  const fata = fataBadge(user, sets);
  // Comme renderUsernameWithBadge : l'ambassadeur n'apparaît que sans autre badge.
  const verified = verificationBadge(user, sets) || (!fata ? ambassadorBadge(user) : null);
  if (!verified && !fata) return null;
  return (
    <span className="name-badges">
      {verified && <img src={verified.src} alt={verified.alt} title={verified.alt} style={{ width: size, height: size }} />}
      {fata && <img src={fata.src} alt={fata.alt} title={fata.alt} className="fata-mark" style={{ width: size, height: size }} />}
    </span>
  );
}

/** Ligne de badges du profil : rôle, plan, palier contributeur. */
export function ProfileBadges({ user, contentCount = 0, followers = 0 }) {
  const role = roleBadge(user);
  const plan = planBadge(user);
  const tier = contributorBadge(contentCount, followers);
  if (!role && !plan && !tier) return null;
  return (
    <div className="profile-badges">
      {role && (
        <span className={`profile-chip profile-chip--${role.role}`} title={`Type de compte : ${role.label}`}>
          <img src={role.src} alt="" />
          {role.label}
        </span>
      )}
      {plan && (
        <span className={`profile-chip plan-chip plan-chip--${plan.tone}`}>
          {plan.name}
        </span>
      )}
      {tier && (
        <span className={`profile-chip tier-chip tier-chip--${tier.key}`} title={`${tier.label} : créateur actif de contenu`}>
          <span aria-hidden="true">{tier.emoji}</span>
          {tier.label}
        </span>
      )}
    </div>
  );
}

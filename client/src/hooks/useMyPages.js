import { useEffect, useState } from 'react';
import { getMyPages } from '../services/pages';

// Une seule requête par utilisateur, partagée par toutes les cartes affichées.
const cache = new Map();

/** Pages pro possédées par l'utilisateur connecté (pour le sceau de validation). */
export function useMyPages(userId) {
  const [pages, setPages] = useState(() => (userId && Array.isArray(cache.get(userId)) ? cache.get(userId) : []));
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    const hit = cache.get(userId);
    const p = hit instanceof Promise ? hit : Array.isArray(hit) ? Promise.resolve(hit) : getMyPages(userId).catch(() => []);
    if (!hit) cache.set(userId, p);
    p.then((list) => {
      cache.set(userId, list);
      if (alive) setPages(list);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return pages;
}

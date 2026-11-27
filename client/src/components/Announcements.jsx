import { useEffect, useState } from 'react';
import Icon from './Icon';
import { supabase } from '../services/supabase';
import { DEMO } from '../services/demo';

const KEY = 'xera-hidden-announcements';
const hidden = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
};

/** Annonces officielles (admin_announcements) en haut du fil, masquables par l'utilisateur. */
export default function Announcements() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (DEMO) return;
    supabase
      .from('admin_announcements')
      .select('id, title, body, is_pinned, created_at')
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        const h = hidden();
        setItems((data || []).filter((a) => !h.has(a.id)));
      });
  }, []);
  function dismiss(id) {
    const h = hidden();
    h.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...h].slice(-50)));
    } catch {
      /* préférence non mémorisée */
    }
    setItems((list) => list.filter((a) => a.id !== id));
  }
  return items.map((a) => (
    <section key={a.id} className="announcement card">
      <span className="announcement-icon"><Icon name="campaign" filled /></span>
      <div className="grow">
        <span className="eyebrow">Annonce XERA1</span>
        <strong>{a.title}</strong>
        <p>{a.body}</p>
      </div>
      <button className="icon-btn" onClick={() => dismiss(a.id)} aria-label="Masquer l’annonce"><Icon name="close" /></button>
    </section>
  ));
}

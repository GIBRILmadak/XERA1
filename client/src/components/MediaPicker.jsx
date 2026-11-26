import { useRef, useState } from 'react';
import Icon from './Icon';
import { IconButton } from './ui';
import { uploadMedia } from '../services/data';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';

/** Choix d'une image/vidéo, envoi vers Supabase Storage et aperçu. */
export default function MediaPicker({ value, onChange, folder = 'content', label = 'Ajouter une photo ou une vidéo' }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function handle(file) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadMedia(user.id, file, folder));
    } catch (error) {
      toast('error', 'Envoi impossible', error.message);
    } finally {
      setBusy(false);
    }
  }

  if (value?.url) {
    return (
      <div className="media-preview">
        {value.type === 'video' ? <video src={value.url} controls playsInline /> : <img src={value.url} alt="Aperçu" />}
        <IconButton icon="close" label="Retirer le média" onClick={() => onChange(null)} type="button" />
      </div>
    );
  }

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files?.[0]);
      }}
    >
      {busy ? <span className="spinner" style={{ width: 30, height: 30 }} /> : <Icon name="add_photo_alternate" />}
      <strong>{busy ? 'Envoi en cours…' : label}</strong>
      <span style={{ fontSize: 12.5 }}>JPG, PNG, WebP, GIF ou vidéo</span>
      <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}

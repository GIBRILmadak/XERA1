import { useEffect, useState } from 'react';
import Icon from './Icon';

/** Visionneuse plein écran (photo ou vidéo), zoom au clic, Échap pour fermer. */
export default function MediaViewer({ src, type = 'image', alt = '', onClose }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!src) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={alt || 'Média'} onClick={onClose}>
      <button className="viewer-close" onClick={onClose} aria-label="Fermer">
        <Icon name="close" />
      </button>
      {type === 'video' ? (
        <video src={src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
      ) : (
        <img
          src={src}
          alt={alt}
          className={zoom ? 'is-zoom' : ''}
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => !z);
          }}
        />
      )}
      <a className="viewer-open" href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        <Icon name="open_in_new" size={18} /> Ouvrir l’original
      </a>
    </div>
  );
}

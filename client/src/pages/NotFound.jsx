import Navbar from '../components/Navbar';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <>
      <Navbar />
      <div className="not-found-container" style={{ textAlign: 'center', padding: '6rem 2rem' }}>
        <h1 style={{ fontSize: '6rem', fontWeight: 800, color: 'var(--accent)' }}>404</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Cette page n'existe pas ou a été déplacée.
        </p>
        <Link to="/" className="btn-hero-primary">← Retour à l'accueil</Link>
      </div>
    </>
  );
}

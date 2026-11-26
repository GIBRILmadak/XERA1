import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Brand } from '../components/Shell';
import { Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { AUTH_RETURN_BASE, signIn, signInWithGoogle, signUp, supabase } from '../services/supabase';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login() {
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect')?.startsWith('/') ? params.get('redirect') : '/';
  const [mode, setMode] = useState(params.get('mode') === 'inscription' ? 'signup' : params.get('mode') === 'nouveau' ? 'newpass' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  if (user && mode !== 'newpass') return <Navigate to={redirect} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'newpass') {
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) throw new Error('8 caractères minimum, avec une majuscule, une minuscule et un chiffre.');
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        toast('success', 'Mot de passe modifié', 'Vous êtes connecté.');
        navigate('/', { replace: true });
        return;
      }
      if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${AUTH_RETURN_BASE}/connexion?mode=nouveau` });
        if (err) throw err;
        setSent(true);
        return;
      }
      const res = mode === 'login' ? await signIn(email, password) : await signUp(email, password, username);
      if (!res.success) throw new Error(res.error);
      if (mode === 'signup' && !res.session) {
        setSent(true);
        return;
      }
      toast('success', mode === 'login' ? 'Bon retour sur XERA' : 'Bienvenue sur XERA');
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const { error: err } = await signInWithGoogle();
    if (err) setError('Connexion Google indisponible.');
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        {sent ? (
          <div className="card card--pad stack" style={{ textAlign: 'center', justifyItems: 'center' }}>
            <span className="lead-icon" style={{ width: 60, height: 60, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--success-soft)', color: 'var(--success)' }}>
              <Icon name="mark_email_read" size={30} />
            </span>
            <h1 style={{ fontSize: 22 }}>Vérifiez vos e-mails</h1>
            <p className="muted">
              {mode === 'reset' ? 'Un lien pour choisir un nouveau mot de passe' : 'Un lien de confirmation'} a été envoyé à <strong>{email}</strong>.
            </p>
            <Button variant="ghost" onClick={() => { setSent(false); setMode('login'); }}>
              Retour à la connexion
            </Button>
          </div>
        ) : (
          <>
            <div>
              <h1>{mode === 'login' ? 'Bon retour' : mode === 'signup' ? 'Rejoignez XERA' : mode === 'newpass' ? 'Nouveau mot de passe' : 'Mot de passe oublié'}</h1>
              <p className="lead" style={{ marginTop: 6 }}>
                {mode === 'reset' ? 'Recevez un lien pour le réinitialiser.' : mode === 'newpass' ? 'Choisissez votre nouveau mot de passe.' : 'Montrez ce que vous construisez, jour après jour.'}
              </p>
            </div>

            {(mode === 'login' || mode === 'signup') && (
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab${mode === 'login' ? ' is-active' : ''}`} onClick={() => setMode('login')}>
                  Connexion
                </button>
                <button type="button" role="tab" aria-selected={mode === 'signup'} className={`tab${mode === 'signup' ? ' is-active' : ''}`} onClick={() => setMode('signup')}>
                  Inscription
                </button>
              </div>
            )}

            {(mode === 'login' || mode === 'signup') && (
              <>
                <Button className="google-btn" size="lg" block type="button" onClick={google}>
                  <GoogleLogo />
                  Continuer avec Google
                </Button>
                <div className="or">ou avec un e-mail</div>
              </>
            )}

            <form className="stack" onSubmit={submit}>
              {mode === 'signup' && (
                <div className="input-wrap">
                  <Icon name="alternate_email" />
                  <input className="input" placeholder="Nom d’utilisateur" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} aria-label="Nom d’utilisateur" />
                </div>
              )}
              {mode !== 'newpass' && (
              <div className="input-wrap">
                <Icon name="mail" />
                <input className="input" type="email" placeholder="Adresse e-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Adresse e-mail" />
              </div>
              )}
              {mode !== 'reset' && (
                <div className="input-wrap">
                  <Icon name="lock" />
                  <input
                    className="input"
                    type={show ? 'text' : 'password'}
                    placeholder="Mot de passe"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    aria-label="Mot de passe"
                  />
                  <span className="trailing">
                    <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                      <Icon name={show ? 'visibility_off' : 'visibility'} />
                    </button>
                  </span>
                </div>
              )}
              {(mode === 'signup' || mode === 'newpass') && <p className="muted" style={{ fontSize: 12.5 }}>8 caractères minimum, avec une majuscule, une minuscule et un chiffre.</p>}
              {error && (
                <div className="form-error">
                  <Icon name="error" />
                  <span>{error}</span>
                </div>
              )}
              <Button variant="primary" size="lg" block loading={busy}>
                {mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : mode === 'newpass' ? 'Enregistrer' : 'Envoyer le lien'}
              </Button>
            </form>
            <div style={{ textAlign: 'center' }}>
              {mode === 'login' ? (
                <button type="button" className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} onClick={() => setMode('reset')}>
                  Mot de passe oublié ?
                </button>
              ) : mode === 'reset' || mode === 'newpass' ? (
                <button type="button" className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} onClick={() => setMode('login')}>
                  Retour à la connexion
                </button>
              ) : (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  En continuant, vous acceptez les <a href="/cgu" style={{ textDecoration: 'underline' }}>conditions</a> et la <a href="/privacy" style={{ textDecoration: 'underline' }}>politique de confidentialité</a>.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

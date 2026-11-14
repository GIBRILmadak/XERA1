import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/useAuth';
import { signIn, signUp, signInWithGoogle, supabase } from '../services/supabase';

const ACCOUNT_TYPES = ['Personnel', 'Communauté', 'Entreprise'];
const SUBTYPES = {
  Personnel: ['Freelance', 'Étudiant', 'Salarié', 'Entrepreneur'],
  Communauté: ['Association', 'Collectif', 'ONG', 'Club'],
  Entreprise: ['Startup', 'PME', 'Grande entreprise', 'Institution'],
};

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(false);
  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState('');
  const [accountSubtype, setAccountSubtype] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Handle OAuth callback
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') navigate('/', { replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (isSignup) {
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        setLoading(false);
        return;
      }
      const result = await signUp(email, password, username, { account_type: accountType, account_subtype: accountSubtype });
      if (result.success) {
        setSuccess('Compte créé ! Vérifiez votre email pour confirmer votre inscription.');
      } else {
        setError(result.error);
      }
    } else {
      const result = await signIn(email, password);
      if (result.success) {
        localStorage.setItem('rize-remember-me', rememberMe ? 'true' : 'false');
        navigate('/', { replace: true });
      } else {
        setError(result.error);
      }
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError('');
    await signInWithGoogle();
  }

  function toggleMode() {
    setIsSignup((v) => !v);
    setStep(0);
    setError('');
    setSuccess('');
  }

  // Signup wizard step 1: choose account type
  if (isSignup && step === 0) {
    return (
      <>
        <Navbar />
        <div className="login-container">
          <div className="login-left"><LoginHero /></div>
          <div className="login-right">
            <div className="login-form-container">
              <div className="login-form-header">
                <h2 id="form-title">Créer un compte</h2>
                <p id="form-subtitle">Choisissez votre profil</p>
              </div>
              <div className="account-type-options">
                {ACCOUNT_TYPES.map((type) => (
                  <div key={type} className="account-option" onClick={() => { setAccountType(type); setStep(1); }}>
                    <img src={`/icons/${type === 'Personnel' ? 'impact' : type === 'Communauté' ? 'team' : 'enterprise'}.svg`} alt={type} />
                    <span>{type}</span>
                  </div>
                ))}
              </div>
              <div className="login-toggle">
                <p id="toggle-text">Déjà un compte ?</p>
                <a href="#" id="toggle-link" onClick={(e) => { e.preventDefault(); toggleMode(); }}>Se connecter</a>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Signup wizard step 2: choose subtype
  if (isSignup && step === 1) {
    return (
      <>
        <Navbar />
        <div className="login-container">
          <div className="login-left"><LoginHero /></div>
          <div className="login-right">
            <div className="login-form-container">
              <div className="login-form-header">
                <h2 id="form-title">Précisez votre statut</h2>
              </div>
              <div className="subtype-options" id="subtype-options-container">
                {(SUBTYPES[accountType] || []).map((sub) => (
                  <div key={sub} className="account-option" onClick={() => { setAccountSubtype(sub); setStep(2); }}>
                    <span>{sub}</span>
                  </div>
                ))}
              </div>
              <div className="wizard-nav">
                <button type="button" className="btn-secondary" onClick={() => setStep(0)}>Retour</button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Login or signup credentials form
  return (
    <>
      <Navbar />
      <div className="login-container">
        <div className="login-left"><LoginHero /></div>
        <div className="login-right">
          <div className="login-form-container">
            <div className="login-form-header">
              <h2 id="form-title">{isSignup ? 'Finalisez votre compte' : 'Welcome to XERA'}</h2>
              <p id="form-subtitle">{isSignup ? `${accountType} • ${accountSubtype}` : 'Log in to continue'}</p>
            </div>

            {error && <div id="error-message" className="error-message">{error}</div>}
            {success && <div id="success-message" className="success-message">{success}</div>}

            <form id="auth-form" className="login-form" onSubmit={handleSubmit}>
              {isSignup && (
                <div className="form-group" id="username-group">
                  <label htmlFor="username">Nom d'utilisateur</label>
                  <input type="text" id="username" className="form-input" placeholder="Votre nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input type="email" id="email" className="form-input" placeholder="votre@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="form-group">
                <label htmlFor="password">Mot de passe</label>
                <div className="password-input-container">
                  <input type={showPw ? 'text' : 'password'} id="password" className="form-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className="password-toggle" id="password-toggle" onClick={() => setShowPw((v) => !v)}>
                    <svg className="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>

              {isSignup && (
                <div className="form-group" id="confirm-password-group">
                  <label htmlFor="confirm-password">Confirmer le mot de passe</label>
                  <div className="password-input-container">
                    <input type={showConfirmPw ? 'text' : 'password'} id="confirm-password" className="form-input" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    <button type="button" className="password-toggle" id="confirm-password-toggle" onClick={() => setShowConfirmPw((v) => !v)}>
                      <svg className="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {!isSignup && (
                <div className="form-row">
                  <div className="remember-me-container" id="remember-me-container">
                    <label className="remember-checkbox">
                      <input type="checkbox" id="remember-me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                      <span className="checkmark"></span>
                      Se souvenir de moi
                    </label>
                  </div>
                  <div className="forgot-password-link" id="forgot-password-link">
                    <a href="#" id="forgot-password">Mot de passe oublié ?</a>
                  </div>
                </div>
              )}

              <button type="submit" className="btn-submit" id="submit-btn" disabled={loading}>
                <span id="btn-text">{loading ? 'Chargement...' : isSignup ? 'Créer mon compte' : 'Se connecter'}</span>
              </button>
            </form>

            {isSignup && (
              <div className="wizard-nav" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Retour</button>
              </div>
            )}

            <div className="login-divider"><span>ou</span></div>

            <button type="button" className="btn-google" id="google-signin-btn" onClick={handleGoogle}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Continuer avec Google</span>
            </button>

            <div className="login-toggle">
              <p id="toggle-text">{isSignup ? 'Déjà un compte ?' : 'Pas encore de compte ?'}</p>
              <a href="#" id="toggle-link" onClick={(e) => { e.preventDefault(); toggleMode(); }}>
                {isSignup ? 'Se connecter' : 'Créer un compte'}
              </a>
            </div>

            <div className="login-footer">
              <Link to="/">← Retour à l'accueil</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function LoginHero() {
  return (
    <div className="login-hero">
      <div className="login-logo">
        <img src="/icons/logo.png" alt="XERA Logo" />
      </div>
      <h1>Documentez l'effort.</h1>
      <p>Rejoignez une communauté de builders qui partagent leur progression authentique, sans filtres.</p>
      <div className="login-features">
        <div className="feature-item">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Progression transparente</span>
        </div>
        <div className="feature-item">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Communauté authentique</span>
        </div>
        <div className="feature-item">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>Suivi jour par jour</span>
        </div>
      </div>
    </div>
  );
}

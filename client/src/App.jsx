import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UiProvider, useUi } from './contexts/UiContext';
import { handleNativeAuthCallback } from './services/supabase';
import Shell, { TopBar } from './components/Shell';
import { EmptyState } from './components/ui';
import Home from './pages/Home';
import Explore from './pages/Explore';
import ArcDetail from './pages/ArcDetail';
import Profile from './pages/Profile';
import Fata from './pages/Fata';
import CreateArc from './pages/CreateArc';
import CreateProof from './pages/CreateProof';
import { Conversation, Inbox } from './pages/Messages';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Plans from './pages/Plans';
import Credits from './pages/Credits';
import CreatorSpace from './pages/CreatorSpace';
import Analytics from './pages/Analytics';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="main" aria-busy="true" />;
  if (!user) return <Navigate to={`/connexion?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

/**
 * /profile est l'adresse d'entrée convenue avec Fata
 * (https://xera1.xyz/profile?fata=success&challengeId=…, contrat §3) :
 * avec un contexte Fata on ouvre le challenge, sinon le profil de l'utilisateur.
 */
function ProfileEntry() {
  const { user, loading } = useAuth();
  const { search } = useLocation();
  const { id } = useParams();
  const params = new URLSearchParams(search);
  if (params.get('fata') || params.get('challengeId')) return <Navigate to={`/fata${search}`} replace />;
  // Anciens liens partagés : /profile?user=…&arc=…
  if (params.get('arc')) return <Navigate to={`/arc/${encodeURIComponent(params.get('arc'))}`} replace />;
  const target = id || params.get('user') || params.get('id');
  if (target) return <Navigate to={`/u/${encodeURIComponent(target)}`} replace />;
  if (loading) return null;
  return <Navigate to={user ? `/u/${user.id}` : '/connexion?redirect=/profile'} replace />;
}

function NotFound() {
  return (
    <>
      <TopBar back title="Page introuvable" />
      <main className="main">
        <EmptyState icon="explore_off" title="Cette page n’existe pas" text="Le lien est peut-être ancien ou mal copié." action={<a className="btn btn--primary" href="/">Retour à l’accueil</a>} />
      </main>
    </>
  );
}

/** Retour de la connexion Google dans l'APK (com.xera.app://auth-callback). */
function NativeAuthReturn() {
  const navigate = useNavigate();
  const { toast } = useUi();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const handle = CapApp.addListener('appUrlOpen', async ({ url }) => {
      const res = await handleNativeAuthCallback(url);
      if (!res.handled) return;
      if (res.error) toast('error', 'Connexion Google impossible', res.error);
      else {
        toast('success', 'Bienvenue sur XERA');
        navigate('/', { replace: true });
      }
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [navigate, toast]);
  return null;
}

/** Bouton retour Android dans l'APK. */
function NativeBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const handle = CapApp.addListener('backButton', () => {
      if (location.pathname === '/') CapApp.exitApp();
      else navigate(-1);
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [navigate, location.pathname]);
  return null;
}

export default function App() {
  return (
    <UiProvider>
      <AuthProvider>
        <BrowserRouter>
          <NativeBackButton />
          <NativeAuthReturn />
          <Routes>
            <Route path="/connexion" element={<Login />} />
            <Route path="/login" element={<Navigate to="/connexion" replace />} />
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="explorer" element={<Explore />} />
              <Route path="arc/:id" element={<ArcDetail />} />
              <Route path="u/:id" element={<Profile />} />
              <Route path="profile" element={<ProfileEntry />} />
              <Route path="profile/:id" element={<ProfileEntry />} />
              <Route path="fata" element={<Fata />} />
              <Route path="creer/arc" element={<RequireAuth><CreateArc /></RequireAuth>} />
              <Route path="creer/preuve" element={<RequireAuth><CreateProof /></RequireAuth>} />
              <Route path="messages" element={<RequireAuth><Inbox /></RequireAuth>} />
              <Route path="messages/:id" element={<RequireAuth><Conversation /></RequireAuth>} />
              <Route path="notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
              <Route path="reglages" element={<Settings />} />
              <Route path="abonnements" element={<Plans />} />
              <Route path="credits" element={<Credits />} />
              <Route path="espace-createur" element={<RequireAuth><CreatorSpace /></RequireAuth>} />
              <Route path="creator-dashboard" element={<Navigate to="/espace-createur" replace />} />
              <Route path="statistiques" element={<RequireAuth><Analytics /></RequireAuth>} />
              <Route path="analytics" element={<Navigate to="/statistiques" replace />} />
              <Route path="verification" element={<Navigate to="/abonnements" replace />} />
              <Route path="subscription-plans" element={<Navigate to="/abonnements" replace />} />
              <Route path="premium-plans" element={<Navigate to="/abonnements" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </UiProvider>
  );
}

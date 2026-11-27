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
import Live from './pages/Live';
import LiveCreate from './pages/LiveCreate';
import ProPage from './pages/ProPage';
import PageCreate from './pages/PageCreate';
import Partners from './pages/Partners';
import Talents from './pages/Talents';
import Admin from './pages/Admin';

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

/** Anciens liens de live : /stream?id=… */
function LegacyStream() {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get('id');
  return <Navigate to={id ? `/live/${encodeURIComponent(id)}` : '/explorer'} replace />;
}

/** Anciens liens de pages pro : /pagepro?user=<id> ou /pagepro/<slug>. */
function LegacyProPage() {
  const { search } = useLocation();
  const { slug } = useParams();
  const params = new URLSearchParams(search);
  if (params.get('explorer') === '1') return <Navigate to="/talents" replace />;
  const target = slug || params.get('user') || params.get('id') || params.get('pro');
  return <Navigate to={target ? `/page/${encodeURIComponent(target)}` : '/explorer'} replace />;
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
              <Route path="live/nouveau" element={<RequireAuth><LiveCreate /></RequireAuth>} />
              <Route path="live/:id" element={<Live />} />
              <Route path="stream" element={<LegacyStream />} />
              <Route path="create-stream" element={<Navigate to="/live/nouveau" replace />} />
              <Route path="page/:slug" element={<ProPage />} />
              <Route path="pages/nouvelle" element={<RequireAuth><PageCreate /></RequireAuth>} />
              <Route path="pagepro" element={<LegacyProPage />} />
              <Route path="pagepro/:slug" element={<LegacyProPage />} />
              <Route path="partenaires" element={<RequireAuth><Partners /></RequireAuth>} />
              <Route path="commissions" element={<Navigate to="/partenaires" replace />} />
              <Route path="talents" element={<Talents />} />
              <Route path="admin" element={<RequireAuth><Admin /></RequireAuth>} />
              <Route path="badges-admin" element={<RequireAuth><Admin initialTab="badges" /></RequireAuth>} />
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

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import CreatorDashboard from './pages/CreatorDashboard';
import NotFound from './pages/NotFound';

// Global CSS
import '../public/css/style.css';
import '../public/css/search-notification.css';
import '../public/css/login.css';
import '../public/css/arcs.css';
import '../public/css/monetization.css';
import '../public/css/streaming-analytics.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/index.html" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login.html" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile.html" element={<Profile />} />
          <Route path="/pagepro" element={<Profile />} />
          <Route path="/pagepro.html" element={<Profile />} />
          <Route path="/stream" element={<LegacyPage src="/stream.html" />} />
          <Route path="/stream.html" element={<LegacyPage src="/stream.html" />} />
          <Route path="/subscription-plans" element={<LegacyPage src="/subscription-plans.html" />} />
          <Route path="/subscription-plans.html" element={<LegacyPage src="/subscription-plans.html" />} />
          <Route path="/verification" element={<LegacyPage src="/verification.html" />} />
          <Route path="/verification.html" element={<LegacyPage src="/verification.html" />} />
          <Route path="/credits" element={<LegacyPage src="/credits.html" />} />
          <Route path="/credits.html" element={<LegacyPage src="/credits.html" />} />

          {/* Protected routes */}
          <Route
            path="/creator-dashboard"
            element={
              <ProtectedRoute>
                <CreatorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/creator-dashboard.html"
            element={
              <ProtectedRoute>
                <CreatorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <LegacyPage src="/admin.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin.html"
            element={
              <ProtectedRoute>
                <LegacyPage src="/admin.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <LegacyPage src="/analytics.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics.html"
            element={
              <ProtectedRoute>
                <LegacyPage src="/analytics.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-stream"
            element={
              <ProtectedRoute>
                <LegacyPage src="/create-stream.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-stream.html"
            element={
              <ProtectedRoute>
                <LegacyPage src="/create-stream.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/badges-admin"
            element={
              <ProtectedRoute>
                <LegacyPage src="/badges-admin.html" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/badges-admin.html"
            element={
              <ProtectedRoute>
                <LegacyPage src="/badges-admin.html" />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

/**
 * Temporary wrapper for pages not yet migrated to React.
 * Uses an iframe to load the legacy HTML page.
 */
function LegacyPage({ src }) {
  return (
    <iframe
      src={src}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="XERA page"
    />
  );
}

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

/**
 * Redirects to /login if the user is not authenticated.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="xera-loading-screen">
        <div className="xera-spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

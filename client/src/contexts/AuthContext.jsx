import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase, isProUser, signOut as supabaseSignOut } from '../services/supabase';
import { DEMO, demoMe } from '../services/demo';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = chargement, null = déconnecté
  const [user, setUser] = useState(DEMO ? (new URLSearchParams(window.location.search).has('invite') ? null : demoMe) : undefined);

  const loadFullUser = useCallback(async (authUser) => {
    try {
      const { data: profile } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle();
      setUser(profile ? { ...authUser, ...profile, id: authUser.id } : authUser);
    } catch {
      setUser(authUser);
    }
  }, []);

  useEffect(() => {
    if (DEMO) return undefined;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadFullUser(session.user);
      else setUser(null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadFullUser(session.user);
      else setUser(null);
    });
    return () => subscription.unsubscribe();
  }, [loadFullUser]);

  useEffect(() => {
    // Compatibilité avec les pages historiques encore ouvertes dans l'appli.
    window.currentUser = user || null;
    window.currentUserId = user?.id || null;
  }, [user]);

  const refresh = useCallback(async () => {
    if (DEMO) return;
    const { data } = await supabase.auth.getUser();
    if (data?.user) await loadFullUser(data.user);
  }, [loadFullUser]);

  const signOut = useCallback(async () => {
    if (!DEMO) await supabaseSignOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading: user === undefined, isPro: isProUser(user), refresh, signOut, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

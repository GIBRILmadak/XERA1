import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isProUser } from '../services/supabase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.currentUser = user || null;
    window.currentUserId = user?.id || null;
  }, [user]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadFullUser(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadFullUser(session.user);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadFullUser(authUser) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      setUser(profile ? { ...authUser, ...profile } : authUser);
    } catch (_) {
      setUser(authUser);
    }
  }

  const isPro = () => isProUser(user);

  return (
    <AuthContext.Provider value={{ user, loading, isPro }}>
      {children}
    </AuthContext.Provider>
  );
}

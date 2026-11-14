import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_o7_j9WXXd96YKXa-fmfs1Q_OEwNTh1M";


const rememberMeRaw = localStorage.getItem("rize-remember-me");
const rememberMe = rememberMeRaw === null ? true : rememberMeRaw === "true";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: rememberMe ? window.localStorage : window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// =========================================================
//  AUTHENTIFICATION
// =========================================================

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const passwordPolicyOk = (password) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);

function buildAuthProfileData(user) {
  if (!user) return {};
  const emailPrefix = String(user?.email || "").split("@")[0] || "Utilisateur";
  const name =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.username ||
    emailPrefix;
  return {
    name,
    account_type: user?.user_metadata?.account_type || "personal",
    account_subtype: user?.user_metadata?.account_subtype || "personal",
    avatar: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null,
  };
}

export async function checkAuth() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (session) {
      const authUser = session.user;
      try {
        const { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();
        if (profile) return profile;
      } catch (_) {}

      // Fallback: upsert minimal profile then return auth user
      const profileData = buildAuthProfileData(authUser);
      await upsertUserProfile(authUser.id, profileData);
      return authUser;
    }
  } catch (e) {
    console.error("checkAuth error:", e);
  }
  return null;
}

export async function signIn(email, password) {
  const safeEmail = normalizeEmail(email);
  if (!isValidEmail(safeEmail)) return { success: false, error: "Adresse email invalide." };
  if (!password || password.length < 8) return { success: false, error: "Mot de passe invalide." };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: safeEmail, password });
    if (error) return { success: false, error: "Email ou mot de passe incorrect, ou compte non confirmé.", code: error.code };
    return { success: true, data: data.user, session: data.session };
  } catch (error) {
    return { success: false, error: "Erreur de connexion." };
  }
}

export async function signUp(email, password, username, metadata = {}) {
  const safeEmail = normalizeEmail(email);
  const safeUsername = String(username || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!isValidEmail(safeEmail)) return { success: false, error: "Adresse email invalide." };
  if (!safeUsername || safeUsername.length < 3) return { success: false, error: "Nom d'utilisateur invalide." };
  if (!passwordPolicyOk(password)) return { success: false, error: "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre." };
  try {
    const { data, error } = await supabase.auth.signUp({
      email: safeEmail,
      password,
      options: { data: { username: safeUsername, ...metadata }, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) return { success: false, error: "Impossible de créer le compte.", code: error.code };
    return { success: true, data: data.user, session: data.session };
  } catch (error) {
    return { success: false, error: "Erreur lors de l'inscription." };
  }
}

export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem("rize-remember-me");
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/` },
  });
}

// =========================================================
//  DATABASE
// =========================================================

export async function upsertUserProfile(userId, profileData) {
  try {
    const normalized = { ...profileData };
    if ('profilePreferences' in normalized) { normalized.profile_preferences = normalized.profilePreferences; delete normalized.profilePreferences; }
    if ('socialLinks' in normalized) { normalized.social_links = normalized.socialLinks; delete normalized.socialLinks; }
    const { data, error } = await supabase.from("users").upsert({ id: userId, ...normalized, updated_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserContent(userId) {
  try {
    const { data, error } = await supabase
      .from("content")
      .select("*, arcs(id,title,status,user_id,stage_level,opportunity_intents), projects(id,name)")
      .eq("user_id", userId)
      .order("day_number", { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getFollowerCount(userId) {
  try {
    const { count, error } = await supabase.from("followers").select("*", { count: "exact", head: true }).eq("following_id", userId);
    if (error) throw error;
    return count || 0;
  } catch (_) { return 0; }
}

export async function getFollowingCount(userId) {
  try {
    const { count, error } = await supabase.from("followers").select("*", { count: "exact", head: true }).eq("follower_id", userId);
    if (error) throw error;
    return count || 0;
  } catch (_) { return 0; }
}

// =========================================================
//  HELPERS - ACCOUNT TYPE
// =========================================================

const PRO_TYPES = ["community","enterprise","company","pro","communauté","entreprise","institution","organization","organisation","org","team","recruiter","investor","partner","professional"];

export function isProAccountType(accountType, accountSubtype) {
  const values = [accountType, accountSubtype].filter(Boolean).map((v) => String(v).trim().toLowerCase());
  return values.some((v) => PRO_TYPES.includes(v));
}

export function isProUser(user) {
  if (!user) return false;
  const type = user.account_type || user.user_metadata?.account_type;
  const subtype = user.account_subtype || user.user_metadata?.account_subtype;
  const plan = String(user.plan || user.subscription_tier || user.role || type || user.user_metadata?.plan || "").trim().toLowerCase();
  return user.is_pro === true || user.isPro === true || plan === "pro" || plan === "elite" || isProAccountType(type, subtype);
}

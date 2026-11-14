/**
 * supabase-bridge.js
 * 
 * Exposes the React Supabase client instance on `window` so that
 * the legacy vanilla JS files (supabase-config.js, app-supabase.js, etc.)
 * can reuse the same client without creating a second instance.
 * 
 * This module is imported first in main.jsx (before App.jsx).
 */
import { supabase } from './services/supabase';

// Make the single client available globally for legacy scripts
window.supabaseClient = supabase;
window.supabase = supabase;
window.supabaseSDK = null; // prevent supabase-config.js from re-creating a client

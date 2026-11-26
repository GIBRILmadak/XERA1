import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';

/**
 * Base de l'API XERA1.
 * - Web : même origine (/api réécrit par Vercel, ou proxy Vite en local).
 * - APK Capacitor : l'appli est servie depuis https://localhost, on appelle donc
 *   le serveur public.
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (Capacitor.isNativePlatform() ? 'https://xera1.xyz' : '');

export const PUBLIC_SITE = import.meta.env.VITE_PUBLIC_SITE || 'https://xera1.xyz';

export async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || '';
  } catch {
    return '';
  }
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Appel authentifié de l'API XERA1. Le jeton Supabase de l'utilisateur
 * est le seul secret qui transite par le client.
 */
export async function apiFetch(path, { method = 'GET', body, timeout = 15000, auth = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getAccessToken();
    if (!token) throw new ApiError('Session expirée. Reconnectez-vous.', 401);
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error || data.message || `Erreur ${response.status}`, response.status, data);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('Le serveur met trop de temps à répondre.', 0);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

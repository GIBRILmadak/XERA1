import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';

const UiContext = createContext(null);
// Même clé que l'ancien site : le thème choisi est conservé.
const THEME_KEY = 'rize-theme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'dark';
  } catch {
    return 'dark';
  }
}

const TOAST_ICONS = { success: 'check_circle', error: 'error', info: 'info' };

export function UiProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#050505');
  }, [theme]);

  const setTheme = useCallback((value) => {
    setThemeState(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      /* préférence non mémorisée */
    }
  }, []);

  const toast = useCallback((type, title, text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-2), { id, type, title, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), type === 'error' ? 6500 : 4000);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toast }), [theme, setTheme, toast]);

  return (
    <UiContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <Icon name={TOAST_ICONS[t.type] || 'info'} filled />
            <div>
              <strong>{t.title}</strong>
              {t.text && <span>{t.text}</span>}
            </div>
          </div>
        ))}
      </div>
    </UiContext.Provider>
  );
}

export function useUi() {
  return useContext(UiContext);
}

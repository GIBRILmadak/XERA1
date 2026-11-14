/**
 * XERA1 Session Manager
 * Gestion des sessions avec timeout de 4h d'inactivité
 * Demande de reconnexion automatique après 4h sans activité
 */

(function() {
    'use strict';

    const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 heures
    const SESSION_CHECK_INTERVAL_MS = 60 * 1000; // Vérifier chaque minute
    const WARNING_BEFORE_TIMEOUT_MS = 5 * 60 * 1000; // Avertir 5 minutes avant
    const STORAGE_KEY = 'xera_session_activity';
    const STORAGE_KEY_LAST_CHECK = 'xera_session_last_check';

    let sessionTimer = null;
    let warningShown = false;
    let activityListeners = [];

    /**
     * Met à jour le timestamp de dernière activité
     */
    function updateActivity() {
        const now = Date.now();
        localStorage.setItem(STORAGE_KEY, now.toString());
        localStorage.setItem(STORAGE_KEY_LAST_CHECK, now.toString());
        warningShown = false;
        
        // Notifier les listeners
        activityListeners.forEach(listener => listener(now));
    }

    /**
     * Récupère la dernière activité enregistrée
     */
    function getLastActivity() {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? parseInt(stored, 10) : null;
    }

    /**
     * Vérifie si la session est expirée
     */
    function isSessionExpired() {
        const lastActivity = getLastActivity();
        if (!lastActivity) return false;
        
        const now = Date.now();
        return (now - lastActivity) > SESSION_TIMEOUT_MS;
    }

    /**
     * Vérifie si on doit afficher un avertissement
     */
    function shouldShowWarning() {
        if (warningShown) return false;
        
        const lastActivity = getLastActivity();
        if (!lastActivity) return false;
        
        const now = Date.now();
        const timeSinceActivity = now - lastActivity;
        const timeUntilTimeout = SESSION_TIMEOUT_MS - timeSinceActivity;
        
        return timeUntilTimeout <= WARNING_BEFORE_TIMEOUT_MS && timeUntilTimeout > 0;
    }

    /**
     * Force la déconnexion et redirige vers login
     */
    function forceLogout() {
        // Nettoyer le storage
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY_LAST_CHECK);
        
        // Signaler à Supabase
        if (window.supabase) {
            window.supabase.auth.signOut(). catch(err => {
                console.warn('SignOut error:', err);
            });
        }
        
        // Afficher un message et rediriger
        const message = 'Votre session a expiré après 4 heures d\'inactivité. Veuillez vous reconnecter.';
        
        // Créer un overlay de notification
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            flex-direction: column;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        overlay.innerHTML = `
            <div style="text-align: center; padding: 40px; max-width: 400px;">
                <div style="font-size: 64px; margin-bottom: 20px;">⏰</div>
                <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Session Expirée</h2>
                <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; opacity: 0.9;">${message}</p>
                <button onclick="window.location.href='login.html'" style="
                    background: #000;
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    font-size: 16px;
                    font-weight: 600;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#333'" onmouseout="this.style.background='#000'">
                    Se Reconnecter
                </button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Redirection automatique après 5 secondes
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 5000);
    }

    /**
     * Affiche un avertissement avant timeout
     */
    function showTimeoutWarning() {
        if (warningShown) return;
        warningShown = true;
        
        const lastActivity = getLastActivity();
        const now = Date.now();
        const timeUntilTimeout = SESSION_TIMEOUT_MS - (now - lastActivity);
        const minutesLeft = Math.ceil(timeUntilTimeout / 60000);
        
        // Créer une notification toast
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1f2937;
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            z-index: 999998;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 350px;
            animation: slideIn 0.3s ease-out;
        `;
        
        toast.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <span style="font-size: 24px;">⚠️</span>
                <div>
                    <div style="font-weight: 600; margin-bottom: 4px;">Session bientôt expirée</div>
                    <div style="font-size: 14px; opacity: 0.8;">Votre session expire dans ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}. Continuez votre activité pour rester connecté.</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; opacity: 0.6; font-size: 18px;">&times;</button>
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove après 10 secondes
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 10000);
    }

    /**
     * Vérifie l'état de la session
     */
    function checkSession() {
        const now = Date.now();
        localStorage.setItem(STORAGE_KEY_LAST_CHECK, now.toString());
        
        if (isSessionExpired()) {
            forceLogout();
            return;
        }
        
        if (shouldShowWarning()) {
            showTimeoutWarning();
        }
    }

    /**
     * Configure les écouteurs d'activité
     */
    function setupActivityListeners() {
        // Événements de souris et clavier
        const events = [
            'mousedown', 'mousemove', 'keypress', 'scroll', 
            'touchstart', 'click', 'focus'
        ];
        
        events.forEach(event => {
            document.addEventListener(event, updateActivity, { passive: true });
        });
        
        // Activité API
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            updateActivity();
            return originalFetch.apply(this, args);
        };
    }

    /**
     * Démarre le timer de vérification de session
     */
    function startSessionTimer() {
        if (sessionTimer) {
            clearInterval(sessionTimer);
        }
        
        sessionTimer = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
        
        // Vérification immédiate
        checkSession();
    }

    /**
     * Arrête le timer de session
     */
    function stopSessionTimer() {
        if (sessionTimer) {
            clearInterval(sessionTimer);
            sessionTimer = null;
        }
    }

    /**
     * API publique
     */
    window.XERASessionManager = {
        start: function() {
            // Initialiser avec l'activité courante
            updateActivity();
            setupActivityListeners();
            startSessionTimer();
            console.log('XERA1 Session Manager started - 4h timeout');
        },
        
        stop: function() {
            stopSessionTimer();
        },
        
        updateActivity: updateActivity,
        
        isExpired: isSessionExpired,
        
        getTimeRemaining: function() {
            const lastActivity = getLastActivity();
            if (!lastActivity) return SESSION_TIMEOUT_MS;
            const now = Date.now();
            const elapsed = now - lastActivity;
            return Math.max(0, SESSION_TIMEOUT_MS - elapsed);
        },
        
        onActivity: function(callback) {
            if (typeof callback === 'function') {
                activityListeners.push(callback);
            }
        },
        
        forceLogout: forceLogout
    };

    // Démarrer automatiquement au chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.XERASessionManager.start();
        });
    } else {
        window.XERASessionManager.start();
    }

})();

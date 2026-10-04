/* ========================================
   INITIALISATION PAGE STREAM
   ======================================== */

(function () {
    console.log('[stream-page] chargé');
    const STREAMING_SCRIPT_SRC = 'js/streaming.js?v=20261004-1';

    function getParams() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            streamId: urlParams.get('id'),
            hostId: urlParams.get('host'),
            title: urlParams.get('title') || 'Live Stream',
            isNewLive: urlParams.get('new') === 'true',
            source: urlParams.get('source') || 'camera'
        };
    }

    async function resolveStreamIdForHost(hostId) {
        if (!hostId || typeof supabase === 'undefined') return null;
        try {
            const { data, error } = await supabase
                .from('streaming_sessions')
                .select('id, user_id, title, status')
                .eq('user_id', hostId)
                .eq('status', 'live')
                .order('started_at', { ascending: false })
                .limit(1)
                .single();
            if (error || !data) return null;
            return data;
        } catch (e) {
            console.warn('resolveStreamIdForHost error', e);
            return null;
        }
    }

    function ensureNavigateTo() {
        if (typeof window.navigateTo !== 'function') {
            window.navigateTo = (anchor) => {
                if (anchor) {
                    window.location.href = `index.html#${anchor}`;
                } else {
                    window.location.href = 'index.html';
                }
            };
        }
    }

    function updateTitleForNewLive(title) {
        const titleEl = document.getElementById('stream-title');
        const breadcrumb = document.getElementById('stream-breadcrumb-title');
        if (titleEl) titleEl.textContent = title;
        if (breadcrumb) breadcrumb.textContent = title;
    }

    async function ensureStreamingLoaded() {
        if (typeof window.initializeStreamPage === 'function') return true;

        const existingScript = document.querySelector('script[src^="js/streaming.js"]');
        if (existingScript) return typeof window.initializeStreamPage === 'function';

        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = STREAMING_SCRIPT_SRC;
            script.onload = () => resolve(typeof window.initializeStreamPage === 'function');
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    async function ensureAuth() {
        if (typeof window.checkAuth === 'function') {
            await window.checkAuth();
        } else if (window.supabase && window.supabase.auth && typeof window.supabase.auth.getSession === 'function') {
            try {
                const { data: { session } } = await window.supabase.auth.getSession();
                if (session && session.user) {
                    window.currentUser = session.user;
                    window.currentUserId = session.user.id;
                }
            } catch (error) {
                console.warn('Erreur getSession:', error);
            }
        }

        if (!window.currentUser && window.supabase && window.supabase.auth && typeof window.supabase.auth.getUser === 'function') {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                if (user) {
                    window.currentUser = user;
                    window.currentUserId = user.id;
                }
            } catch (error) {
                console.warn('Erreur getUser:', error);
            }
        }
    }

    async function boot() {
        let { streamId, hostId, title, isNewLive, source } = getParams();

        if (!streamId && hostId) {
            const live = await resolveStreamIdForHost(hostId);
            if (live && live.id) {
                streamId = live.id;
                title = live.title || title;
            }
        }

        if (!streamId && !hostId) {
            alert('ID de stream manquant');
            window.location.href = 'index.html';
            return;
        }

        await ensureAuth();

        if (!window.currentUser) {
            if (window.ToastManager) {
                window.ToastManager.error('Non connecté', 'Veuillez vous reconnecter');
            }
            window.location.href = 'login.html';
            return;
        }

        ensureNavigateTo();

        const finalStreamId = streamId || hostId;
        window._streamBroadcastSource = source;

        if (isNewLive) {
            updateTitleForNewLive(title);
            if (window.ToastManager) {
                window.ToastManager.success('Live prêt', 'Votre page de streaming est prête !');
            }
        }

        const hasStreaming = await ensureStreamingLoaded();
        if (hasStreaming && typeof window.initializeStreamPage === 'function') {
            await window.initializeStreamPage(finalStreamId);
        } else {
            console.warn('initializeStreamPage introuvable, affichage statique.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    let hasRequestedLeave = false;
    const handlePageExit = () => {
        if (hasRequestedLeave) return;
        hasRequestedLeave = true;
        if (typeof window.leaveStream === 'function') {
            window.leaveStream();
        }
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);
})();

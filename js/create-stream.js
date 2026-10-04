/* ========================================
   CREATE STREAM - XERA1
   Gestion complète de la création de live stream
   ======================================== */

class StreamCreator {
    constructor() {
        this.currentStream = null;
        this.cameraStream = null;
        this.screenStream = null;
        this.preview = document.getElementById('preview-video');
        this.canvas = null;
        this.ctx = null;
        this.isRecording = false;
        this.layout = 'camera-only';
        this.availableCameras = [];
        this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        this.canUseMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        this.canShareScreen = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
        this.facingMode = 'user';
        
        this.init();
    }
    
    async init() {
        await this.checkAuth();
        await this.setupControls();
        this.applyDeviceCapabilities();
        await this.discoverCameras();
        this.updateUI();
    }
    
    async checkAuth() {
        if (window.checkAuth) {
            const user = await checkAuth();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
        }
    }
    
    async setupControls() {
        // Boutons sources
        document.getElementById('camera-btn').addEventListener('click', () => this.toggleCamera());
        document.getElementById('screen-btn').addEventListener('click', () => this.toggleScreen());
        
        // Sélecteur de caméra
        document.getElementById('camera-select').addEventListener('change', (e) => this.switchCamera(e.target.value));
        document.getElementById('switch-camera').addEventListener('click', () => this.switchToNextCamera());
        
        // Layouts
        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layout = e.currentTarget.dataset.layout;
                this.setLayout(layout);
            });
        });
        
        // Contrôles PiP
        const pipSize = document.getElementById('pip-size');
        if (pipSize) {
            pipSize.addEventListener('input', (e) => {
                document.getElementById('pip-size-value').textContent = e.target.value + '%';
                this.updateLayout();
            });
        }
        
        document.getElementById('pip-position')?.addEventListener('change', () => this.updateLayout());
        
        // Bouton démarrer
        document.getElementById('start-stream-btn').addEventListener('click', () => this.handleStartStream());
        
        // Plein écran
        document.getElementById('fullscreen-preview')?.addEventListener('click', () => this.togglePreviewFullscreen());
    }

    applyDeviceCapabilities() {
        const screenBtn = document.getElementById('screen-btn');
        const screenLayouts = ['screen-only', 'picture-in-picture', 'side-by-side'];
        const screenUnavailable = !this.canShareScreen;

        if (screenBtn && screenUnavailable) {
            screenBtn.disabled = true;
            screenBtn.classList.add('disabled');
            const status = screenBtn.querySelector('.btn-status');
            if (status) status.textContent = 'Indisponible';
            screenBtn.title = 'Partage d\'écran indisponible sur ce navigateur/appareil';
        }

        screenLayouts.forEach(layout => {
            const btn = document.querySelector(`[data-layout="${layout}"]`);
            if (btn && screenUnavailable) {
                btn.disabled = true;
                btn.classList.remove('active');
            }
        });

        if (screenUnavailable && this.layout !== 'camera-only') {
            this.layout = 'camera-only';
        }
    }

    buildCameraConstraints({ deviceId, facingMode } = {}) {
        const video = {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
        };

        if (deviceId) {
            video.deviceId = { exact: deviceId };
        } else if (facingMode) {
            video.facingMode = { ideal: facingMode };
        }

        return { video, audio: true };
    }

    buildDisplayConstraints() {
        if (this.isMobile) {
            // Contraintes légères pour maximiser la compatibilité mobile.
            return { video: true, audio: false };
        }
        return {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: true
        };
    }

    async requestUserMedia(constraints) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            if (constraints.audio) {
                try {
                    const fallback = { ...constraints, audio: false };
                    const stream = await navigator.mediaDevices.getUserMedia(fallback);
                    if (window.ToastManager) {
                        ToastManager.info('Micro désactivé', 'Live lancé sans audio');
                    }
                    return stream;
                } catch (fallbackError) {
                    throw error;
                }
            }
            throw error;
        }
    }

    async requestDisplayMedia(constraints) {
        if (!this.canShareScreen) {
            throw new Error('getDisplayMedia indisponible');
        }
        try {
            return await navigator.mediaDevices.getDisplayMedia(constraints);
        } catch (error) {
            if (constraints.audio) {
                try {
                    const fallback = { ...constraints, audio: false };
                    const stream = await navigator.mediaDevices.getDisplayMedia(fallback);
                    if (window.ToastManager) {
                        ToastManager.info('Micro désactivé', 'Partage d\'écran sans audio');
                    }
                    return stream;
                } catch (fallbackError) {
                    throw error;
                }
            }
            throw error;
        }
    }

    ensurePreviewPlayback() {
        if (!this.preview) return;
        this.preview.muted = true;
        this.preview.playsInline = true;
        const playPromise = this.preview.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }
    
    async discoverCameras() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                if (window.ToastManager) {
                    ToastManager.error('Caméras', 'Votre navigateur ne supporte pas la détection caméra');
                }
                return;
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            const select = document.getElementById('camera-select');
            select.innerHTML = '<option value="">Sélectionnez une caméra...</option>';
            
            this.availableCameras.forEach((camera, index) => {
                const option = document.createElement('option');
                option.value = camera.deviceId;
                
                // Noms plus lisibles pour mobile
                let label = camera.label || `Caméra ${index + 1}`;
                if (label.toLowerCase().includes('front') || label.toLowerCase().includes('user')) {
                    label = '🤳 Caméra selfie';
                } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('environment')) {
                    label = '📷 Caméra arrière';
                }
                
                option.textContent = label;
                select.appendChild(option);
            });
            
            ToastManager.success('Caméras détectées', `${this.availableCameras.length} caméra(s) disponible(s)`);
        } catch (error) {
            console.error('Erreur découverte caméras:', error);
            ToastManager.error('Erreur', 'Impossible de détecter les caméras');
        }
    }
    
    async toggleCamera() {
        const btn = document.getElementById('camera-btn');

        if (!this.canUseMedia) {
            ToastManager.error('Caméra', 'Accès caméra non supporté sur ce navigateur');
            return;
        }
        
        if (this.cameraStream) {
            // Arrêter la caméra
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
            btn.classList.remove('active');
            btn.querySelector('.btn-status').textContent = 'Inactive';
            document.getElementById('camera-options').style.display = 'none';
        } else {
            // Démarrer la caméra
            try {
                await LoadingManager.withLoading(btn, async () => {
                    const constraints = this.buildCameraConstraints({
                        facingMode: this.isMobile ? this.facingMode : undefined
                    });

                    this.cameraStream = await this.requestUserMedia(constraints);
                    btn.classList.add('active');
                    btn.querySelector('.btn-status').textContent = 'Active';
                    document.getElementById('camera-options').style.display = 'block';
                    
                    ToastManager.success('Caméra activée', 'Caméra prête pour le streaming');
                });
            } catch (error) {
                console.error('Erreur caméra:', error);
                ToastManager.error('Erreur caméra', 'Impossible d\'accéder à la caméra');
            }
        }
        
        this.updatePreview();
        this.updateUI();
    }
    
    async toggleScreen() {
        const btn = document.getElementById('screen-btn');

        if (!this.canShareScreen) {
            ToastManager.info('Partage d\'écran', 'Indisponible sur ce navigateur/appareil. Utilisez la caméra.');
            return;
        }
        
        if (this.screenStream) {
            // Arrêter le partage d'écran
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
            btn.classList.remove('active');
            btn.querySelector('.btn-status').textContent = 'Inactive';
        } else {
            // Démarrer le partage d'écran
            try {
                await LoadingManager.withLoading(btn, async () => {
                    this.screenStream = await this.requestDisplayMedia(
                        this.buildDisplayConstraints(),
                    );
                    
                    btn.classList.add('active');
                    btn.querySelector('.btn-status').textContent = 'Active';
                    
                    // Détecter quand l'utilisateur arrête le partage
                    this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                        this.screenStream = null;
                        btn.classList.remove('active');
                        btn.querySelector('.btn-status').textContent = 'Inactive';
                        this.updatePreview();
                        this.updateUI();
                    });
                    
                    ToastManager.success('Partage d\'écran activé', 'Écran prêt pour le streaming');
                });
            } catch (error) {
                console.error('Erreur partage écran:', error);
                const needsGestureRetry =
                    this.isMobile &&
                    (error?.name === 'NotAllowedError' ||
                        error?.name === 'InvalidStateError');
                if (needsGestureRetry) {
                    ToastManager.info(
                        'Partage d’écran',
                        'Touchez à nouveau le bouton Écran pour confirmer le partage.',
                    );
                } else {
                    ToastManager.error('Erreur partage d\'écran', 'Impossible de partager l\'écran');
                }
            }
        }
        
        this.updatePreview();
        this.updateUI();
    }
    
    async switchCamera(deviceId) {
        if ((!deviceId && !this.isMobile) || !this.cameraStream) return;
        
        try {
            // Arrêter l'ancienne caméra
            this.cameraStream.getTracks().forEach(track => track.stop());
            
            // Démarrer la nouvelle caméra
            const constraints = this.buildCameraConstraints({
                deviceId: deviceId || undefined,
                facingMode: !deviceId && this.isMobile ? this.facingMode : undefined
            });

            this.cameraStream = await this.requestUserMedia(constraints);
            this.updatePreview();
            
            const selectedCamera = this.availableCameras.find(c => c.deviceId === deviceId);
            const label = selectedCamera?.label || (this.facingMode === 'environment' ? '📷 Caméra arrière' : '🤳 Caméra selfie');
            ToastManager.success('Caméra changée', label);
        } catch (error) {
            console.error('Erreur changement caméra:', error);
            ToastManager.error('Erreur', 'Impossible de changer de caméra');
        }
    }
    
    switchToNextCamera() {
        const select = document.getElementById('camera-select');
        if (!select) return;

        if (this.availableCameras.length <= 1) {
            if (this.isMobile) {
                this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
                this.switchCamera(null);
            }
            return;
        }

        const currentIndex = Array.from(select.options).findIndex(option => option.selected);
        const nextIndex = (currentIndex + 1) % select.options.length;
        
        if (nextIndex === 0) {
            select.selectedIndex = 1; // Ignorer l'option vide
        } else {
            select.selectedIndex = nextIndex;
        }
        
        this.switchCamera(select.value);
    }
    
    setLayout(layoutType) {
        this.layout = layoutType;
        
        // Mettre à jour l'UI
        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-layout="${layoutType}"]`).classList.add('active');
        
        // Afficher/masquer les contrôles PiP
        const pipControls = document.getElementById('pip-controls');
        if (layoutType === 'picture-in-picture') {
            pipControls.style.display = 'block';
        } else {
            pipControls.style.display = 'none';
        }
        
        this.updatePreview();
        this.updateLayoutDisplay();
    }
    
    updateLayoutDisplay() {
        const currentLayout = document.getElementById('current-layout');
        const layoutNames = {
            'camera-only': 'Caméra seule',
            'screen-only': 'Écran seul', 
            'picture-in-picture': 'Incrustation',
            'side-by-side': 'Côte à côte'
        };
        
        currentLayout.querySelector('h4').textContent = `Layout: ${layoutNames[this.layout]}`;
        
        const indicator = currentLayout.querySelector('.source-indicator');
        const hasCamera = !!this.cameraStream;
        const hasScreen = !!this.screenStream;
        
        if (this.layout === 'camera-only' && hasCamera) {
            indicator.textContent = '📹 Caméra';
        } else if (this.layout === 'screen-only' && hasScreen) {
            indicator.textContent = '🖥️ Écran';
        } else if (this.layout === 'picture-in-picture' && hasCamera && hasScreen) {
            indicator.textContent = '📺 Caméra + Écran';
        } else if (this.layout === 'side-by-side' && hasCamera && hasScreen) {
            indicator.textContent = '⚌ Caméra | Écran';
        } else {
            indicator.textContent = '⚠️ Sources manquantes';
        }
    }
    
    updatePreview() {
        if (this.layout === 'camera-only' && this.cameraStream) {
            this.preview.srcObject = this.cameraStream;
        } else if (this.layout === 'screen-only' && this.screenStream) {
            this.preview.srcObject = this.screenStream;
        } else if ((this.layout === 'picture-in-picture' || this.layout === 'side-by-side') && this.cameraStream && this.screenStream) {
            this.createCompositeStream();
        } else if (this.cameraStream) {
            this.preview.srcObject = this.cameraStream;
        } else if (this.screenStream) {
            this.preview.srcObject = this.screenStream;
        } else {
            this.preview.srcObject = null;
        }

        if (this.preview.srcObject) {
            this.ensurePreviewPlayback();
        }
        
        // Empêcher la relecture automatique après pause
        this.preview.addEventListener('pause', () => {
            if (this.preview.paused) {
                this.preview.pause();
            }
        });
    }
    
    createCompositeStream() {
        // Créer un canvas pour combiner les sources
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = 1280;
            this.canvas.height = 720;
            this.ctx = this.canvas.getContext('2d');
        }
        
        // Créer des éléments video temporaires
        const cameraVideo = document.createElement('video');
        const screenVideo = document.createElement('video');
        
        cameraVideo.srcObject = this.cameraStream;
        screenVideo.srcObject = this.screenStream;
        cameraVideo.play();
        screenVideo.play();
        
        const drawFrame = () => {
            if (this.layout === 'picture-in-picture') {
                this.drawPictureInPicture(screenVideo, cameraVideo);
            } else if (this.layout === 'side-by-side') {
                this.drawSideBySide(screenVideo, cameraVideo);
            }
            
            if (this.cameraStream && this.screenStream) {
                requestAnimationFrame(drawFrame);
            }
        };
        
        cameraVideo.onloadedmetadata = screenVideo.onloadedmetadata = drawFrame;
        
        // Créer le stream composite
        const compositeStream = this.canvas.captureStream(30);
        this.preview.srcObject = compositeStream;
        this.currentStream = compositeStream;
        this.ensurePreviewPlayback();
    }
    
    drawPictureInPicture(screenVideo, cameraVideo) {
        const canvas = this.canvas;
        const ctx = this.ctx;
        
        // Dessiner l'écran en arrière-plan
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        
        // Paramètres d'incrustation
        const sizePercent = parseInt(document.getElementById('pip-size')?.value || 25);
        const position = document.getElementById('pip-position')?.value || 'top-right';
        
        const cameraWidth = (canvas.width * sizePercent) / 100;
        const cameraHeight = (cameraWidth * 9) / 16; // Aspect ratio 16:9
        
        let x, y;
        const margin = 20;
        
        switch (position) {
            case 'top-left':
                x = margin;
                y = margin;
                break;
            case 'top-right':
                x = canvas.width - cameraWidth - margin;
                y = margin;
                break;
            case 'bottom-left':
                x = margin;
                y = canvas.height - cameraHeight - margin;
                break;
            case 'bottom-right':
            default:
                x = canvas.width - cameraWidth - margin;
                y = canvas.height - cameraHeight - margin;
        }
        
        // Border pour la caméra
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 3, y - 3, cameraWidth + 6, cameraHeight + 6);
        
        // Dessiner la caméra
        ctx.drawImage(cameraVideo, x, y, cameraWidth, cameraHeight);
    }
    
    drawSideBySide(screenVideo, cameraVideo) {
        const canvas = this.canvas;
        const ctx = this.ctx;
        const halfWidth = canvas.width / 2;
        
        // Dessiner l'écran à gauche
        ctx.drawImage(screenVideo, 0, 0, halfWidth, canvas.height);
        
        // Dessiner la caméra à droite
        ctx.drawImage(cameraVideo, halfWidth, 0, halfWidth, canvas.height);
        
        // Ligne de séparation
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(halfWidth, 0);
        ctx.lineTo(halfWidth, canvas.height);
        ctx.stroke();
    }
    
    updateUI() {
        const hasCamera = !!this.cameraStream;
        const hasScreen = !!this.screenStream;
        const hasAnySource = hasCamera || hasScreen;
        
        // Afficher les options de layout si on a des sources
        const layoutGroup = document.getElementById('layout-group');
        if (hasAnySource) {
            layoutGroup.style.display = 'block';
        } else {
            layoutGroup.style.display = 'none';
        }
        
        // Activer/désactiver les layouts selon les sources disponibles
        document.querySelector('[data-layout="camera-only"]').disabled = !hasCamera;
        document.querySelector('[data-layout="screen-only"]').disabled = !hasScreen;
        document.querySelector('[data-layout="picture-in-picture"]').disabled = !(hasCamera && hasScreen);
        document.querySelector('[data-layout="side-by-side"]').disabled = !(hasCamera && hasScreen);
        
        // Bouton démarrer
        const startBtn = document.getElementById('start-stream-btn');
        const title = document.getElementById('stream-title-input').value.trim();
        
        if (hasAnySource && title) {
            startBtn.disabled = false;
        } else {
            startBtn.disabled = true;
        }
        
        // Status du stream
        const status = document.querySelector('.stream-status');
        if (hasAnySource) {
            status.textContent = '● Prêt à streamer';
            status.className = 'stream-status live';
        } else {
            status.textContent = '● Configuration';
            status.className = 'stream-status offline';
        }
        
        this.updateLayoutDisplay();
    }
    
    async handleStartStream() {
        const title = document.getElementById('stream-title-input').value.trim();
        const description = document.getElementById('stream-description-input').value.trim();
        const streamingScriptSrc = 'js/streaming.js?v=20261004-1';
        const notifyError = (msg, detail) => {
            if (window.ToastManager) {
                ToastManager.error(msg, detail || '');
            } else {
                alert(`${msg}${detail ? ': ' + detail : ''}`);
            }
        };
        const ensureStreamingLoaded = async () => {
            if (typeof window.startStream === 'function') return true;
            const existingScript = document.querySelector('script[src^="js/streaming.js"]');
            if (existingScript) {
                return typeof window.startStream === 'function';
            }
            if (!window._streamingScriptLoading) {
                window._streamingScriptLoading = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = streamingScriptSrc;
                    script.onload = () => resolve(true);
                    script.onerror = () => reject(new Error('Chargement streaming.js impossible'));
                    document.head.appendChild(script);
                });
            }
            try {
                await window._streamingScriptLoading;
            } catch (error) {
                console.error('Erreur chargement streaming.js:', error);
                return false;
            }
            return typeof window.startStream === 'function';
        };
        
        if (!title) {
            notifyError('Titre requis', 'Veuillez entrer un titre pour votre live');
            return;
        }

        if (!window.currentUser) {
            notifyError('Non connecté', 'Vous devez être connecté pour créer un live');
            window.location.href = 'login.html';
            return;
        }
        
        const hasStreaming = await ensureStreamingLoaded();
        if (!hasStreaming) {
            notifyError('Erreur', 'Fonction startStream introuvable');
            return;
        }
        
        const startBtn = document.getElementById('start-stream-btn');
        
        try {
            const run = async () => {
                // Créer le stream avec les vraies fonctions
                const streamData = {
                    title: title,
                    description: description,
                    thumbnailUrl: null
                };
                
                const result = await window.startStream(streamData);
                
                if (result && result.success) {
                    let source = 'camera';
                    if (this.layout === 'screen-only' && this.screenStream) {
                        source = 'screen';
                    } else if ((this.layout === 'picture-in-picture' || this.layout === 'side-by-side') && this.screenStream) {
                        source = 'screen';
                    } else if (this.screenStream && !this.cameraStream) {
                        source = 'screen';
                    }

                    const streamUrl = `stream.html?id=${result.stream.id}&title=${encodeURIComponent(title)}&host=${window.currentUser.id}&new=true&source=${encodeURIComponent(source)}`;
                    
                    if (window.ToastManager) {
                        ToastManager.success('Live démarré !', 'Redirection vers votre stream...');
                    }
                    
                    setTimeout(() => {
                        window.location.href = streamUrl;
                    }, 1000);
                } else {
                    notifyError('Erreur', 'Impossible de créer le live: ' + (result?.error || 'inconnue'));
                }
            };
            
            if (window.LoadingManager && typeof LoadingManager.withLoading === 'function') {
                await LoadingManager.withLoading(startBtn, run);
            } else {
                await run();
            }
        } catch (error) {
            console.error('Erreur handleStartStream:', error);
            notifyError('Erreur', error?.message || 'Impossible de démarrer le live');
        }
    }
    
    togglePreviewFullscreen() {
        if (!document.fullscreenElement) {
            this.preview.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
}

// Vérifier la validation des inputs
document.addEventListener('DOMContentLoaded', () => {
    const streamCreator = new StreamCreator();
    
    // Validation en temps réel
    const titleInput = document.getElementById('stream-title-input');
    titleInput.addEventListener('input', () => streamCreator.updateUI());
    
    // Message d'aide pour mobile
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        ToastManager.info('Mode mobile détecté', 'Lancez le live via la caméra (partage d\'écran souvent indisponible).');
    }
});

// Export global
window.StreamCreator = StreamCreator;

/* =========================
   AUDIO MANAGER
========================= */
(function () {
    const ROOT = document.documentElement;
    const STORAGE_KEYS = {
        muted: "audioMuted",
        volume: "audioVolume",
        hoverEnabled: "audioHoverEnabled",
        ambientEnabled: "audioAmbientEnabled"
    };
    const SOUND_CONFIG = {
        ambient: { volume: 0.12, loop: true },
        hover: { volume: 0.18, cooldown: 140 },
        click: { volume: 0.25, cooldown: 90 },
        "theme-toggle": { volume: 0.22, cooldown: 120 },
        "menu-open": { volume: 0.22, cooldown: 120 },
        "menu-close": { volume: 0.2, cooldown: 120 },
        "card-open": { volume: 0.24, cooldown: 120 },
        success: { volume: 0.22, cooldown: 120 },
        error: { volume: 0.22, cooldown: 120 }
    };

    const SOUND_ALIAS = {
        "theme-toggle": "click",
        "menu-open": "click",
        "menu-close": "click",
        "card-open": "click",
        success: "click",
        error: "click"
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const resolveTheme = () => ROOT.getAttribute("data-theme") === "light" ? "light" : "dark";
    const readStorage = (key) => {
        try {
            return localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    };
    const writeStorage = (key, value) => {
        try {
            localStorage.setItem(key, String(value));
        } catch (err) {
            // fallback silencioso para nao quebrar a navegacao
        }
    };
    const readBoolean = (key, fallback) => {
        const value = readStorage(key);
        if (value === null) return fallback;
        return value === "true";
    };
    const readNumber = (key, fallback) => {
        const value = Number(readStorage(key));
        return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
    };

    class AudioManager {
        constructor() {
            // Config central usada por todo o site.
            this.config = {
                soundsEnabled: !readBoolean(STORAGE_KEYS.muted, false),
                masterVolume: readNumber(STORAGE_KEYS.volume, 1),
                currentTheme: resolveTheme(),
                hoverEnabled: readBoolean(STORAGE_KEYS.hoverEnabled, true),
                ambientEnabled: readBoolean(STORAGE_KEYS.ambientEnabled, true)
            };
            this.audioArmed = false;
            this.soundCache = new Map();
            this.cooldowns = new Map();
            this.missingPaths = new Set();
            this.ambientKey = null;
            this.ambientFadeRaf = null;
            this.navSound = document.querySelector('.nav-tech [data-nav="sound"]');
            this.themeToggle = document.getElementById("themeToggle");
            this.hoverEligibleQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
            this.themeObserver = new MutationObserver((mutations) => {
                if (!mutations.some((mutation) => mutation.attributeName === "data-theme")) return;
                this.syncTheme();
            });

            this.updateSoundToggle();
            this.bindAudioArm();
            this.bindThemeToggle();

            // Garante que tocar o botão de som também arma o áudio em gestos de usuário.
            if (this.navSound) {
                this.navSound.addEventListener("click", () => {
                    if (!this.audioArmed) {
                        this.armAudio();
                    }
                });
            }

            this.themeObserver.observe(ROOT, {
                attributes: true,
                attributeFilter: ["data-theme"]
            });
        }

        buildPath(eventName, theme = this.config.currentTheme) {
            // Mantem a resolucao dos arquivos isolada por tema.
            return `sounds/${theme}/${eventName}.mp3`;
        }

        getResolvedEventName(eventName) {
            return SOUND_ALIAS[eventName] || eventName;
        }

        getConfig() {
            return { ...this.config };
        }

        isSoundOn() {
            return this.config.soundsEnabled;
        }

        isArmed() {
            return this.audioArmed;
        }

        bindAudioArm() {
            const arm = () => this.armAudio();
            window.addEventListener("pointerdown", arm, { once: true });
            window.addEventListener("keydown", arm, { once: true });
            window.addEventListener("touchstart", arm, { once: true });
        }

        bindThemeToggle() {
            if (!this.themeToggle) return;
            this.themeToggle.addEventListener("click", () => {
                requestAnimationFrame(() => {
                    this.syncTheme();
                    this.playThemeToggle();
                });
            });
        }

        syncTheme() {
            const nextTheme = resolveTheme();
            if (nextTheme === this.config.currentTheme) return false;
            this.config.currentTheme = nextTheme;

            // Troca o ambient junto com o tema sem mexer no restante da UI.
            if (this.shouldPlayAmbient()) {
                this.playAmbientWithFade({ forceRestart: true });
            } else {
                this.stopAmbient({ reset: true });
            }
            return true;
        }

        updateSoundToggle() {
            if (!this.navSound) return;
            const isOn = this.config.soundsEnabled;
            this.navSound.textContent = `Som: ${isOn ? "ON" : "OFF"}`;
            this.navSound.setAttribute("aria-pressed", String(isOn));
        }

        ensureSound(eventName, theme = this.config.currentTheme) {
            const key = `${theme}:${eventName}`;
            if (this.soundCache.has(key)) {
                return this.soundCache.get(key);
            }

            const resolvedEvent = this.getResolvedEventName(eventName);
            const entry = {
                key,
                theme,
                eventName,
                audio: null,
                missing: false
            };

            const setAudio = (audioObj, errorPath = null) => {
                entry.audio = audioObj;
                if (errorPath) {
                    this.warnMissing(errorPath);
                }
            };

            const loadAudio = (sourceTheme) => {
                const audioObj = new Audio(this.buildPath(resolvedEvent, sourceTheme));
                const options = SOUND_CONFIG[eventName] || SOUND_CONFIG[resolvedEvent] || {};
                audioObj.preload = options.loop ? "auto" : "none";
                audioObj.loop = Boolean(options.loop);

                audioObj.addEventListener("error", () => {
                    // Tenta fallback para pasta raiz caso o arquivo temático falhe.
                    if (sourceTheme && sourceTheme !== "") {
                        const fallback = new Audio(`sounds/${resolvedEvent}.mp3`);
                        fallback.preload = options.loop ? "auto" : "none";
                        fallback.loop = Boolean(options.loop);
                        fallback.addEventListener("error", () => {
                            entry.missing = true;
                            this.warnMissing(this.buildPath(resolvedEvent, sourceTheme));
                            this.warnMissing(`sounds/${resolvedEvent}.mp3`);
                        });
                        fallback.addEventListener("canplaythrough", () => setAudio(fallback, this.buildPath(resolvedEvent, sourceTheme)));
                        setAudio(fallback);
                        return;
                    }
                    entry.missing = true;
                    this.warnMissing(`sounds/${resolvedEvent}.mp3`);
                });

                audioObj.addEventListener("canplaythrough", () => setAudio(audioObj));
                setAudio(audioObj);
            };

            loadAudio(theme);

            this.soundCache.set(key, entry);
            return entry;
        }

        warnMissing(path) {
            if (this.missingPaths.has(path)) return;
            this.missingPaths.add(path);
            // Falha silenciosa: loga uma vez e segue a navegacao normalmente.
            console.warn(`Audio file missing or failed to load: ${path}`);
        }

        getEventVolume(eventName) {
            const baseVolume = SOUND_CONFIG[eventName]?.volume ?? 1;
            return clamp(baseVolume * this.config.masterVolume, 0, 1);
        }

        passesCooldown(eventName) {
            const cooldown = SOUND_CONFIG[eventName]?.cooldown ?? 0;
            if (!cooldown) return true;
            const now = performance.now();
            const lastPlayedAt = this.cooldowns.get(eventName) || 0;
            if (now - lastPlayedAt < cooldown) return false;
            this.cooldowns.set(eventName, now);
            return true;
        }

        shouldPlayAmbient() {
            return this.audioArmed && this.config.soundsEnabled && this.config.ambientEnabled;
        }

        armAudio() {
            if (this.audioArmed) return;
            this.audioArmed = true;
            if (this.shouldPlayAmbient()) {
                this.playAmbientWithFade({ forceRestart: true });
            }
        }

        stopAmbient({ reset } = { reset: true }) {
            if (this.ambientFadeRaf) {
                cancelAnimationFrame(this.ambientFadeRaf);
                this.ambientFadeRaf = null;
            }
            if (!this.ambientKey) return;

            const entry = this.soundCache.get(this.ambientKey);
            if (!entry) return;

            entry.audio.pause();
            if (reset) entry.audio.currentTime = 0;
        }

        async playAmbientWithFade({ forceRestart } = { forceRestart: false }) {
            if (!this.shouldPlayAmbient()) return false;

            const theme = this.config.currentTheme;
            const entry = this.ensureSound("ambient", theme);
            if (!entry || entry.missing) return false;

            if (this.ambientKey && this.ambientKey !== entry.key) {
                const previousEntry = this.soundCache.get(this.ambientKey);
                if (previousEntry) {
                    previousEntry.audio.pause();
                    previousEntry.audio.currentTime = 0;
                }
            }
            this.ambientKey = entry.key;

            if (!forceRestart && !entry.audio.paused) {
                entry.audio.volume = this.getEventVolume("ambient");
                return true;
            }

            this.stopAmbient({ reset: true });
            entry.audio.loop = true;
            entry.audio.volume = 0;

            try {
                entry.audio.load();
                await entry.audio.play();
            } catch (err) {
                return false;
            }

            const targetVolume = this.getEventVolume("ambient");
            const fadeStart = performance.now();
            const step = (now) => {
                const t = Math.min(1, (now - fadeStart) / 500);
                entry.audio.volume = targetVolume * t;
                if (t < 1) {
                    this.ambientFadeRaf = requestAnimationFrame(step);
                } else {
                    this.ambientFadeRaf = null;
                }
            };
            this.ambientFadeRaf = requestAnimationFrame(step);
            return true;
        }

        playEvent(eventName) {
            if (eventName === "ambient") {
                return this.playAmbientWithFade({ forceRestart: true });
            }
            if (!this.audioArmed || !this.config.soundsEnabled) return false;
            if (eventName === "hover") {
                if (!this.hoverEligibleQuery.matches || !this.config.hoverEnabled) return false;
            }
            if (!this.passesCooldown(eventName)) return false;

            const entry = this.ensureSound(eventName);
            if (!entry || entry.missing) return false;

            try {
                entry.audio.pause();
                entry.audio.currentTime = 0;
                entry.audio.volume = this.getEventVolume(eventName);
                entry.audio.play().catch(() => {});
                return true;
            } catch (err) {
                return false;
            }
        }

        toggleSound(forceValue) {
            const nextValue = typeof forceValue === "boolean"
                ? forceValue
                : !this.config.soundsEnabled;

            this.config.soundsEnabled = nextValue;
            writeStorage(STORAGE_KEYS.muted, String(!nextValue));
            this.updateSoundToggle();

            if (!nextValue) {
                this.stopAmbient({ reset: true });
                return false;
            }

            // Se som for reativado via UI, arma o áudio e inicia ambient.
            if (!this.audioArmed) {
                this.armAudio();
            }

            if (this.audioArmed) {
                this.playAmbientWithFade({ forceRestart: true });
            }
            return true;
        }

        setMasterVolume(value) {
            this.config.masterVolume = clamp(value, 0, 1);
            writeStorage(STORAGE_KEYS.volume, this.config.masterVolume);

            if (this.ambientKey) {
                const entry = this.soundCache.get(this.ambientKey);
                if (entry && !entry.audio.paused) {
                    entry.audio.volume = this.getEventVolume("ambient");
                }
            }
        }

        setHoverEnabled(value) {
            this.config.hoverEnabled = Boolean(value);
            writeStorage(STORAGE_KEYS.hoverEnabled, this.config.hoverEnabled);
        }

        setAmbientEnabled(value) {
            this.config.ambientEnabled = Boolean(value);
            writeStorage(STORAGE_KEYS.ambientEnabled, this.config.ambientEnabled);
            if (!this.config.ambientEnabled) {
                this.stopAmbient({ reset: true });
            } else if (this.shouldPlayAmbient()) {
                this.playAmbientWithFade({ forceRestart: true });
            }
        }

        playHover() { return this.playEvent("hover"); }
        playClick() { return this.playEvent("click"); }
        playThemeToggle() { return this.playEvent("theme-toggle"); }
        playMenuOpen() { return this.playEvent("menu-open"); }
        playMenuClose() { return this.playEvent("menu-close"); }
        playCardOpen() { return this.playEvent("card-open"); }
        playSuccess() { return this.playEvent("success"); }
        playError() { return this.playEvent("error"); }
    }

    window.portfolioAudio = new AudioManager();
})();

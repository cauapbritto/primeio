/* =========================
   DOCUMENTACAO / ESTADOS
   - body.is-booting: tela inicial/boot loader ativo
   - body.is-transitioning: transicoes imersivas em andamento (evitar input)
   - body.is-project-open: modal/projeto aberto
   - body.modal-open: trava scroll no mobile
   Dependencias: fonte "Zero Hour", cursor em ./assets/cursor/cursor.png,
   sons em ./sounds/ambient.mp3, ./sounds/hover.mp3, ./sounds/click.mp3
   Scroll thresholds: hero -> sobre -> contato -> projetos (ver "SCROLL CONTROL")
   Mobile vs desktop: mobile desliga ripple/tilt e usa parallax leve + layout single column
========================= */
/* =========================
   CANVAS
========================= */
const bootLoader = document.getElementById("bootLoader");
const resonanceEligible = window.matchMedia("(min-width: 769px) and (hover: hover) and (pointer: fine)").matches;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Simple boot timing (ms).
const HOLD_MS = prefersReducedMotion ? 400 : 1200;
const CLEANUP_MS = 450;

// Trata o boot loader conforme o perfil do dispositivo para evitar bloquear a UI sem necessidade.
if (!bootLoader) {
    document.body.classList.remove("is-booting");
} else if (!resonanceEligible) {
    bootLoader.classList.add("is-hidden");
    document.body.classList.remove("is-booting");
    setTimeout(() => bootLoader.remove(), 100);
}

window.addEventListener("load", () => {
    if (!bootLoader || !resonanceEligible) return;
    requestAnimationFrame(() => {
        setTimeout(() => {
            bootLoader.classList.add("is-hidden");
            document.body.classList.remove("is-booting");
            setTimeout(() => bootLoader.remove(), CLEANUP_MS);
        }, HOLD_MS);
    });
});

const canvas = document.getElementById("particles");
const ctx = canvas ? canvas.getContext("2d") : null;
const overlay = document.getElementById("overlay2d");
const octx = overlay ? overlay.getContext("2d") : null;
let __fatal = false;
const isTouch =
    ("ontouchstart" in window) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
const isMobile = window.matchMedia("(max-width: 768px)").matches;
const isMobileUI = isTouch || isMobile;
document.documentElement.classList.toggle("is-touch", isTouch);

/* =========================
   AUDIO
========================= */
// Botao "Som" dentro da navbar (unico controle visivel de audio).
const navSound = document.querySelector('.nav-tech [data-nav="sound"]');
const ambient = new Audio("sounds/ambient.mp3");
const sfxHover = new Audio("sounds/hover.mp3");
const sfxClick = new Audio("sounds/click.mp3");

ambient.loop = true;
ambient.volume = 0.12;
sfxHover.volume = 0.18;
sfxClick.volume = 0.25;

ambient.addEventListener("error", () => console.warn("Ambient audio failed"));
sfxHover.addEventListener("error", () => console.warn("Hover audio failed"));
sfxClick.addEventListener("error", () => console.warn("Click audio failed"));

let audioArmed = false;
// localStorage pode falhar (modo privado/bloqueado); fallback em memoria.
let audioMutedMemory = false;
const getAudioMuted = () => {
    try {
        const stored = localStorage.getItem("audioMuted");
        if (stored === null) return audioMutedMemory;
        return stored === "true";
    } catch (err) {
        return audioMutedMemory;
    }
};
const setAudioMuted = (value) => {
    audioMutedMemory = value;
    try {
        localStorage.setItem("audioMuted", String(value));
    } catch (err) {
        // fallback silencioso para manter o fluxo de audio funcional
    }
};
let audioMuted = getAudioMuted();
let ambientFadeRaf = null;
let lastClickSfxAt = 0;
const CLICK_SFX_COOLDOWN = 90;

/**
 * Sincroniza o texto e o estado ARIA dos controles de audio.
 * Atualiza o botao atual da navbar.
 */
const updateSoundToggle = () => {
    const isOn = !audioMuted;
    if (navSound) {
        // Mantem feedback do estado no unico controle visivel (navbar).
        navSound.textContent = `Som: ${isOn ? "ON" : "OFF"}`;
        navSound.setAttribute("aria-pressed", String(isOn));
    }
};

/**
 * Inicia o audio ambiente com fade-in para evitar estalo e subida brusca de volume.
 * Aguarda o carregamento do arquivo e interrompe silenciosamente em caso de falha.
 *
 * @returns {Promise<void>}
 */
const playAmbientWithFade = async () => {
    if (audioMuted) return;
    if (ambientFadeRaf) cancelAnimationFrame(ambientFadeRaf);
    const target = 0.12;
    const start = performance.now();
    ambient.volume = 0;
    try {
        ambient.load();
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("Ambient audio load timeout"));
            }, 1500);
            const onReady = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error("Ambient audio failed to load"));
            };
            const cleanup = () => {
                clearTimeout(timeoutId);
                ambient.removeEventListener("canplaythrough", onReady);
                ambient.removeEventListener("error", onError);
            };
            ambient.addEventListener("canplaythrough", onReady, { once: true });
            ambient.addEventListener("error", onError, { once: true });
        });
        await ambient.play();
    } catch (err) {
        console.warn("Ambient audio failed to start", err);
        return;
    }
    const step = (now) => {
        const t = Math.min(1, (now - start) / 500);
        ambient.volume = target * t;
        if (t < 1) {
            ambientFadeRaf = requestAnimationFrame(step);
        } else {
            ambientFadeRaf = null;
        }
    };
    ambientFadeRaf = requestAnimationFrame(step);
};

/**
 * Desbloqueia o contexto de audio na primeira interacao do usuario.
 */
const armAudioOnce = () => {
    if (audioArmed) return;
    audioArmed = true;
    if (!audioMuted) playAmbientWithFade();
};

window.addEventListener("pointerdown", armAudioOnce, { once: true });
window.addEventListener("keydown", armAudioOnce, { once: true });
window.addEventListener("touchstart", armAudioOnce, { once: true });

updateSoundToggle();

/**
 * Reproduz o efeito de clique com cooldown curto para evitar sobreposicao excessiva.
 */
const playClickSfx = () => {
    if (audioMuted || !audioArmed) return;
    const now = performance.now();
    if (now - lastClickSfxAt < CLICK_SFX_COOLDOWN) return;
    lastClickSfxAt = now;
    sfxClick.currentTime = 0;
    sfxClick.play().catch(() => {});
};

/**
 * Alterna o estado global do audio e atualiza persistencia local.
 */
const toggleSound = () => {
    audioMuted = !audioMuted;
    setAudioMuted(audioMuted);
    updateSoundToggle();
    if (audioMuted) {
        ambient.pause();
        ambient.currentTime = 0;
    } else if (audioArmed) {
        playAmbientWithFade();
    }
};

/**
 * Atualiza a custom property `--vh` para corrigir variacao de viewport em mobile.
 */
const setViewportUnit = () => {
    document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
};

/**
 * Redimensiona os canvases principais sempre que a viewport muda.
 */
function resize() {
    setViewportUnit();
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas) {
        canvas.width = w;
        canvas.height = h;
    }
    if (overlay) {
        overlay.width = w;
        overlay.height = h;
    }
}
resize();
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", setViewportUnit);

/* =========================
   SAFE MODE OVERLAY
========================= */
/**
 * Exibe uma camada de erro fatal e interrompe as animacoes principais.
 *
 * @param {unknown} err
 */
function showFatalError(err) {
    if (__fatal) return;
    __fatal = true;
    const message = err && err.message ? err.message : String(err || "Erro desconhecido");
    const stack = err && err.stack ? err.stack : "";

    let box = document.getElementById("fatalErrorOverlay");
    if (!box) {
        box = document.createElement("pre");
        box.id = "fatalErrorOverlay";
        box.style.position = "fixed";
        box.style.inset = "20px";
        box.style.zIndex = "9999";
        box.style.background = "rgba(0,0,0,0.9)";
        box.style.color = "#00ffff";
        box.style.padding = "16px";
        box.style.border = "1px solid rgba(0,255,255,0.4)";
        box.style.borderRadius = "12px";
        box.style.overflow = "auto";
        box.style.whiteSpace = "pre-wrap";
        document.body.appendChild(box);
    }

    box.textContent = `ERRO: ${message}\n\n${stack}`;

    if (canvas) canvas.style.display = "none";
    if (overlay) overlay.style.display = "none";
    document.body.classList.remove("is-transitioning", "is-project-open", "is-preview-open");
}

window.onerror = (message, source, lineno, colno, error) => {
    showFatalError(error || new Error(String(message)));
};
window.onunhandledrejection = (event) => {
    showFatalError(event.reason || new Error("Unhandled rejection"));
};

/* =========================
   TEXTOS (REFERENCIAS DOM)
========================= */
const sobreText = document.getElementById("sobreText");
const contatoText = document.getElementById("contatoText");
const hudStopwatch = document.getElementById("hudStopwatch");
const hudClock = document.getElementById("hudClock");

/* =========================
   HUD
========================= */
const formatHudTime = (totalMs) => {
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (v) => String(v).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

let stopwatchStart = performance.now();
let stopwatchAccum = 0;
let stopwatchPaused = false;

/**
 * Atualiza o cronometro do HUD, pausando a contagem enquanto o modal de projeto estiver aberto.
 */
const updateStopwatch = () => {
    if (!hudStopwatch) return;
    const isPaused = document.body.classList.contains("is-project-open");
    if (isPaused && !stopwatchPaused) {
        stopwatchAccum += performance.now() - stopwatchStart;
        stopwatchPaused = true;
    } else if (!isPaused && stopwatchPaused) {
        stopwatchStart = performance.now();
        stopwatchPaused = false;
    }
    const elapsed = stopwatchPaused ? stopwatchAccum : stopwatchAccum + (performance.now() - stopwatchStart);
    hudStopwatch.textContent = formatHudTime(elapsed);
};

/**
 * Atualiza o relogio de parede exibido no HUD.
 */
const updateClock = () => {
    if (!hudClock) return;
    const now = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    hudClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

updateStopwatch();
updateClock();
setInterval(updateStopwatch, 350);
setInterval(updateClock, 1000);

/* =========================
   SCROLL VARS
========================= */
let heroOpacity = 1;
let warp = 0;
let warpTarget = 0;
const WARP_IN = 0.18;
const WARP_OUT = 0.10;
const WARP_ADD = 35;
let scrollImpulse = 0;
let scrollImpulseTarget = 0;
let lastScrollY = window.scrollY;
let lastScrollT = performance.now();
let ignoreNextImpulse = false;
let starsImpulseEnabled = true;
let starsFreeze = false;
let starCinematicLock = false;
const IMPULSE_SCALE = isMobileUI ? 1.2 : 1.8;
const IMPULSE_MAX = isMobileUI ? 1.4 : 2.2;
const IMPULSE_LERP = 0.35;
const IMPULSE_DECAY = 0.86;
const IMPULSE_STAR_MULT = 18;

/**
 * Calcula as faixas logicas de scroll usadas pela pagina.
 *
 * @returns {{heroEnd: number, sobreEnd: number, contatoEnd: number, projectsEnd: number}}
 */
const getScrollRanges = () => {
    const H = window.innerHeight;
    return {
        heroEnd: isMobileUI ? (0.70 * H) : (0.60 * H),
        sobreEnd: isMobileUI ? (1.45 * H) : (1.20 * H),
        contatoEnd: isMobileUI ? (2.20 * H) : (1.80 * H),
        projectsEnd: isMobileUI ? (2.75 * H) : (2.20 * H)
    };
};

/**
 * Retorna os pontos-alvo centrais de cada secao para navegacao e soft snap.
 *
 * @returns {number[]}
 */
const getScrollTargets = () => {
    const { heroEnd, sobreEnd, contatoEnd, projectsEnd } = getScrollRanges();
    const mid = (a, b) => a + (b - a) * 0.5;

    return [
        5, // hero (nao usar 0 por causa do loop)
        mid(heroEnd, sobreEnd),
        mid(sobreEnd, contatoEnd),
        mid(contatoEnd, projectsEnd)
    ];
};

/* =========================
   ESTRELAS 3D (2D CANVAS)
========================= */
const stars = [];

/**
 * Representa uma estrela da malha pseudo-3D desenhada no canvas.
 */
class Star {
    constructor() { this.reset(); }
    /**
     * Reposiciona a estrela em uma nova profundidade pseudo-aleatoria.
     */
    reset() {
        if (!canvas) return;
        this.x = (Math.random() - 0.5) * canvas.width * 2;
        this.y = (Math.random() - 0.5) * canvas.height * 2;
        this.z = Math.random() * canvas.width;
        this.prevZ = this.z;
        this.speed = 0.6 + Math.random() * 1.2;
    }
    /**
     * Atualiza a profundidade da estrela combinando velocidade base, warp e impulso de scroll.
     */
    update() {
        const baseSpeed = 2;
        const lockActive =
            starCinematicLock ||
            document.body.classList.contains("is-transitioning") ||
            document.body.classList.contains("is-project-open");
        // Durante transicoes e modal aberto, congela o efeito cinematografico para evitar artefatos.
        const warpContribution = lockActive ? 0 : (warp * WARP_ADD);
        const impulseContribution = lockActive ? 0 : (scrollImpulse * IMPULSE_STAR_MULT);
        const speed = baseSpeed + impulseContribution + warpContribution;
        const finalSpeed = Math.max(-35, Math.min(55, speed));
        this.prevZ = this.z;
        this.z -= finalSpeed * this.speed;
        if (this.z <= 1) this.reset();
        if (this.z > canvas.width * 2) this.reset();
    }
    /**
     * Desenha o rastro da estrela a partir da profundidade atual e da profundidade anterior.
     */
    draw() {
        if (!canvas || !ctx) return;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const warpStretch = 1 + warp * 0.35;
        const prevZWarp = this.prevZ + warp * 80;
        const x = cx + (this.x / this.z) * 500;
        const y = cy + (this.y / this.z) * 500;
        const px = cx + (this.x / prevZWarp) * (500 * warpStretch);
        const py = cy + (this.y / prevZWarp) * (500 * warpStretch);
        const alpha = 1 - this.z / canvas.width;
        ctx.strokeStyle = `rgba(200,220,255,${alpha})`;
        ctx.lineWidth = alpha * (2 + warp * 2) * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(px, py);
        ctx.stroke();
    }
}
if (canvas) {
    const starCount = isMobileUI ? 120 : 300;
    for (let i = 0; i < starCount; i++) stars.push(new Star());
}

/* =========================
   REDE DO MOUSE
========================= */
const mouseParticles = [];
if (!isTouch) {
    window.addEventListener("mousemove", e => {
        mouseParticles.push({
            x: e.clientX, y: e.clientY,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 100
        });
        if (mouseParticles.length > 50) mouseParticles.shift();
    });
}

/**
 * Desenha uma rede efemera a partir das ultimas posicoes do mouse.
 * O loop reverso facilita remover particulas expiradas sem quebrar a iteracao.
 */
function drawMouseNetwork() {
    if (!octx || isTouch) return;
    for (let i = mouseParticles.length - 1; i >= 0; i--) {
        const p = mouseParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.8;

        octx.fillStyle = `rgba(0,255,255,${p.life / 100})`;
        octx.beginPath();
        octx.arc(p.x, p.y, 2, 0, Math.PI*2);
        octx.fill();

        for (let j = i - 1; j >= 0; j--) {
            const p2 = mouseParticles[j];
            const dist = Math.hypot(p.x-p2.x, p.y-p2.y);
            if (dist < 100) {
                octx.strokeStyle = `rgba(0,255,255,${(1-dist/100)*(p.life/100)})`;
                octx.lineWidth = 0.5;
                octx.beginPath();
                octx.moveTo(p.x,p.y);
                octx.lineTo(p2.x,p2.y);
                octx.stroke();
            }
        }
        if (p.life <= 0) mouseParticles.splice(i, 1);
    }
}

/* =========================
   WIREFRAME TEXT
========================= */
/**
 * Renderiza o titulo em wireframe no canvas de overlay enquanto a secao hero estiver ativa.
 *
 * @param {number} opacity
 */
function drawWireframeText(opacity) {
    if (isMobileUI) return;
    if (!octx || !overlay) return;
    if (opacity <= 0) return;
    octx.save();
    octx.globalAlpha = opacity;
    const baseSize = Math.min(overlay.width, overlay.height) * 0.18;
    const scaledSize = baseSize * 0.6;
    octx.font = `400 ${scaledSize}px "Zero Hour", system-ui, sans-serif`;

    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.strokeStyle = "rgba(0,255,255,0.9)";
    octx.lineWidth = 2;
    octx.shadowColor = "rgba(0,255,255,0.6)";
    octx.shadowBlur = 20;
    octx.strokeText("Cauanzera", overlay.width / 2, overlay.height / 2);

    octx.restore();
}

/**
 * Limpa e redesenha todo o campo de estrelas.
 */
const renderStars = () => {
    if (!ctx || !canvas) return;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => { s.update(); s.draw(); });
};

/* =========================
   ANIMACAO PRINCIPAL
========================= */
/**
 * Loop principal de renderizacao do background.
 * Interpola warp/impulso, desenha estrelas e aplica efeitos de overlay.
 */
function animate() {
    try {
        const k = warpTarget > warp ? WARP_IN : WARP_OUT;
        warp += (warpTarget - warp) * k;
        if (warp < 0.001) warp = 0;

        // Zera o impulso quando o fundo nao deve reagir ao scroll.
        if (starsFreeze ||
            starCinematicLock ||
            !starsImpulseEnabled ||
            document.body.classList.contains("is-project-open") ||
            document.body.classList.contains("is-transitioning")) {
            scrollImpulse = 0;
            scrollImpulseTarget = 0;
        } else {
            scrollImpulse += (scrollImpulseTarget - scrollImpulse) * IMPULSE_LERP;
            scrollImpulse *= IMPULSE_DECAY;
            if (Math.abs(scrollImpulse) < 0.0005) scrollImpulse = 0;
        }

        renderStars();
        if (octx && overlay) {
            octx.clearRect(0, 0, overlay.width, overlay.height);
            drawMouseNetwork();
            drawWireframeText(heroOpacity);
        }
    } catch (err) {
        showFatalError(err);
    } finally {
        if (__fatal) return;
        requestAnimationFrame(animate);
    }
}
animate();

/* =========================
   PROJETOS + CARDS
========================= */
const projects = document.getElementById("projects");
const projectCards = document.querySelectorAll(".project-card");
const hoverAudioEligible = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
let lastHoverAt = 0;
const HOVER_COOLDOWN = 140;

// Reutiliza o mesmo sistema de hover dos cards na navbar (mesmas regras/cooldown).
const playHoverSfx = () => {
    if (!hoverAudioEligible || audioMuted || !audioArmed) return;
    const now = performance.now();
    if (now - lastHoverAt < HOVER_COOLDOWN) return;
    lastHoverAt = now;
    sfxHover.currentTime = 0;
    sfxHover.play().catch(() => {});
};

if (isMobileUI) {
    let mpx = 0.5;
    let mpy = 0.5;
    let parallaxRAF = null;
    let lastTouchTs = 0;

    /**
     * Aplica parallax leve aos cards visiveis com base na posicao do toque e na tela.
     */
    function applyMobileParallax() {
        parallaxRAF = null;
        document.querySelectorAll(".project-card.in-view").forEach((card, idx) => {
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width * 0.5;
            const cy = rect.top + rect.height * 0.5;
            const vx = cx / innerWidth - 0.5;
            const vy = cy / innerHeight - 0.5;
            const maxX = 6;
            const maxY = 6;
            const baseX = (mpx - 0.5) * 0.6 + vx * 0.4;
            const baseY = (mpy - 0.5) * 0.6 + vy * 0.4;
            const jitter = (idx % 3 - 1) * 0.2;
            const px = (baseX * maxX * 2) + jitter;
            const py = (baseY * maxY * 2) - jitter;
            card.style.setProperty("--mx", `${px.toFixed(2)}px`);
            card.style.setProperty("--my", `${py.toFixed(2)}px`);
        });
    }

    /**
     * Garante no maximo um frame pendente para o parallax mobile.
     */
    function scheduleMobileParallax() {
        if (parallaxRAF) return;
        parallaxRAF = requestAnimationFrame(applyMobileParallax);
    }

    window.addEventListener("touchstart", (e) => {
        if (!e.touches || !e.touches[0]) return;
        mpx = e.touches[0].clientX / innerWidth;
        mpy = e.touches[0].clientY / innerHeight;
        lastTouchTs = performance.now();
        scheduleMobileParallax();
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!e.touches || !e.touches[0]) return;
        mpx = e.touches[0].clientX / innerWidth;
        mpy = e.touches[0].clientY / innerHeight;
        lastTouchTs = performance.now();
        scheduleMobileParallax();
    }, { passive: true });

    window.addEventListener("scroll", () => {
        if (performance.now() - lastTouchTs < 200) return;
        mpy = 0.45 + (window.scrollY % innerHeight) / innerHeight * 0.1;
        scheduleMobileParallax();
    }, { passive: true });

    const cards = Array.from(projectCards);
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("in-view");
            scheduleMobileParallax();
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.25, rootMargin: "0px 0px -10% 0px" });
    cards.forEach(card => observer.observe(card));
}
/* =========================
   RIPPLE EFFECT (HOVER)
========================= */
if (!isMobileUI) {
    projectCards.forEach(card => {
        card.addEventListener("mouseenter", e => {
            const ripple = document.createElement("span");
            ripple.classList.add("ripple");

            const rect = card.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);

            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left}px`;
            ripple.style.top = `${e.clientY - rect.top}px`;

            card.appendChild(ripple);
            setTimeout(() => ripple.remove(), 800);
        });
    });
}

// Mantem .active em sincronia com .hidden (CSS usa ambos).
/**
 * Controla a visibilidade da secao de projetos alinhando as classes usadas no CSS.
 *
 * @param {boolean} show
 */
const setProjectsVisibility = (show) => {
    if (!projects) return;
    if (show) {
        projects.classList.remove("hidden");
        projects.classList.add("active");
    } else {
        projects.classList.add("hidden");
        projects.classList.remove("active");
    }
};

/* =========================
   SCROLL CONTROL (UNICO)
========================= */
window.addEventListener("scroll", () => {
    const scroll = window.scrollY;
    const total = document.documentElement.scrollHeight;
    const H = window.innerHeight;
    const { heroEnd, sobreEnd, contatoEnd, projectsEnd } = getScrollRanges();

    // Cria scroll circular no desktop para manter a navegacao continua entre secoes.
    if (!isMobileUI) {
        if (scroll + H >= total - 5) {
            ignoreNextImpulse = true;
            window.scrollTo(0, 5);
        }
        if (scroll <= 0) {
            ignoreNextImpulse = true;
            window.scrollTo(0, total - H - 10);
        }
    }

    if (ignoreNextImpulse) {
        ignoreNextImpulse = false;
        lastScrollY = window.scrollY;
        lastScrollT = performance.now();
        scrollImpulseTarget = 0;
        return;
    }

    if (starsFreeze ||
        starCinematicLock ||
        document.body.classList.contains("is-transitioning") ||
        document.body.classList.contains("is-project-open")) {
        lastScrollY = window.scrollY;
        lastScrollT = performance.now();
        scrollImpulseTarget = 0;
        return;
    }

    if (!starsImpulseEnabled ||
        document.body.classList.contains("is-project-open") ||
        document.body.classList.contains("is-transitioning")) {
        lastScrollY = window.scrollY;
        lastScrollT = performance.now();
        scrollImpulseTarget = 0;
        return;
    }

    // Reinicia o estado visual antes de ativar apenas a secao correspondente ao scroll atual.
    if (sobreText) sobreText.style.opacity = 0;
    if (contatoText) contatoText.style.opacity = 0;
    sobreText?.classList.remove("visible");
    contatoText?.classList.remove("visible");

    // Hero: so o titulo wireframe deve permanecer em evidencia.
    if (scroll < heroEnd) {
        heroOpacity = 1 - scroll/heroEnd;
        setProjectsVisibility(false);
    }
    // Sobre: revela o bloco progressivamente na faixa intermediaria.
    else if(scroll < sobreEnd){
        if (sobreText) sobreText.style.opacity = (scroll - heroEnd)/(sobreEnd - heroEnd);
        sobreText?.classList.add("visible");
        setProjectsVisibility(false);
        heroOpacity = 0;
    }
    // Contato: mesmo comportamento de fade, mas em uma faixa de scroll posterior.
    else if(scroll < contatoEnd){
        if (contatoText) contatoText.style.opacity = (scroll - sobreEnd)/(contatoEnd - sobreEnd);
        contatoText?.classList.add("visible");
        setProjectsVisibility(false);
        heroOpacity = 0;
    }
    // Projetos: libera a grade interativa e esconde os textos centrais.
    else if(scroll < projectsEnd){
        setProjectsVisibility(true);
        heroOpacity = 0;
    }
    else {
        setProjectsVisibility(false);
    }

    const now = performance.now();
    const y = window.scrollY;
    const dy = y - lastScrollY;
    const dt = Math.max(16, now - lastScrollT);
    const v = dy / dt;
    scrollImpulseTarget = Math.max(
        -IMPULSE_MAX,
        Math.min(IMPULSE_MAX, v * IMPULSE_SCALE)
    );
    lastScrollY = y;
    lastScrollT = now;
});

/* =========================
   POINTER TRACKING (PARALLAX CARDS)
========================= */
if (!isMobileUI) {
    projectCards.forEach(card => {
        card.addEventListener("mousemove", e => {
            card.style.setProperty("--mx", `${e.clientX}px`);
            card.style.setProperty("--my", `${e.clientY}px`);
        });
    });
}

/* =========================
   PROJECT VIEW + IMMERSIVE TRANSITION
========================= */
const TRANSITION_MS = 900;
const CLONE_EXTRA_MS = 500;
const CLONE_TRANSITION_MS = TRANSITION_MS + CLONE_EXTRA_MS;
const CLONE_CLOSE_MS = 950;
const projectView = document.getElementById("projectView");
const projectPanel = projectView?.querySelector(".project-view__panel");
const projectHero = projectView?.querySelector(".project-view__hero");
const projectTitle = projectView?.querySelector(".project-view__title");
const projectDesc = projectView?.querySelector(".project-view__desc");
const projectTechTitle = projectView?.querySelector(".project-view__tech-title");
const projectTechDesc = projectView?.querySelector(".project-view__tech-desc");
const projectBack = projectView?.querySelector(".project-view__back");
const projectVisit = projectView?.querySelector(".project-view__visit");
const projectBackdrop = projectView?.querySelector(".project-view__backdrop");
const focusVignette = document.getElementById("focusVignette");

let activeCard = null;
let activeCardRect = null;
let activeProject = null;
let tiltActive = false;
let tiltFrame = null;
let tiltTargetRx = 0;
let tiltTargetRy = 0;
let tiltTargetMx = 50;
let tiltTargetMy = 50;
let tiltCurrentRx = 0;
let tiltCurrentRy = 0;
let tiltCurrentMx = 50;
let tiltCurrentMy = 50;

const setActiveCardHidden = (hidden) => {
    activeCard?.classList.toggle("is-source-hidden", hidden);
};

/**
 * Extrai os dados exibidos em um card para preencher a visualizacao expandida.
 *
 * @param {Element} card
 * @returns {{href: string, targetBlank: boolean, title: string, desc: string, techTitle: string, techDesc: string, image: string}}
 */
const extractProjectData = (card) => {
    const front = card.querySelector(".card-front");
    const frontTitle = front?.querySelector("h3");
    const frontDesc = front?.querySelector("p");
    const back = card.querySelector(".card-back");
    const techTitle = back?.querySelector("h3");
    const techDesc = back?.querySelector("p");

    return {
        href: card.getAttribute("href") || "",
        targetBlank: card.getAttribute("target") === "_blank",
        title: frontTitle?.textContent?.trim() || "",
        desc: frontDesc?.textContent?.trim() || "",
        techTitle: techTitle?.textContent?.trim() || "Tecnologias",
        techDesc: techDesc?.textContent?.trim() || "",
        image: front ? getComputedStyle(front).backgroundImage : ""
    };
};

/**
 * Atualiza o conteudo do modal de projeto a partir dos dados do card.
 *
 * @param {{image: string, title: string, desc: string, techTitle: string, techDesc: string}} data
 */
const setProjectViewContent = (data) => {
    if (!projectView) return;
    if (projectHero) projectHero.style.backgroundImage = data.image || "none";
    if (projectTitle) projectTitle.textContent = data.title || "Projeto";
    if (projectDesc) projectDesc.textContent = data.desc || "";
    if (projectTechTitle) projectTechTitle.textContent = data.techTitle || "Tecnologias";
    if (projectTechDesc) projectTechDesc.textContent = data.techDesc || "";
};

/**
 * Limita um valor numerico a um intervalo fechado.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Aplica tilt suave por interpolacao e atualiza variaveis CSS do painel expandido.
 */
const updateTiltFrame = () => {
    if (!tiltActive || !projectPanel) return;

    tiltCurrentRx += (tiltTargetRx - tiltCurrentRx) * 0.12;
    tiltCurrentRy += (tiltTargetRy - tiltCurrentRy) * 0.12;
    tiltCurrentMx += (tiltTargetMx - tiltCurrentMx) * 0.12;
    tiltCurrentMy += (tiltTargetMy - tiltCurrentMy) * 0.12;

    projectPanel.style.setProperty("--rx", `${tiltCurrentRx.toFixed(3)}deg`);
    projectPanel.style.setProperty("--ry", `${tiltCurrentRy.toFixed(3)}deg`);
    projectPanel.style.setProperty("--mx", `${tiltCurrentMx.toFixed(2)}%`);
    projectPanel.style.setProperty("--my", `${tiltCurrentMy.toFixed(2)}%`);

    const parallaxX = tiltCurrentRy * 2;
    const parallaxY = -tiltCurrentRx * 2;
    projectPanel.style.setProperty("--px", `${parallaxX.toFixed(2)}px`);
    projectPanel.style.setProperty("--py", `${parallaxY.toFixed(2)}px`);

    tiltFrame = requestAnimationFrame(updateTiltFrame);
};

/**
 * Ativa o efeito de tilt do painel no desktop.
 */
const startPanelTilt = () => {
    if (!projectPanel || tiltActive) return;
    tiltActive = true;

    const onMove = (e) => {
        const rect = projectPanel.getBoundingClientRect();
        const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        const maxDeg = 6;
        tiltTargetRx = (0.5 - y) * maxDeg;
        tiltTargetRy = (x - 0.5) * maxDeg;
        tiltTargetMx = x * 100;
        tiltTargetMy = y * 100;
    };

    const onLeave = () => {
        tiltTargetRx = 0;
        tiltTargetRy = 0;
        tiltTargetMx = 50;
        tiltTargetMy = 50;
    };

    projectPanel.addEventListener("mousemove", onMove);
    projectPanel.addEventListener("mouseleave", onLeave);
    projectPanel.addEventListener("blur", onLeave);
    projectPanel._tiltHandlers = { onMove, onLeave };

    updateTiltFrame();
};

/**
 * Remove listeners e reseta as variaveis do efeito de tilt.
 */
const stopPanelTilt = () => {
    if (!projectPanel || !tiltActive) return;
    tiltActive = false;
    if (tiltFrame) cancelAnimationFrame(tiltFrame);
    tiltFrame = null;

    const handlers = projectPanel._tiltHandlers;
    if (handlers) {
        projectPanel.removeEventListener("mousemove", handlers.onMove);
        projectPanel.removeEventListener("mouseleave", handlers.onLeave);
        projectPanel.removeEventListener("blur", handlers.onLeave);
        projectPanel._tiltHandlers = null;
    }

    projectPanel.style.setProperty("--rx", "0deg");
    projectPanel.style.setProperty("--ry", "0deg");
    projectPanel.style.setProperty("--mx", "50%");
    projectPanel.style.setProperty("--my", "50%");
    projectPanel.style.setProperty("--px", "0px");
    projectPanel.style.setProperty("--py", "0px");
};



/**
 * Abre a visualizacao detalhada do projeto.
 * No mobile a abertura e direta; no desktop existe uma transicao cinematografica com clone do card.
 *
 * @param {Element} card
 */
const openProject = (card) => {
    if (!projectView || document.body.classList.contains("is-transitioning")) return;

    if (isMobileUI) {
        activeCard = card;
        activeProject = extractProjectData(card);
        setProjectViewContent(activeProject);
        projectView.classList.add("is-open");
        projectView.setAttribute("aria-hidden", "false");
        document.body.classList.add("is-project-open", "modal-open");
        starCinematicLock = true;
        starsFreeze = true;
        starsImpulseEnabled = false;
        scrollImpulse = 0;
        scrollImpulseTarget = 0;
        warpTarget = 0;
        warp = 0;
        lastScrollY = window.scrollY;
        lastScrollT = performance.now();
        return;
    }

    // Congela o background antes da transicao para priorizar a leitura do conteudo aberto.
    starCinematicLock = true;
    starsFreeze = true;
    starsImpulseEnabled = false;
    scrollImpulse = 0;
    scrollImpulseTarget = 0;
    warpTarget = 0;
    warp = 0;
    lastScrollY = window.scrollY;
    lastScrollT = performance.now();

    activeCard = card;
    activeCardRect = card.getBoundingClientRect();
    activeProject = extractProjectData(card);

    document.body.classList.add("is-transitioning");
    projects?.classList.add("is-fading");
    warpTarget = 0;

    const clone = card.cloneNode(true);
    clone.classList.add("is-clone");
    clone.style.top = `${activeCardRect.top}px`;
    clone.style.left = `${activeCardRect.left}px`;
    clone.style.width = `${activeCardRect.width}px`;
    clone.style.height = `${activeCardRect.height}px`;
    clone.style.transform = "translate(0px, 0px) scale(1)";

    document.body.appendChild(clone);
    setActiveCardHidden(true);
    clone.getBoundingClientRect();

    const scaleX = window.innerWidth / activeCardRect.width;
    const scaleY = window.innerHeight / activeCardRect.height;
    const scale = Math.max(scaleX, scaleY) * 1.05;
    const translateX = (window.innerWidth / 2) - (activeCardRect.left + activeCardRect.width / 2);
    const translateY = (window.innerHeight / 2) - (activeCardRect.top + activeCardRect.height / 2);
    const overshoot = scale * 1.03;

    const start = "translate(0px, 0px) scale(1)";
    const mid = `translate(${translateX}px, ${translateY}px) scale(${overshoot})`;
    const end = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

    if (clone.animate) {
        const animation = clone.animate(
            [
                { transform: start },
                { transform: mid, offset: 0.65, easing: "cubic-bezier(0.25, 0.9, 0.2, 1)" },
                { transform: end, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
            ],
            { duration: CLONE_TRANSITION_MS, fill: "forwards" }
        );
        animation.onfinish = () => {
            clone.remove();
            setProjectViewContent(activeProject);
            projectView.classList.add("is-open");
            projectView.setAttribute("aria-hidden", "false");
            document.body.classList.add("is-project-open");
            document.body.classList.remove("is-transitioning");
            projects?.classList.remove("is-fading");
            focusVignette?.classList.remove("is-on");
            projectPanel?.focus();
            if (!isMobileUI) startPanelTilt();

            warpTarget = 0;
            starCinematicLock = true;
            starsFreeze = true;
            starsImpulseEnabled = false;
        };
    } else {
        const phaseOneMs = Math.round(CLONE_TRANSITION_MS * 0.65);
        clone.style.transition = `transform ${phaseOneMs}ms cubic-bezier(0.25, 0.9, 0.2, 1)`;
        clone.style.transform = mid;
        window.setTimeout(() => {
            clone.style.transition = `transform ${CLONE_TRANSITION_MS - phaseOneMs}ms cubic-bezier(0.2, 0.7, 0.2, 1)`;
            clone.style.transform = end;
            window.setTimeout(() => {
                clone.remove();
                setProjectViewContent(activeProject);
                projectView.classList.add("is-open");
                projectView.setAttribute("aria-hidden", "false");
                document.body.classList.add("is-project-open");
                document.body.classList.remove("is-transitioning");
                projects?.classList.remove("is-fading");
                focusVignette?.classList.remove("is-on");
                projectPanel?.focus();
                if (!isMobileUI) startPanelTilt();
                warpTarget = 0;
                starCinematicLock = true;
                starsFreeze = true;
                starsImpulseEnabled = false;
            }, CLONE_TRANSITION_MS - phaseOneMs);
        }, 20);
    }

    focusVignette?.classList.add("is-on");
}

/**
 * Fecha o projeto aberto e restaura o estado global da pagina.
 * Em desktop tenta animar o retorno ao card original; em mobile aplica cleanup imediato.
 */
const closeProject = () => {
    const wasTransitioning = document.body.classList.contains("is-transitioning");
    const isOpen = projectView?.classList.contains("is-open");

    /**
     * Consolida a limpeza de estados visuais e flags de animacao.
     */
    const cleanupProjectState = () => {
        setActiveCardHidden(false);
        document.body.classList.remove("is-transitioning", "is-project-open", "modal-open");
        projectView?.classList.remove("is-open");
        projectView?.setAttribute("aria-hidden", "true");
        projects?.classList.remove("is-fading");
        focusVignette?.classList.remove("is-on");
        stopPanelTilt();
        activeCard = null;
        activeCardRect = null;
        activeProject = null;
        starCinematicLock = false;
        starsFreeze = false;
        starsImpulseEnabled = true;
        lastScrollY = window.scrollY;
        lastScrollT = performance.now();
        scrollImpulse = 0;
        scrollImpulseTarget = 0;
        warpTarget = 0;
        warp = 0;
    };

    if (!projectView) {
        // Fallback seguro caso o DOM do modal nao exista.
        cleanupProjectState();
        return;
    }

    if (wasTransitioning && !isOpen) {
        // Evita ficar preso em "is-transitioning" se algo falhou antes de abrir.
        cleanupProjectState();
        return;
    }

    if (isMobileUI) {
        cleanupProjectState();
        return;
    }

    document.body.classList.add("is-transitioning");
    projectView.classList.remove("is-open");
    projectView.setAttribute("aria-hidden", "true");
    stopPanelTilt();
    focusVignette?.classList.remove("is-on");

    if (!projectPanel) {
        // Sem painel para animar: cleanup completo e desbloqueia.
        cleanupProjectState();
        return;
    }

    if (!activeCard) {
        projectPanel.style.opacity = "";
        projectPanel.style.pointerEvents = "";
        cleanupProjectState();
        return;
    }

    const targetRect = activeCard.getBoundingClientRect();
    const panelRect = projectPanel.getBoundingClientRect();
    const closeClone = activeCard.cloneNode(true);
    closeClone.classList.add("is-close-clone");
    closeClone.classList.remove("is-source-hidden");
    closeClone.style.top = `${panelRect.top}px`;
    closeClone.style.left = `${panelRect.left}px`;
    closeClone.style.width = `${panelRect.width}px`;
    closeClone.style.height = `${panelRect.height}px`;
    closeClone.style.transform = "translate3d(0px, 0px, 0) scale(1)";

    document.body.appendChild(closeClone);
    projectPanel.style.opacity = "0";
    projectPanel.style.pointerEvents = "none";

    closeClone.getBoundingClientRect();

    const scaleX = targetRect.width / panelRect.width;
    const scaleY = targetRect.height / panelRect.height;
    const translateX = (targetRect.left + targetRect.width / 2) - (panelRect.left + panelRect.width / 2);
    const translateY = (targetRect.top + targetRect.height / 2) - (panelRect.top + panelRect.height / 2);
    const duration = CLONE_CLOSE_MS;
    const settleTranslateX = translateX * 0.9;
    const settleTranslateY = translateY * 0.9;

    const finalizeClose = () => {
        closeClone.remove();
        if (projectPanel) {
            projectPanel.style.opacity = "";
            projectPanel.style.pointerEvents = "";
        }
        cleanupProjectState();
    };

    if (closeClone.animate) {
        const animation = closeClone.animate(
            [
                {
                    transform: "translate3d(0px, 0px, 0) scale(1)",
                    opacity: 1,
                    offset: 0
                },
                {
                    transform: `translate3d(${settleTranslateX}px, ${settleTranslateY}px, 0) scale(${scaleX}, ${scaleY})`,
                    opacity: 0.94,
                    offset: 0.72,
                    easing: "cubic-bezier(0.22, 0.9, 0.2, 1)"
                },
                {
                    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`,
                    opacity: 0.88,
                    offset: 1,
                    easing: "cubic-bezier(0.2, 0.72, 0.2, 1)"
                }
            ],
            { duration, fill: "forwards" }
        );
        animation.onfinish = finalizeClose;
    } else {
        const phaseOneMs = Math.round(duration * 0.72);
        closeClone.style.transition = `transform ${phaseOneMs}ms cubic-bezier(0.22, 0.9, 0.2, 1), opacity ${phaseOneMs}ms ease`;
        closeClone.style.transform = `translate3d(${settleTranslateX}px, ${settleTranslateY}px, 0) scale(${scaleX}, ${scaleY})`;
        closeClone.style.opacity = "0.94";
        window.setTimeout(() => {
            closeClone.style.transition = `transform ${duration - phaseOneMs}ms cubic-bezier(0.2, 0.72, 0.2, 1), opacity ${duration - phaseOneMs}ms ease`;
            closeClone.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;
            closeClone.style.opacity = "0.88";
            window.setTimeout(finalizeClose, duration - phaseOneMs);
        }, 20);
    }
};

/**
 * Navega para o link do projeto ativo respeitando o alvo configurado no card.
 */
const visitProject = () => {
    if (!activeProject?.href || document.body.classList.contains("is-transitioning")) return;

    document.body.classList.add("is-transitioning");
    projectView?.classList.remove("is-open");
    projectView?.setAttribute("aria-hidden", "true");
    stopPanelTilt();
    focusVignette?.classList.remove("is-on");

    window.setTimeout(() => {
        if (activeProject.targetBlank) {
            window.open(activeProject.href, "_blank");
            setActiveCardHidden(false);
            document.body.classList.remove("is-transitioning");
            document.body.classList.remove("is-project-open");
            projects?.classList.remove("is-fading");
            activeCard = null;
            activeCardRect = null;
            activeProject = null;
            starCinematicLock = false;
            starsFreeze = false;
            starsImpulseEnabled = true;
            lastScrollY = window.scrollY;
            lastScrollT = performance.now();
            scrollImpulse = 0;
            scrollImpulseTarget = 0;
            warpTarget = 0;
            warp = 0;
        } else {
            window.location.href = activeProject.href;
        }
    }, 300);
};

projectCards.forEach(card => {
    card.addEventListener("mouseenter", () => {
        playHoverSfx();
    });
    card.addEventListener("click", (e) => {
        if (!projects || projects.classList.contains("hidden") || document.body.classList.contains("is-transitioning")) {
            e.preventDefault();
            return;
        }
        if (!audioMuted && audioArmed) {
            sfxClick.currentTime = 0;
            sfxClick.play().catch(() => {});
        }
        e.preventDefault();
        openProject(card);
    });
});

projectBackdrop?.addEventListener("click", closeProject);
projectBack?.addEventListener("click", () => {
    playClickSfx();
    closeProject();
});
projectVisit?.addEventListener("click", visitProject);

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && projectView?.classList.contains("is-open")) {
        closeProject();
    }
});
/* =========================
   NAV TECH (hover desktop + toggle mobile)
========================= */
(() => {
  const nav = document.querySelector(".nav-tech");
  if (!nav) return;

  const btn = nav.querySelector(".nav-tech__toggle");
  const links = nav.querySelectorAll("[data-nav]");
  const brand = nav.querySelector(".nav-tech__brand");

  const coarseQuery = window.matchMedia("(hover: none), (pointer: coarse)");
  const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const isCoarse = () => coarseQuery.matches;

  /**
   * Controla o estado visual e ARIA do menu da navbar no mobile.
   *
   * @param {boolean} open
   */
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    if (btn) btn.setAttribute("aria-expanded", String(open));
  };

  // Mobile: botão abre/fecha
  btn?.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    setOpen(open);
    // som de clique (usa tua função existente)
    try { playClickSfx(); } catch (_) {}
  });

  // Fecha ao clicar fora (mobile)
  document.addEventListener("pointerdown", (e) => {
    if (!isCoarse()) return;
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(e.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!nav.classList.contains("is-open")) return;
    // Fechar no ESC evita estado preso quando o menu abre no mobile.
    setOpen(false);
  });

  const syncPointerMode = () => {
    // Ao voltar para desktop, garante que o menu nÇœo fique travado aberto.
    if (fineQuery.matches) setOpen(false);
  };
  coarseQuery.addEventListener("change", syncPointerMode);
  fineQuery.addEventListener("change", syncPointerMode);

  // Mapeia destinos de scroll usando o meio das faixas para evitar estados limítrofes.
  /**
   * Faz a navegacao entre secoes pela navbar sem depender de anchors estaticas.
   *
   * @param {string | null} key
   */
  const scrollToSection = (key) => {
    const [yHero, ySobre, yContato, yProjects] = getScrollTargets();

    if (key === "sobre") window.scrollTo({ top: ySobre, behavior: "smooth" });
    else if (key === "contato") window.scrollTo({ top: yContato, behavior: "smooth" });
    else if (key === "projects") window.scrollTo({ top: yProjects, behavior: "smooth" });
    else if (key === "sound") {
      // aciona o controle unificado de som
      toggleSound();
    } else {
      window.scrollTo({ top: yHero, behavior: "smooth" });
    }
  };

  links.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();

      // não mexe se modal aberto/transição
      if (document.body.classList.contains("is-transitioning") ||
          document.body.classList.contains("is-project-open")) {
        try { playClickSfx(); } catch (_) {}
        return;
      }

      const key = el.getAttribute("data-nav");
      try { playClickSfx(); } catch (_) {}
      scrollToSection(key);

      // fecha no mobile
      if (isCoarse()) setOpen(false);
    });
  });

  // Hover sfx na navbar usa o mesmo cooldown/global dos cards.
  brand?.addEventListener("mouseenter", playHoverSfx);
  btn?.addEventListener("mouseenter", playHoverSfx);
  links.forEach((el) => el.addEventListener("mouseenter", playHoverSfx));

  brand?.addEventListener("click", (e) => {
    e.preventDefault();

    if (document.body.classList.contains("is-transitioning") ||
        document.body.classList.contains("is-project-open")) {
      try { playClickSfx(); } catch (_) {}
      return;
    }

    try { playClickSfx(); } catch (_) {}
    // Usa 5px para evitar acionar o loop de scroll no topo.
    window.scrollTo({ top: 5, behavior: "smooth" });
    if (isCoarse()) setOpen(false);
  });

  // Se o boot loader estiver ativo, mantém a nav invisível (opcional, mas fica mais “cinema”)
  /**
   * Mantem a navbar invisivel enquanto o boot loader estiver ativo.
   */
  const syncBoot = () => {
    const booting = document.body.classList.contains("is-booting");
    nav.style.opacity = booting ? "0" : "1";
    nav.style.pointerEvents = booting ? "none" : "";
  };
  syncBoot();
  const obs = new MutationObserver(syncBoot);
  obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();

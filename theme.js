/* =========================
   THEME MANAGER
========================= */
(function () {
    const HTML = document.documentElement;
    const STORAGE_KEY = "portfolio-theme";
    const DARK = "dark";
    const LIGHT = "light";
    const META_THEME = document.querySelector('meta[name="theme-color"]');
    const META_COLORS = {
        dark: "#000000",
        light: "#f5f0e8"
    };

    function getInitialTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === DARK || saved === LIGHT) return saved;
        // Padrão sempre escuro — portfólio dark-first
        return DARK;
    }

    function applyTheme(theme, animate) {
        if (!animate) {
            HTML.style.transition = "none";
        }

        HTML.setAttribute("data-theme", theme);

        if (META_THEME) {
            META_THEME.setAttribute("content", META_COLORS[theme] || META_COLORS.dark);
        }

        if (!animate) {
            void HTML.offsetHeight; // força reflow para aplicar transition: none
            HTML.style.transition = "";
        }

        localStorage.setItem(STORAGE_KEY, theme);
    }

    // Aplica imediatamente sem animação para evitar flash
    applyTheme(getInitialTheme(), false);

    function initToggle() {
        const btn = document.getElementById("themeToggle");
        if (!btn) return;

        btn.addEventListener("click", () => {
            const current = HTML.getAttribute("data-theme") || DARK;
            applyTheme(current === DARK ? LIGHT : DARK, true);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initToggle);
    } else {
        initToggle();
    }
})();

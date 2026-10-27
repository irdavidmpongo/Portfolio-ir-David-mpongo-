"use strict";

/* Comportements partagés : thème, menu mobile, retour en haut, confidentialité. */
(function () {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* stockage indisponible */ } }
  };

  /* Thème clair / sombre */
  const body = document.body;
  const themeBtn = $("themeToggle");
  if (store.get("davbot-theme") === "light") body.classList.add("light");
  const syncTheme = () => {
    if (!themeBtn) return;
    const light = body.classList.contains("light");
    themeBtn.innerHTML = light ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    themeBtn.setAttribute("aria-pressed", String(light));
  };
  syncTheme();
  themeBtn?.addEventListener("click", () => {
    body.classList.toggle("light");
    store.set("davbot-theme", body.classList.contains("light") ? "light" : "dark");
    syncTheme();
  });

  /* Menu mobile */
  const nav = $("nav");
  const menuBtn = $("menuToggle");
  const setMenu = (open) => {
    nav?.classList.toggle("open", open);
    menuBtn?.setAttribute("aria-expanded", String(open));
  };
  menuBtn?.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

  /* Apparition au scroll */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("visible"));
  }

  /* Retour en haut */
  const topBtn = $("topBtn");
  window.addEventListener("scroll", () => topBtn?.classList.toggle("show", window.scrollY > 500), { passive: true });
  topBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* Paramètres de confidentialité (préférences locales, aucun cookie publicitaire) */
  const panel = $("privacyPanel");
  if (!panel) return;
  const analytics = $("privacyAnalytics");
  const external = $("privacyExternal");
  try {
    const saved = JSON.parse(store.get("davbot-privacy") || "null");
    if (saved) {
      if (analytics) analytics.checked = !!saved.analytics;
      if (external) external.checked = saved.external !== false;
    }
  } catch (_) { /* préférences illisibles : valeurs par défaut */ }

  let lastFocus = null;
  const show = () => { lastFocus = document.activeElement; panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); $("privacyClose")?.focus(); };
  const hide = () => { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); lastFocus?.focus?.(); };
  const persist = () => store.set("davbot-privacy", JSON.stringify({
    analytics: !!analytics?.checked, external: !!external?.checked, updatedAt: new Date().toISOString()
  }));

  $("privacyOpen")?.addEventListener("click", show);
  $("privacyClose")?.addEventListener("click", hide);
  panel.addEventListener("click", (e) => { if (e.target === panel) hide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) hide(); });
  $("privacySave")?.addEventListener("click", () => { persist(); hide(); });
  $("privacyReject")?.addEventListener("click", () => {
    if (analytics) analytics.checked = false;
    if (external) external.checked = false;
    persist(); hide();
  });
})();

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

/* Page d'accueil : simulateur solaire et formulaire de contact (WhatsApp). */
(function () {
  const WA_NUMBER = "243982697752";
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  /* Simulateur solaire : pertes système 25 %, panneaux 400 W, décharge batterie 80 % */
  const conso = $("slConso"), sun = $("slSun"), aut = $("slAut");
  function calc() {
    const c = +conso.value, s = +sun.value, a = +aut.value;
    const kwc = (c * 1.25) / s;
    const panels = Math.ceil((kwc * 1000) / 400);
    const battery = a > 0 ? (c * a) / 0.8 : 0;
    const autText = a > 0 ? `${fmt(a)} ${a > 1 ? "jours" : "jour"}` : "sans batterie";

    $("oConso").textContent = `${fmt(c)} kWh`;
    $("oSun").textContent = `${fmt(s)} h/jour`;
    $("oAut").textContent = autText;
    $("rKwc").textContent = fmt(kwc);
    $("rPan").textContent = panels;
    $("rBat").textContent = fmt(battery);

    const msg = `Bonjour David, je souhaite une étude solaire : ${fmt(c)} kWh/jour, ${fmt(s)} h de soleil, ` +
      `autonomie ${autText} (estimation : ${fmt(kwc)} kWc, ${panels} panneaux, batterie ${fmt(battery)} kWh).`;
    const link = $("rWa");
    link.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  if (conso && sun && aut) {
    [conso, sun, aut].forEach((el) => el.addEventListener("input", calc));
    calc();
  }

  /* Formulaire de contact : ouvre WhatsApp avec le message prêt à envoyer */
  const form = $("waForm");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const text = `Bonjour David, je suis ${d.get("name")} (${d.get("email")}).\nService : ${d.get("service")}\n\n${d.get("message")}`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    $("formStatus").textContent = "WhatsApp s’ouvre avec votre message. Si rien ne s’affiche, écrivez à davbotapp@gmail.com.";
  });
})();

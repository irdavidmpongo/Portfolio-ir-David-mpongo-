/* DAVBOT — vérification de mise à jour DANS l'application (PWA / APK).
 * À coller dans le code de l'application (une seule fois, puis publier un nouvel APK).
 * Quand le propriétaire publie une version plus récente dans le store,
 * tous les utilisateurs voient une barre « Mettre à jour » à l'ouverture de l'app.
 *
 * Réglages :
 *   APP_ID      = slug de l'application dans le store (davbot-one, davbot-ia-pro…)
 *                 ou son identifiant de 12 caractères pour une application de la communauté.
 *   APP_VERSION = version de CET APK. À changer à chaque nouvelle version publiée.
 */
(function () {
  "use strict";
  const STORE = "https://portfolio-ir-david-mpongo-v3.vercel.app";
  const APP_ID = "davbot-one";
  const APP_VERSION = "2.0.8";

  const parts = (v) => String(v).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
  function isNewer(a, b) {
    const pa = parts(a), pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }

  function showBanner(info) {
    if (document.getElementById("davbot-update-bar")) return;
    const bar = document.createElement("div");
    bar.id = "davbot-update-bar";
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:14px;background:#10b981;color:#04210f;font:600 14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)";
    const msg = document.createElement("span");
    msg.textContent = "Nouvelle version " + info.version + " disponible" + (info.changelog ? " · " + info.changelog : "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Mettre à jour";
    btn.style.cssText = "border:0;border-radius:10px;padding:9px 14px;background:#04210f;color:#fff;font:700 13px system-ui,sans-serif;cursor:pointer;white-space:nowrap";
    btn.addEventListener("click", () => { window.location.href = info.download; });
    const close = document.createElement("button");
    close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Fermer");
    close.style.cssText = "border:0;background:transparent;color:#04210f;font:700 20px system-ui,sans-serif;cursor:pointer";
    close.addEventListener("click", () => bar.remove());
    bar.append(msg, btn, close);
    document.body.appendChild(bar);
  }

  async function check() {
    try {
      const res = await fetch(STORE + "/api/latest/" + encodeURIComponent(APP_ID), { cache: "no-store" });
      const info = await res.json();
      if (info && info.ok && isNewer(info.version, APP_VERSION)) showBanner(info);
    } catch (_) { /* hors connexion : on réessaiera plus tard */ }
  }

  check();
  setInterval(check, 6 * 60 * 60 * 1000);
})();

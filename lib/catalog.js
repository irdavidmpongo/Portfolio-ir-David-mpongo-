"use strict";

// Source unique du catalogue : data/apps.json
const catalog = require("../data/apps.json");

// Seuls les APK publiés dans ce dépôt de releases sont téléchargeables via le proxy.
const ALLOWED_PREFIX = "https://github.com/davbotapp/Publications-apk-online-/releases/download/";

/** Vue publique : le lien GitHub n'est jamais exposé au navigateur. */
function publicApps() {
  return catalog.map(({ downloadUrl, ...app }) => ({
    ...app,
    download: `/api/download/${app.id}`
  }));
}

/** Retrouve une application par id ou par slug ; ignore tout lien hors liste autorisée. */
function findApp(key) {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return null;
  const app = catalog.find((a) => String(a.id) === k || a.slug === k);
  if (!app || typeof app.downloadUrl !== "string") return null;
  return app.downloadUrl.startsWith(ALLOWED_PREFIX) ? app : null;
}

module.exports = { publicApps, findApp };

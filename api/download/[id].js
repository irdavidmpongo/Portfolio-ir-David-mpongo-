"use strict";

const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { findApp } = require("../../lib/catalog");

const UPSTREAM_TIMEOUT_MS = 15000;

// GET /api/download/:id : transmet l'APK sans renvoyer le visiteur vers GitHub.
module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, message: "Méthode non autorisée." });
  }

  const app = findApp(req.query.id);
  if (!app) return res.status(404).json({ ok: false, message: "APK introuvable." });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(app.downloadUrl, { redirect: "follow", signal: controller.signal });
    clearTimeout(timer);

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ ok: false, message: "APK momentanément indisponible." });
    }

    const filename = `${app.slug}-v${String(app.version).replace(/[^0-9A-Za-z.]/g, "")}.apk`;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const length = upstream.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);

    if (req.method === "HEAD") return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    clearTimeout(timer);
    console.error("Erreur téléchargement APK :", error && error.message);
    if (!res.headersSent) {
      return res.status(502).json({ ok: false, message: "Erreur pendant le téléchargement." });
    }
    res.destroy();
  }
};

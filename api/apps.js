"use strict";

const { publicApps } = require("../lib/catalog");

// GET /api/apps : catalogue du Store, sans lien de téléchargement direct.
module.exports = function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, message: "Méthode non autorisée." });
  }
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json({ ok: true, apps: publicApps() });
};

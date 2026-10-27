"use strict";

// Vérification locale : node scripts/check.js
const fs = require("node:fs");
const path = require("node:path");
const { publicApps, findApp } = require("../lib/catalog");

const root = path.join(__dirname, "..");
const errors = [];
const apps = require("../data/apps.json");

for (const a of apps) {
  if (!findApp(a.id)) errors.push(`APK non téléchargeable : ${a.name}`);
  if (a.icon.startsWith("/") && !fs.existsSync(path.join(root, "public", a.icon))) errors.push(`Icône introuvable : ${a.icon}`);
}
if (publicApps().some((a) => "downloadUrl" in a)) errors.push("downloadUrl exposé par l'API");
if (apps.length !== 2) errors.push(`Le catalogue doit contenir 2 applications (${apps.length} trouvées)`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`OK : ${apps.length} applications, aucun lien exposé.`);

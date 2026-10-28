"use strict";

// DAVBOT Store — UNE seule fonction Vercel :  /api/store?action=…
//   list · icon · download · latest  (public, sans compte)
//   login · me · init · chunk · finish · abort · remove   (compte Davbot One requis)
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const fb = require("../backend/firebase");
const official = require("../data/apps.json");

const { httpError } = fb;
const ALLOWED_PREFIX = "https://github.com/davbotapp/Publications-apk-online-/releases/download/";
const CATEGORIES = ["IA", "Outils", "Jeux", "Social", "Éducation", "Finance", "Autre"];
const MAX_APK = 10 * 1024 * 1024;       // APK stockés dans la Realtime Database (base64)
const CHUNK = 512 * 1024;              // morceau envoyé par le navigateur (512 Ko → ~700 Ko en base64)
const MAX_TOTAL = 400 * 1024 * 1024;   // total maximum d'APK communautaires (la base gratuite fait 1 Go)
const MIN_APK = 50 * 1024;
const MAX_APPS_PER_USER = 5;
const MAX_ICON = 60 * 1024;

// ---------- utilitaires ----------
const hits = new Map();
function rateLimit(key, max = 12, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.exp < now) hits.set(key, { count: 1, exp: now + windowMs });
  else if (++rec.count > max) throw httpError("Trop de tentatives. Réessayez dans quelques minutes.", 429);
  if (hits.size > 5000) hits.clear();
}
const fileKey = (id, r) => (r && r.fileKey) || id;
const isAdmin = (s) => fb.STORE_ADMINS.includes(s.p);
// true si la version a est strictement supérieure à la version b (ex. 2.1 > 2.0.8)
function newer(a, b) {
  const pa = String(a).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}
const ip = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
const ownerId = (phone) => crypto.createHash("sha256").update(String(phone)).digest("hex").slice(0, 12);
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const body = (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (_) { return {}; }
};
const reply = (res, status, data, cache = "no-store") => {
  res.setHeader("Cache-Control", cache);
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(data);
};
function sizeLabel(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
function session(req) {
  const h = String(req.headers.authorization || "");
  const s = fb.verifySession(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!s) throw httpError("Connexion Davbot One requise.", 401);
  return s;
}

// ---------- vue publique ----------
function publicOfficial(a, stats) {
  const { downloadUrl, ...rest } = a;
  return { ...rest, id: String(a.id), official: true, downloads: (a.downloads || 0) + ((stats[a.id] || {}).downloads || 0), download: `/api/download/${a.id}` };
}
function publicCommunity(id, r, stats) {
  return {
    id, slug: r.slug, name: r.name, icon: r.hasIcon ? `/api/icon/${id}` : "", developer: r.ownerName,
    category: r.category, version: r.version, size: sizeLabel(r.size), downloads: (stats[id] || {}).downloads || 0,
    stars: 0, premium: false, tags: r.tags || [], description: r.description, official: false,
    ownerId: r.owner, publishedAt: r.publishedAt, updatedAt: r.updatedAt || 0, changelog: r.changelog || "", download: `/api/download/${id}`
  };
}

// ---------- actions publiques ----------
async function list(req, res) {
  const [apps, stats] = await Promise.all([fb.db("store/apps").catch(() => null), fb.db("store/stats").catch(() => null)]);
  const st = stats || {};
  const community = Object.entries(apps || {})
    .filter(([, r]) => r && r.status === "published")
    .sort((a, b) => (b[1].publishedAt || 0) - (a[1].publishedAt || 0))
    .map(([id, r]) => publicCommunity(id, r, st));
  return reply(res, 200, { ok: true, apps: [...official.map((a) => publicOfficial(a, st)), ...community] }, "public, s-maxage=30, stale-while-revalidate=120");
}

async function icon(req, res) {
  const id = String(req.query.id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) return res.status(404).end();
  const r = await fb.db(`store/icons/${id}`);
  const m = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(r || ""));
  if (!m) return res.status(404).end();
  res.setHeader("Content-Type", `image/${m[1]}`);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(Buffer.from(m[2], "base64"));
}

async function bump(id) {
  await fb.db(`store/stats/${id}`, "PATCH", { downloads: { ".sv": { increment: 1 } } }).catch(() => {});
}

async function download(req, res) {
  const key = String(req.query.id || "").trim().toLowerCase();
  const off = official.find((a) => String(a.id) === key || a.slug === key);
  if (off) {
    if (!String(off.downloadUrl).startsWith(ALLOWED_PREFIX)) return reply(res, 404, { ok: false, message: "APK introuvable." });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const up = await fetch(off.downloadUrl, { redirect: "follow", signal: ctl.signal });
      clearTimeout(timer);
      if (!up.ok || !up.body) return reply(res, 502, { ok: false, message: "APK momentanément indisponible." });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${off.slug}-v${String(off.version).replace(/[^0-9A-Za-z.]/g, "")}.apk"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      const len = up.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      if (req.method === "HEAD") return res.end();
      await bump(off.id);
      return await pipeline(Readable.fromWeb(up.body), res);
    } catch (e) {
      clearTimeout(timer);
      if (!res.headersSent) return reply(res, 502, { ok: false, message: "Erreur pendant le téléchargement." });
      return res.destroy();
    }
  }
  if (!/^[a-f0-9]{12}$/.test(key)) return reply(res, 404, { ok: false, message: "APK introuvable." });
  const r = await fb.db(`store/apps/${key}`);
  if (!r || r.status !== "published") return reply(res, 404, { ok: false, message: "APK introuvable." });
  const file = `${r.slug}-v${String(r.version).replace(/[^0-9A-Za-z.]/g, "")}.apk`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
  res.setHeader("Content-Length", String(r.size));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") return res.end();
  await bump(key);
  const count = Math.ceil(r.size / CHUNK);
  const fk = fileKey(key, r);
  for (let i = 0; i < count; i++) {
    const part = await fb.db(`store/files/${fk}/c${i}`);
    if (typeof part !== "string") return res.destroy();
    if (!res.write(Buffer.from(part, "base64"))) await new Promise((ok) => res.once("drain", ok));
  }
  return res.end();
}

// ---------- compte Davbot One ----------
async function findUser(identity) {
  if (/^\+?\d{6,16}$/.test(identity)) {
    for (const k of [identity, identity.startsWith("+") ? identity.slice(1) : "+" + identity]) {
      const u = await fb.db(`users/${k}`);
      if (u) return { key: k, user: u };
    }
  }
  const lower = identity.toLowerCase();
  for (const value of new Set([identity, lower])) {
    const q = `orderBy=${encodeURIComponent('"email"')}&equalTo=${encodeURIComponent(JSON.stringify(value))}&limitToFirst=1`;
    const found = await fb.db("users", "GET", undefined, q).catch(() => null);
    const hit = found && Object.entries(found)[0];
    if (hit) return { key: hit[0], user: hit[1] };
  }
  return null;
}

async function login(req, res) {
  const b = body(req);
  const identity = clean(b.identity, 254);
  const password = String(b.password || "").slice(0, 64);
  if (!identity || !password) throw httpError("Veuillez remplir les champs obligatoires.");
  rateLimit(`login:${ip(req)}:${identity.toLowerCase()}`, 8);
  const found = await findUser(identity);
  if (!found) throw httpError("Compte Davbot One introuvable. Vérifiez votre numéro ou Gmail.", 404);
  const { key, user } = found;
  if (typeof user.password !== "string" || !fb.safeEqual(user.password, password)) throw httpError("Mot de passe incorrect.", 401);
  if (user.blocked === true || user.status === "blocked") throw httpError("Ce compte est bloqué par l'administration DAVBOT.", 403);
  const name = clean(user.name || "Utilisateur Davbot", 40);
  const { token, exp } = fb.signSession({ p: key, n: name });
  return reply(res, 200, { ok: true, token, exp, name, ownerId: ownerId(key) });
}

async function me(req, res) {
  const s = session(req);
  return reply(res, 200, { ok: true, name: s.n, ownerId: ownerId(s.p), exp: s.exp });
}

// ---------- publication d'un APK ----------
async function init(req, res) {
  const s = session(req);
  rateLimit(`init:${ip(req)}`, 10);
  const b = body(req);
  if (b.appId) return initUpdate(res, s, b);
  const name = clean(b.name, 40);
  const version = clean(b.version, 16);
  const category = CATEGORIES.includes(b.category) ? b.category : "Autre";
  const description = clean(b.description, 600);
  const size = Number(b.size);
  const filename = clean(b.filename, 120);
  const tags = String(b.tags || "").split(",").map((t) => clean(t, 20)).filter(Boolean).slice(0, 4);
  if (name.length < 2) throw httpError("Le nom doit contenir au moins 2 caractères.");
  if (!/^[0-9A-Za-z._-]{1,16}$/.test(version)) throw httpError("Version invalide (ex. 1.0).");
  if (description.length < 10) throw httpError("La description doit contenir au moins 10 caractères.");
  if (!/\.apk$/i.test(filename)) throw httpError("Seuls les fichiers .apk sont acceptés.");
  if (!Number.isInteger(size) || size < MIN_APK || size > MAX_APK) throw httpError(`L'APK doit faire entre 50 Ko et ${MAX_APK / 1048576} Mo.`);
  let iconData = String(b.icon || "");
  if (iconData && (iconData.length > MAX_ICON * 1.4 || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(iconData))) iconData = "";

  const live = Object.values((await fb.db("store/apps")) || {}).filter((r) => r && (r.status === "published" || (r.status === "uploading" && r.createdAt > Date.now() - 3600000)));
  const mine = live.filter((r) => r.owner === ownerId(s.p));
  const all = live;
  if (all.reduce((n, r) => n + (r.size || 0), 0) + size > MAX_TOTAL) throw httpError("Le store est plein pour le moment. Réessayez plus tard.", 507);
  if (mine.length >= MAX_APPS_PER_USER) throw httpError(`Limite atteinte : ${MAX_APPS_PER_USER} applications par compte. Supprimez-en une d'abord.`, 403);

  const id = crypto.randomBytes(6).toString("hex");
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "app";
  await fb.db(`store/apps/${id}`, "PUT", {
    status: "uploading", owner: ownerId(s.p), ownerPhone: s.p, ownerName: s.n, name, slug, version, category,
    description, tags, size, hasIcon: !!iconData, createdAt: Date.now()
  });
  if (iconData) await fb.db(`store/icons/${id}`, "PUT", iconData);
  return reply(res, 200, { ok: true, id, chunk: CHUNK });
}

// Mise à jour d'une application existante : même id, même lien, nouvelle version.
// Le nouvel APK est envoyé dans un dossier séparé (pending) et ne remplace l'ancien qu'après vérification.
async function initUpdate(res, s, b) {
  const appId = String(b.appId);
  if (!/^[a-f0-9]{12}$/.test(appId)) throw httpError("Application invalide.");
  const r = await fb.db(`store/apps/${appId}`);
  if (!r || r.status !== "published") throw httpError("Application introuvable.", 404);
  if (r.ownerPhone !== s.p && !isAdmin(s)) throw httpError("Seul le propriétaire peut mettre à jour cette application.", 403);
  const version = clean(b.version, 16);
  const size = Number(b.size);
  const filename = clean(b.filename, 120);
  const changelog = clean(b.changelog, 300);
  if (!/^[0-9A-Za-z._-]{1,16}$/.test(version)) throw httpError("Version invalide (ex. 2.1).");
  if (!newer(version, r.version)) throw httpError(`La nouvelle version doit être supérieure à la version actuelle (${r.version}).`);
  if (!/\.apk$/i.test(filename)) throw httpError("Seuls les fichiers .apk sont acceptés.");
  if (!Number.isInteger(size) || size < MIN_APK || size > MAX_APK) throw httpError(`L'APK doit faire entre 50 Ko et ${MAX_APK / 1048576} Mo.`);
  const live = Object.values((await fb.db("store/apps")) || {}).filter((x) => x && (x.status === "published" || (x.status === "uploading" && x.createdAt > Date.now() - 3600000)));
  if (live.reduce((n, x) => n + (x.size || 0), 0) + size > MAX_TOTAL) throw httpError("Le store est plein pour le moment. Réessayez plus tard.", 507);
  if (r.pending && r.pending.fileKey) await fb.db(`store/files/${r.pending.fileKey}`, "DELETE").catch(() => {});
  const fk = crypto.randomBytes(6).toString("hex");
  await fb.db(`store/apps/${appId}/pending`, "PUT", { fileKey: fk, version, size, changelog, createdAt: Date.now() });
  return reply(res, 200, { ok: true, id: appId, chunk: CHUNK, update: true });
}

// Reçoit un morceau de l'APK (base64) et l'écrit dans store/files/<id>/c<i>.
async function chunk(req, res) {
  const s = session(req);
  rateLimit(`chunk:${ip(req)}`, 400);
  const b = body(req);
  const id = String(b.id || "");
  const i = Number(b.i);
  const data = String(b.data || "");
  if (!/^[a-f0-9]{12}$/.test(id) || !Number.isInteger(i) || i < 0) throw httpError("Morceau invalide.");
  const r = await fb.db(`store/apps/${id}`);
  let key, size;
  if (r && r.status === "uploading" && r.ownerPhone === s.p) { key = id; size = r.size; }
  else if (r && r.status === "published" && r.pending && (r.ownerPhone === s.p || isAdmin(s))) { key = r.pending.fileKey; size = r.pending.size; }
  else throw httpError("Publication introuvable.", 404);
  const count = Math.ceil(size / CHUNK);
  if (i >= count) throw httpError("Morceau hors limites.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw httpError("Morceau illisible.");
  const expected = i === count - 1 ? size - CHUNK * (count - 1) : CHUNK;
  if (Buffer.from(data, "base64").length !== expected) throw httpError("Taille du morceau incorrecte.", 422);
  await fb.db(`store/files/${key}/c${i}`, "PUT", data);
  return reply(res, 200, { ok: true, i });
}

async function dropRecord(id, r) {
  const jobs = [fb.db(`store/files/${fileKey(id, r)}`, "DELETE"), fb.db(`store/apps/${id}`, "DELETE"), fb.db(`store/icons/${id}`, "DELETE"), fb.db(`store/stats/${id}`, "DELETE")];
  if (r && r.pending && r.pending.fileKey) jobs.push(fb.db(`store/files/${r.pending.fileKey}`, "DELETE"));
  await Promise.all(jobs);
}

async function dropPending(id, r) {
  if (r && r.pending && r.pending.fileKey) await fb.db(`store/files/${r.pending.fileKey}`, "DELETE").catch(() => {});
  await fb.db(`store/apps/${id}`, "PATCH", { pending: null }).catch(() => {});
}

// Vérifie qu'un envoi est complet et que c'est un vrai APK (ZIP contenant AndroidManifest.xml).
async function verifyApk(key, size) {
  const count = Math.ceil(size / CHUNK);
  const keys = Object.keys((await fb.db(`store/files/${key}`, "GET", undefined, "shallow=true")) || {});
  if (keys.length !== count) return "L'envoi est incomplet. Recommencez la publication.";
  const first = Buffer.from((await fb.db(`store/files/${key}/c0`)) || "", "base64");
  const last = Buffer.from((await fb.db(`store/files/${key}/c${count - 1}`)) || "", "base64");
  const prev = count > 1 ? Buffer.from((await fb.db(`store/files/${key}/c${count - 2}`)) || "", "base64") : Buffer.alloc(0);
  const tail = Buffer.concat([prev, last]);
  const isZip = first.length >= 4 && first[0] === 0x50 && first[1] === 0x4b && first[2] === 0x03 && first[3] === 0x04;
  if (!isZip || !tail.includes(Buffer.from("AndroidManifest.xml"))) return "Ce fichier n'est pas un APK Android valide.";
  return "";
}

async function finish(req, res) {
  const s = session(req);
  const id = String(body(req).id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Publication invalide.");
  const r = await fb.db(`store/apps/${id}`);
  if (!r) throw httpError("Publication introuvable.", 404);

  // Mise à jour d'une application déjà publiée
  if (r.status === "published" && r.pending) {
    if (r.ownerPhone !== s.p && !isAdmin(s)) throw httpError("Publication introuvable.", 404);
    const p = r.pending;
    const problem = await verifyApk(p.fileKey, p.size);
    if (problem) { await dropPending(id, r); throw httpError(problem, 422); }
    const oldKey = fileKey(id, r);
    const updatedAt = Date.now();
    await fb.db(`store/apps/${id}`, "PATCH", { version: p.version, size: p.size, fileKey: p.fileKey, changelog: p.changelog || "", updatedAt, pending: null });
    if (oldKey !== p.fileKey) await fb.db(`store/files/${oldKey}`, "DELETE").catch(() => {});
    return reply(res, 200, { ok: true, updated: true, app: publicCommunity(id, { ...r, version: p.version, size: p.size, changelog: p.changelog || "", updatedAt }, {}) });
  }

  if (r.ownerPhone !== s.p) throw httpError("Publication introuvable.", 404);
  if (r.status === "published") return reply(res, 200, { ok: true, app: publicCommunity(id, r, {}) });
  const problem = await verifyApk(fileKey(id, r), r.size);
  if (problem) { await dropRecord(id, r); throw httpError(problem, 422); }
  const publishedAt = Date.now();
  await fb.db(`store/apps/${id}`, "PATCH", { status: "published", publishedAt });
  return reply(res, 200, { ok: true, app: publicCommunity(id, { ...r, publishedAt }, {}) });
}

// Annule une mise à jour en cours (l'application actuelle reste intacte).
async function abort(req, res) {
  const s = session(req);
  const id = String(body(req).id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Application invalide.");
  const r = await fb.db(`store/apps/${id}`);
  if (!r || (r.ownerPhone !== s.p && !isAdmin(s))) throw httpError("Application introuvable.", 404);
  await dropPending(id, r);
  return reply(res, 200, { ok: true });
}

// Dernière version d'une application (public, utilisable depuis l'application elle-même).
// GET /api/latest/<slug ou id>  →  { version, download, changelog… }
async function latest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = String(req.query.id || "").trim().toLowerCase();
  const base = req.headers.host ? `https://${req.headers.host}` : "";
  const off = official.find((a) => String(a.id) === key || a.slug === key);
  let out = null;
  if (off) {
    out = { id: String(off.id), slug: off.slug, name: off.name, version: String(off.version), size: off.size, changelog: "", updatedAt: 0, official: true };
  } else if (key) {
    let id = /^[a-f0-9]{12}$/.test(key) ? key : "", r = id ? await fb.db(`store/apps/${id}`) : null;
    if (!r) {
      const all = (await fb.db("store/apps")) || {};
      const hit = Object.entries(all).filter(([, x]) => x && x.status === "published" && x.slug === key).sort((a, b) => (b[1].publishedAt || 0) - (a[1].publishedAt || 0))[0];
      if (hit) { id = hit[0]; r = hit[1]; }
    }
    if (r && r.status === "published") out = { id, slug: r.slug, name: r.name, version: String(r.version), size: sizeLabel(r.size), changelog: r.changelog || "", updatedAt: r.updatedAt || r.publishedAt || 0, official: false };
  }
  if (!out) return reply(res, 404, { ok: false, message: "Application introuvable." });
  return reply(res, 200, { ok: true, ...out, download: `${base}/api/download/${out.id}`, page: `${base}/store-apk` }, "public, s-maxage=30, stale-while-revalidate=60");
}

async function remove(req, res) {
  const s = session(req);
  const id = String(body(req).id || req.query.id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Application invalide.");
  const r = await fb.db(`store/apps/${id}`);
  if (!r) throw httpError("Application introuvable.", 404);
  if (r.ownerPhone !== s.p && !isAdmin(s)) throw httpError("Vous ne pouvez supprimer que vos applications.", 403);
  await dropRecord(id, r);
  return reply(res, 200, { ok: true });
}

const ROUTES = {
  list: ["GET", list], icon: ["GET", icon], download: ["GET", download],
  login: ["POST", login], me: ["GET", me], init: ["POST", init], chunk: ["POST", chunk], finish: ["POST", finish], abort: ["POST", abort], remove: ["POST", remove], latest: ["GET", latest]
};

module.exports = async function handler(req, res) {
  const route = ROUTES[String(req.query.action || "")];
  if (!route) return reply(res, 404, { ok: false, message: "Action inconnue." });
  const [method, fn] = route;
  const allowed = method === "GET" ? ["GET", "HEAD"] : [method];
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    return reply(res, 405, { ok: false, message: "Méthode non autorisée." });
  }
  try {
    return await fn(req, res);
  } catch (e) {
    if (!e.status || e.status >= 500) console.error("store:", req.query.action, e && e.message);
    if (res.headersSent) return res.destroy();
    return reply(res, e.status || 500, { ok: false, message: e.status ? e.message : "Erreur serveur." });
  }
};

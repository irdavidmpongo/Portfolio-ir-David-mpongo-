"use strict";

// DAVBOT Store — UNE seule fonction Vercel :  /api/store?action=…
//   list · icon · download           (public, sans compte)
//   login · me · init · finish · remove   (compte Davbot One requis)
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const fb = require("../backend/firebase");
const official = require("../data/apps.json");

const { httpError } = fb;
const ALLOWED_PREFIX = "https://github.com/davbotapp/Publications-apk-online-/releases/download/";
const CATEGORIES = ["IA", "Outils", "Jeux", "Social", "Éducation", "Finance", "Autre"];
const MAX_APK = 150 * 1024 * 1024;
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
    ownerId: r.owner, publishedAt: r.publishedAt, download: `/api/download/${id}`
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
  if (req.method !== "HEAD") await bump(key);
  const file = `${r.slug}-v${String(r.version).replace(/[^0-9A-Za-z.]/g, "")}.apk`;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", fb.signedDownloadUrl(r.object, file));
  return res.status(302).end();
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

  const origin = String(req.headers.origin || "");
  let originHost = "";
  try { originHost = new URL(origin).host; } catch (_) { /* origine absente ou invalide */ }
  if (!originHost || originHost !== String(req.headers.host)) throw httpError("Origine non autorisée.", 403);

  const mine = Object.values((await fb.db("store/apps")) || {}).filter((r) => r && r.owner === ownerId(s.p) && (r.status === "published" || (r.status === "uploading" && r.createdAt > Date.now() - 3600000)));
  if (mine.length >= MAX_APPS_PER_USER) throw httpError(`Limite atteinte : ${MAX_APPS_PER_USER} applications par compte. Supprimez-en une d'abord.`, 403);

  const id = crypto.randomBytes(6).toString("hex");
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "app";
  const object = `apk/${id}.apk`;
  const uploadUrl = await fb.startResumableUpload(object, size, origin);
  await fb.db(`store/apps/${id}`, "PUT", {
    status: "uploading", owner: ownerId(s.p), ownerPhone: s.p, ownerName: s.n, name, slug, version, category,
    description, tags, size, object, hasIcon: !!iconData, createdAt: Date.now()
  });
  if (iconData) await fb.db(`store/icons/${id}`, "PUT", iconData);
  return reply(res, 200, { ok: true, id, uploadUrl, chunk: 4 * 1024 * 1024 });
}

async function dropRecord(id, r) {
  await fb.objectDelete(r.object).catch(() => {});
  await Promise.all([fb.db(`store/apps/${id}`, "DELETE"), fb.db(`store/icons/${id}`, "DELETE"), fb.db(`store/stats/${id}`, "DELETE")]);
}

async function finish(req, res) {
  const s = session(req);
  const id = String(body(req).id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Publication invalide.");
  const r = await fb.db(`store/apps/${id}`);
  if (!r || r.ownerPhone !== s.p) throw httpError("Publication introuvable.", 404);
  if (r.status === "published") return reply(res, 200, { ok: true, app: publicCommunity(id, r, {}) });

  const meta = await fb.objectMeta(r.object);
  if (!meta || Number(meta.size) !== r.size) {
    await dropRecord(id, r);
    throw httpError("L'envoi est incomplet. Recommencez la publication.", 422);
  }
  // Vérification : archive ZIP (PK) contenant AndroidManifest.xml → vrai APK Android.
  const head = await fb.objectRange(r.object, "bytes=0-3");
  const tail = await fb.objectRange(r.object, "bytes=-524288");
  const isZip = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip || !tail.includes(Buffer.from("AndroidManifest.xml"))) {
    await dropRecord(id, r);
    throw httpError("Ce fichier n'est pas un APK Android valide.", 422);
  }
  const publishedAt = Date.now();
  await fb.db(`store/apps/${id}`, "PATCH", { status: "published", publishedAt });
  return reply(res, 200, { ok: true, app: publicCommunity(id, { ...r, publishedAt }, {}) });
}

async function remove(req, res) {
  const s = session(req);
  const id = String(body(req).id || req.query.id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Application invalide.");
  const r = await fb.db(`store/apps/${id}`);
  if (!r) throw httpError("Application introuvable.", 404);
  if (r.ownerPhone !== s.p && !fb.STORE_ADMINS.includes(s.p)) throw httpError("Vous ne pouvez supprimer que vos applications.", 403);
  await dropRecord(id, r);
  return reply(res, 200, { ok: true });
}

const ROUTES = {
  list: ["GET", list], icon: ["GET", icon], download: ["GET", download],
  login: ["POST", login], me: ["GET", me], init: ["POST", init], finish: ["POST", finish], remove: ["POST", remove]
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

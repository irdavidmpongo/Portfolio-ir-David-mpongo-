// DAVBOT Store — 100 % Cloudflare Pages (mode avancé, un seul fichier).
// Sert le site statique ET l'API du store (/api/*) : plus besoin de Render ni de Netlify.
//
// Réglages à faire UNE fois dans Cloudflare → Workers & Pages → ton projet → Settings → Variables and Secrets :
//   FIREBASE_SERVICE_ACCOUNT  (Secret)  : tout le contenu du fichier JSON du compte de service Firebase
//   STORE_ADMINS              (optionnel): numéros admin séparés par des virgules (par défaut +243967930291)
//
// Routes : /api/store?action=…  ·  /api/apps  ·  /api/download/<id>  ·  /api/latest/<id>  ·  /api/icon/<id>
//   public : list · icon · download · latest      compte Davbot One : login · me · init · chunk · finish · abort · remove

// ---- Applications officielles (même contenu que data/apps.json) ----
const OFFICIAL = [
  {
    "id": 1,
    "slug": "davbot-ia-pro",
    "name": "DAVBOT IA PRO",
    "icon": "/img/davbot-ia-pro.webp",
    "developer": "David Mpongo",
    "category": "IA",
    "version": "3.0",
    "size": "1 MB",
    "downloads": 30,
    "stars": 5,
    "premium": true,
    "tags": [
      "Hors connexion",
      "Texte",
      "Images"
    ],
    "description": "Votre assistant IA nouvelle génération : rédigez, créez des images, analysez et automatisez vos tâches grâce à des outils avancés, dans une interface rapide et élégante. Fonctionne même hors connexion, pour rester productif partout, à tout moment.",
    "downloadUrl": "https://github.com/irdavidmpongo/Publi-apk/releases/download/Davbotai/davbot-ai.apk"
  },
  {
    "id": 2,
    "slug": "davbot-one",
    "name": "DAVBOT One",
    "icon": "/img/davbot-one.webp",
    "developer": "DAVBOT",
    "category": "Outils",
    "version": "1.0",
    "size": "5 MB",
    "downloads": 7000,
    "stars": 5,
    "premium": false,
    "tags": [
      "Réseau social",
      "IA",
      "Outils"
    ],
    "description": "Plateforme tout-en-un et réseau social : discutez, publiez et partagez avec la communauté, et profitez d’outils d’IA, de développement, d’APK, de musique personnalisée, de sites web, de VPN et d’automatisation, dans une seule application simple, rapide et puissante.",
    "downloadUrl": "https://github.com/irdavidmpongo/Publi-apk/releases/download/Davbotone/Davbot-One.apk"
  }
];

const ALLOWED_PREFIX = "https://github.com/irdavidmpongo/Publi-apk/releases/download/";
const CATEGORIES = ["IA", "Outils", "Jeux", "Social", "Éducation", "Finance", "Autre"];
const MAX_APK = 10 * 1024 * 1024;
const CHUNK = 512 * 1024;
const MAX_TOTAL = 400 * 1024 * 1024;
const MIN_APK = 50 * 1024;
const MAX_APPS_PER_USER = 5;
const MAX_ICON = 60 * 1024;
const DEFAULT_ADMINS = ["+243967930291"];

let ENV = {};
let CTX = null;

// ====================================================================== outils binaires
const te = new TextEncoder();
const td = new TextDecoder();

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function b64ToBytes(s) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(s);
  const bin = atob(s);
  const n = bin.length;
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const toB64url = (u8) => bytesToB64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return b64ToBytes(s);
}
// taille en octets d'une chaîne base64 valide (sans la décoder)
function b64Len(s) {
  if (s.length % 4) return -1;
  return (s.length / 4) * 3 - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
}
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? te.encode(data) : data));
}
function randomHex(n) {
  return hex(crypto.getRandomValues(new Uint8Array(n)));
}
function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function indexOfSeq(hay, needle, from = 0) {
  const first = needle[0];
  for (let i = hay.indexOf(first, from); i !== -1 && i <= hay.length - needle.length; i = hay.indexOf(first, i + 1)) {
    let ok = true;
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}
function lastIndexOfSeq(hay, needle) {
  for (let i = hay.length - needle.length; i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

// ====================================================================== Firebase (Realtime Database, REST)
let saCache = { raw: null, sa: null, key: null, hmac: null };
function serviceAccount() {
  const raw = ENV.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw httpError("Configuration manquante : ajoute le secret FIREBASE_SERVICE_ACCOUNT dans Cloudflare.", 500);
  if (saCache.raw === raw && saCache.sa) return saCache.sa;
  let sa = raw;
  if (typeof raw === "string") {
    try { sa = JSON.parse(raw); } catch (_) { throw httpError("FIREBASE_SERVICE_ACCOUNT n'est pas un JSON valide.", 500); }
  }
  if (!sa || !sa.private_key || !sa.client_email) throw httpError("FIREBASE_SERVICE_ACCOUNT est incomplet.", 500);
  sa = { ...sa, private_key: String(sa.private_key).replace(/\\n/g, "\n") };
  saCache = { raw, sa, key: null, hmac: null };
  return sa;
}
const databaseURL = () => String(ENV.FIREBASE_DATABASE_URL || `https://${serviceAccount().project_id || "davbot-v2"}-default-rtdb.firebaseio.com`).replace(/\/+$/, "");
const storeAdmins = () => (ENV.STORE_ADMINS ? String(ENV.STORE_ADMINS).split(",").map((x) => x.trim()).filter(Boolean) : DEFAULT_ADMINS);

async function rsaKey() {
  const sa = serviceAccount();
  if (!saCache.key) {
    const der = b64ToBytes(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
    saCache.key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  }
  return saCache.key;
}

let tokenCache = { value: "", exp: 0 };
let tokenPending = null;
async function fetchToken() {
  const now = Math.floor(Date.now() / 1000);
  const sa = serviceAccount();
  const j = (v) => toB64url(te.encode(JSON.stringify(v)));
  const head = j({ alg: "RS256", typ: "JWT" });
  const claim = j({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  });
  const sig = toB64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await rsaKey(), te.encode(head + "." + claim))));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + sig
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw httpError("Jeton Firebase refusé : " + (data.error_description || data.error || res.status), 502);
  tokenCache = { value: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return tokenCache.value;
}
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp - 120 > now) return tokenCache.value;
  if (!tokenPending) tokenPending = fetchToken().finally(() => { tokenPending = null; });   // une seule demande à la fois
  return tokenPending;
}

function dbPath(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (parts.some((p) => p === ".." || p === "." || p.length > 200) || parts.length > 8) throw httpError("Chemin invalide.");
  return parts.map(encodeURIComponent).join("/");
}
async function db(path, method = "GET", body, query = "") {
  const url = `${databaseURL()}/${dbPath(path)}.json${query ? "?" + query : ""}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await accessToken()) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw httpError((data && data.error) || `Base Davbot HTTP ${res.status}`, 502);
  return data;
}

// ---- Sessions du store (jeton signé, aucun état serveur) ----
async function hmacKey() {
  const sa = serviceAccount();
  if (!saCache.hmac) {
    saCache.hmac = await crypto.subtle.importKey("raw", await sha256("davbot-store:" + sa.private_key), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  }
  return saCache.hmac;
}
async function signSession(payload, ttlMs = 12 * 3600 * 1000) {
  const exp = Date.now() + ttlMs;
  const body = toB64url(te.encode(JSON.stringify({ ...payload, exp })));
  const sig = toB64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), te.encode(body))));
  return { token: `${body}.${sig}`, exp };
}
async function verifySession(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const key = await hmacKey();   // lève une erreur claire si le secret Firebase manque
  try {
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), te.encode(body));
    if (!ok) return null;
    const p = JSON.parse(td.decode(fromB64url(body)));
    return p && p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}
async function safeEqual(a, b) {
  const ha = await sha256(String(a));
  const hb = await sha256(String(b));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// ====================================================================== utilitaires du store
const hits = new Map();
function rateLimit(key, max = 12, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.exp < now) hits.set(key, { count: 1, exp: now + windowMs });
  else if (++rec.count > max) throw httpError("Trop de tentatives. Réessayez dans quelques minutes.", 429);
  if (hits.size > 5000) hits.clear();
}
const fileKey = (id, r) => (r && r.fileKey) || id;
const isAdmin = (s) => storeAdmins().includes(s.p);
function newer(a, b) {
  const pa = String(a).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}
const clientIp = (req) => req.headers.get("CF-Connecting-IP") || String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
const ownerId = async (phone) => hex(await sha256(String(phone))).slice(0, 12);
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const readBody = async (req) => { try { const b = await req.json(); return b && typeof b === "object" ? b : {}; } catch (_) { return {}; } };
const reply = (status, data, cache = "no-store", extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff", ...extra } });
function sizeLabel(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
async function session(req) {
  const h = String(req.headers.get("authorization") || "");
  const s = await verifySession(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!s) throw httpError("Connexion Davbot One requise.", 401);
  return s;
}

// ====================================================================== vue publique
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

// ====================================================================== actions publiques
async function list() {
  const [apps, stats] = await Promise.all([db("store/apps").catch(() => null), db("store/stats").catch(() => null)]);
  const st = stats || {};
  const community = Object.entries(apps || {})
    .filter(([, r]) => r && r.status === "published")
    .sort((a, b) => (b[1].publishedAt || 0) - (a[1].publishedAt || 0))
    .map(([id, r]) => publicCommunity(id, r, st));
  return reply(200, { ok: true, apps: [...OFFICIAL.map((a) => publicOfficial(a, st)), ...community] }, "public, max-age=5");
}

async function icon(c) {
  const id = String(c.id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) return new Response(null, { status: 404 });
  const r = await db(`store/icons/${id}`);
  const m = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(r || ""));
  if (!m) return new Response(null, { status: 404 });
  return new Response(b64ToBytes(m[2]), { status: 200, headers: { "Content-Type": `image/${m[1]}`, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
}

async function bump(id) {
  await db(`store/stats/${id}`, "PATCH", { downloads: { ".sv": { increment: 1 } } }).catch(() => {});
}
const later = (p) => { if (CTX && CTX.waitUntil) CTX.waitUntil(p); };

async function download(c) {
  const key = String(c.id || "").trim().toLowerCase();
  const off = OFFICIAL.find((a) => String(a.id) === key || a.slug === key);
  if (off) {
    if (!String(off.downloadUrl).startsWith(ALLOWED_PREFIX)) return reply(404, { ok: false, message: "APK introuvable." });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const up = await fetch(off.downloadUrl, { redirect: "follow", signal: ctl.signal });
      clearTimeout(timer);
      if (!up.ok || !up.body) return reply(502, { ok: false, message: "APK momentanément indisponible." });
      const headers = {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${off.slug}-v${String(off.version).replace(/[^0-9A-Za-z.]/g, "")}.apk"`,
        "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"
      };
      const len = up.headers.get("content-length");
      if (len) headers["Content-Length"] = len;
      if (c.req.method === "HEAD") { up.body.cancel().catch(() => {}); return new Response(null, { status: 200, headers }); }
      later(bump(off.id));
      return new Response(up.body, { status: 200, headers });
    } catch (e) {
      clearTimeout(timer);
      return reply(502, { ok: false, message: "Erreur pendant le téléchargement." });
    }
  }
  if (!/^[a-f0-9]{12}$/.test(key)) return reply(404, { ok: false, message: "APK introuvable." });
  const r = await db(`store/apps/${key}`);
  if (!r || r.status !== "published") return reply(404, { ok: false, message: "APK introuvable." });
  const headers = {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${r.slug}-v${String(r.version).replace(/[^0-9A-Za-z.]/g, "")}.apk"`,
    "Content-Length": String(r.size), "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"
  };
  if (c.req.method === "HEAD") return new Response(null, { status: 200, headers });
  later(bump(key));
  const count = Math.ceil(r.size / CHUNK);
  const fk = fileKey(key, r);
  let i = 0;
  let next = db(`store/files/${fk}/c0`);
  const body = new ReadableStream({
    async pull(ctrl) {
      if (i >= count) return ctrl.close();
      try {
        const part = await next;
        if (typeof part !== "string") throw new Error("morceau manquant");
        i++;
        if (i < count) next = db(`store/files/${fk}/c${i}`);   // lit déjà le suivant pendant l'envoi
        ctrl.enqueue(b64ToBytes(part));
        if (i >= count) ctrl.close();
      } catch (e) { ctrl.error(e); }
    }
  });
  return new Response(body, { status: 200, headers });
}

// ====================================================================== compte Davbot One
async function findUser(identity) {
  if (/^\+?\d{6,16}$/.test(identity)) {
    for (const k of [identity, identity.startsWith("+") ? identity.slice(1) : "+" + identity]) {
      const u = await db(`users/${k}`).catch(() => null);
      if (u && typeof u === "object") return { key: k, user: u };
    }
  }
  const wanted = identity.toLowerCase();
  const same = (u) => u && typeof u === "object" && typeof u.email === "string" && u.email.trim().toLowerCase() === wanted;
  for (const value of new Set([identity, wanted])) {
    const q = `orderBy=${encodeURIComponent('"email"')}&equalTo=${encodeURIComponent(JSON.stringify(value))}&limitToFirst=1`;
    const found = await db("users", "GET", undefined, q).catch(() => null);
    const hit = found && Object.entries(found)[0];
    if (hit) return { key: hit[0], user: hit[1] };
  }
  if (wanted.includes("@")) {
    let after = "";
    for (let page = 0; page < 25; page++) {
      const q = `orderBy=${encodeURIComponent('"$key"')}&limitToFirst=200` + (after ? `&startAt=${encodeURIComponent(JSON.stringify(after))}` : "");
      const batch = await db("users", "GET", undefined, q).catch(() => null);
      const entries = Object.entries(batch || {}).filter(([k]) => k !== after);
      if (!entries.length) break;
      const hit = entries.find(([, u]) => same(u));
      if (hit) return { key: hit[0], user: hit[1] };
      after = entries[entries.length - 1][0];
      if (entries.length < 199) break;
    }
  }
  return null;
}

async function login(c) {
  serviceAccount();   // erreur claire (500) si le secret Firebase manque, au lieu de « compte introuvable »
  const b = await readBody(c.req);
  const identity = clean(b.identity, 254);
  const password = String(b.password || "").slice(0, 64);
  if (!identity || !password) throw httpError("Veuillez remplir les champs obligatoires.");
  rateLimit(`login:${clientIp(c.req)}:${identity.toLowerCase()}`, 8);
  const found = await findUser(identity);
  if (!found) throw httpError("Compte Davbot One introuvable. Vérifiez votre numéro ou Gmail.", 404);
  const { key, user } = found;
  if (typeof user.password !== "string" || !(await safeEqual(user.password, password))) throw httpError("Mot de passe incorrect.", 401);
  if (user.blocked === true || user.status === "blocked") throw httpError("Ce compte est bloqué par l'administration DAVBOT.", 403);
  const name = clean(user.name || "Utilisateur Davbot", 40);
  const { token, exp } = await signSession({ p: key, n: name });
  return reply(200, { ok: true, token, exp, name, ownerId: await ownerId(key) });
}

async function me(c) {
  const s = await session(c.req);
  return reply(200, { ok: true, name: s.n, ownerId: await ownerId(s.p), exp: s.exp });
}

// ====================================================================== publication d'un APK
async function init(c) {
  const s = await session(c.req);
  rateLimit(`init:${clientIp(c.req)}`, 10);
  const b = await readBody(c.req);
  if (b.appId) return initUpdate(s, b);
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

  const allApps = (await db("store/apps")) || {};
  for (const [oid, o] of Object.entries(allApps)) {
    if (o && o.status === "uploading" && !(o.createdAt > Date.now() - 3600000)) { await dropRecord(oid, o).catch(() => {}); delete allApps[oid]; }
  }
  const live = Object.values(allApps).filter((r) => r && (r.status === "published" || r.status === "uploading"));
  const me_ = await ownerId(s.p);
  const mine = live.filter((r) => r.owner === me_);
  if (live.reduce((n, r) => n + (r.size || 0), 0) + size > MAX_TOTAL) throw httpError("Le store est plein pour le moment. Réessayez plus tard.", 507);
  if (mine.length >= MAX_APPS_PER_USER) throw httpError(`Limite atteinte : ${MAX_APPS_PER_USER} applications par compte. Supprimez-en une d'abord.`, 403);

  const id = randomHex(6);
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "app";
  await db(`store/apps/${id}`, "PUT", {
    status: "uploading", owner: me_, ownerPhone: s.p, ownerName: s.n, name, slug, version, category,
    description, tags, size, hasIcon: !!iconData, createdAt: Date.now()
  });
  if (iconData) await db(`store/icons/${id}`, "PUT", iconData);
  return reply(200, { ok: true, id, chunk: CHUNK });
}

async function initUpdate(s, b) {
  const appId = String(b.appId);
  if (!/^[a-f0-9]{12}$/.test(appId)) throw httpError("Application invalide.");
  const r = await db(`store/apps/${appId}`);
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
  const live = Object.values((await db("store/apps")) || {}).filter((x) => x && (x.status === "published" || (x.status === "uploading" && x.createdAt > Date.now() - 3600000)));
  if (live.reduce((n, x) => n + (x.size || 0), 0) + size > MAX_TOTAL) throw httpError("Le store est plein pour le moment. Réessayez plus tard.", 507);
  if (r.pending && r.pending.fileKey) await db(`store/files/${r.pending.fileKey}`, "DELETE").catch(() => {});
  const fk = randomHex(6);
  await db(`store/apps/${appId}/pending`, "PUT", { fileKey: fk, version, size, changelog, createdAt: Date.now() });
  return reply(200, { ok: true, id: appId, chunk: CHUNK, update: true });
}

async function chunk(c) {
  const s = await session(c.req);
  rateLimit(`chunk:${clientIp(c.req)}`, 400);
  const b = await readBody(c.req);
  const id = String(b.id || "");
  const i = Number(b.i);
  const data = String(b.data || "");
  if (!/^[a-f0-9]{12}$/.test(id) || !Number.isInteger(i) || i < 0) throw httpError("Morceau invalide.");
  const r = await db(`store/apps/${id}`);
  let key, size;
  if (r && r.status === "uploading" && r.ownerPhone === s.p) { key = id; size = r.size; }
  else if (r && r.status === "published" && r.pending && (r.ownerPhone === s.p || isAdmin(s))) { key = r.pending.fileKey; size = r.pending.size; }
  else throw httpError("Publication introuvable.", 404);
  const count = Math.ceil(size / CHUNK);
  if (i >= count) throw httpError("Morceau hors limites.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw httpError("Morceau illisible.");
  const expected = i === count - 1 ? size - CHUNK * (count - 1) : CHUNK;
  if (b64Len(data) !== expected) throw httpError("Taille du morceau incorrecte.", 422);
  await db(`store/files/${key}/c${i}`, "PUT", data);
  return reply(200, { ok: true, i });
}

async function dropRecord(id, r) {
  const jobs = [db(`store/files/${fileKey(id, r)}`, "DELETE"), db(`store/apps/${id}`, "DELETE"), db(`store/icons/${id}`, "DELETE"), db(`store/stats/${id}`, "DELETE")];
  if (r && r.pending && r.pending.fileKey) jobs.push(db(`store/files/${r.pending.fileKey}`, "DELETE"));
  await Promise.all(jobs);
}
async function dropPending(id, r) {
  if (r && r.pending && r.pending.fileKey) await db(`store/files/${r.pending.fileKey}`, "DELETE").catch(() => {});
  await db(`store/apps/${id}`, "PATCH", { pending: null }).catch(() => {});
}

const BAD_APK = "Ce fichier n'est pas un APK Android valide.";
const MANIFEST = te.encode("AndroidManifest.xml");
const EOCD = [0x50, 0x4b, 0x05, 0x06];
async function verifyApk(key, size) {
  const count = Math.ceil(size / CHUNK);
  const keys = Object.keys((await db(`store/files/${key}`, "GET", undefined, "shallow=true")) || {});
  if (keys.length !== count) return "L'envoi est incomplet. Recommencez la publication.";
  const raw = async (n) => (await db(`store/files/${key}/c${n}`)) || "";
  const first = await raw(0);
  if (!first.startsWith("UEsDB")) return BAD_APK;   // « PK\x03\x04 » en base64
  const cache = new Map();   // chaque morceau n'est décodé qu'une fois (économise du temps processeur)
  const part = (n) => { if (!cache.has(n)) cache.set(n, raw(n).then(b64ToBytes)); return cache.get(n); };
  const from = Math.max(0, count - 2);
  const tail = concat(await Promise.all(Array.from({ length: count - from }, (_, k) => part(from + k))));
  const eocd = lastIndexOfSeq(tail, EOCD);
  if (eocd < 0 || eocd + 22 > tail.length) return BAD_APK;
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (cdOffset + cdSize > size) return BAD_APK;
  const start = Math.floor(cdOffset / CHUNK);
  const cd = start >= from ? tail.subarray(cdOffset - from * CHUNK)
    : concat(await Promise.all(Array.from({ length: count - start }, (_, k) => part(start + k)))).subarray(cdOffset - start * CHUNK);
  return indexOfSeq(cd, MANIFEST) >= 0 ? "" : BAD_APK;
}

async function finish(c) {
  const s = await session(c.req);
  const id = String((await readBody(c.req)).id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Publication invalide.");
  const r = await db(`store/apps/${id}`);
  if (!r) throw httpError("Publication introuvable.", 404);

  if (r.status === "published" && r.pending) {
    if (r.ownerPhone !== s.p && !isAdmin(s)) throw httpError("Publication introuvable.", 404);
    const p = r.pending;
    const problem = await verifyApk(p.fileKey, p.size);
    if (problem) { await dropPending(id, r); throw httpError(problem, 422); }
    const oldKey = fileKey(id, r);
    const updatedAt = Date.now();
    await db(`store/apps/${id}`, "PATCH", { version: p.version, size: p.size, fileKey: p.fileKey, changelog: p.changelog || "", updatedAt, pending: null });
    if (oldKey !== p.fileKey) await db(`store/files/${oldKey}`, "DELETE").catch(() => {});
    return reply(200, { ok: true, updated: true, app: publicCommunity(id, { ...r, version: p.version, size: p.size, changelog: p.changelog || "", updatedAt }, {}) });
  }

  if (r.ownerPhone !== s.p) throw httpError("Publication introuvable.", 404);
  if (r.status === "published") return reply(200, { ok: true, app: publicCommunity(id, r, {}) });
  const problem = await verifyApk(fileKey(id, r), r.size);
  if (problem) { await dropRecord(id, r); throw httpError(problem, 422); }
  const publishedAt = Date.now();
  await db(`store/apps/${id}`, "PATCH", { status: "published", publishedAt });
  return reply(200, { ok: true, app: publicCommunity(id, { ...r, publishedAt }, {}) });
}

async function abort(c) {
  const s = await session(c.req);
  const id = String((await readBody(c.req)).id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Application invalide.");
  const r = await db(`store/apps/${id}`);
  if (!r || (r.ownerPhone !== s.p && !isAdmin(s))) throw httpError("Application introuvable.", 404);
  await dropPending(id, r);
  return reply(200, { ok: true });
}

async function latest(c) {
  const cors = { "Access-Control-Allow-Origin": "*" };
  const key = String(c.id || "").trim().toLowerCase();
  const base = c.url.origin;
  const off = OFFICIAL.find((a) => String(a.id) === key || a.slug === key);
  let out = null;
  if (off) {
    out = { id: String(off.id), slug: off.slug, name: off.name, version: String(off.version), size: off.size, changelog: "", updatedAt: 0, official: true };
  } else if (key) {
    let id = /^[a-f0-9]{12}$/.test(key) ? key : "", r = id ? await db(`store/apps/${id}`) : null;
    if (!r) {
      const all = (await db("store/apps")) || {};
      const hit = Object.entries(all).filter(([, x]) => x && x.status === "published" && x.slug === key).sort((a, b) => (b[1].publishedAt || 0) - (a[1].publishedAt || 0))[0];
      if (hit) { id = hit[0]; r = hit[1]; }
    }
    if (r && r.status === "published") out = { id, slug: r.slug, name: r.name, version: String(r.version), size: sizeLabel(r.size), changelog: r.changelog || "", updatedAt: r.updatedAt || r.publishedAt || 0, official: false };
  }
  if (!out) return reply(404, { ok: false, message: "Application introuvable." }, "no-store", cors);
  return reply(200, { ok: true, ...out, download: `${base}/api/download/${out.id}`, page: `${base}/store-apk` }, "public, max-age=30", cors);
}

async function remove(c) {
  const s = await session(c.req);
  const id = String((await readBody(c.req)).id || c.id || "");
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpError("Application invalide.");
  const r = await db(`store/apps/${id}`);
  if (!r) throw httpError("Application introuvable.", 404);
  if (r.ownerPhone !== s.p && !isAdmin(s)) throw httpError("Vous ne pouvez supprimer que vos applications.", 403);
  await dropRecord(id, r);
  return reply(200, { ok: true });
}

const ROUTES = {
  list: ["GET", list], icon: ["GET", icon], download: ["GET", download], latest: ["GET", latest],
  login: ["POST", login], me: ["GET", me], init: ["POST", init], chunk: ["POST", chunk], finish: ["POST", finish], abort: ["POST", abort], remove: ["POST", remove]
};

async function api(request, url) {
  const seg = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  let action = "", pid = "";
  if (seg[0] === "store") action = url.searchParams.get("action") || "";
  else if (seg[0] === "apps") action = "list";
  else if (["download", "latest", "icon"].includes(seg[0])) { action = seg[0]; try { pid = decodeURIComponent(seg[1] || ""); } catch (_) { pid = ""; } }
  const c = { req: request, url, id: pid || url.searchParams.get("id") || "" };
  if (request.method === "OPTIONS" && action === "latest") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } });
  }
  const route = ROUTES[action];
  if (!route) return reply(404, { ok: false, message: "Action inconnue." });
  const allowed = route[0] === "GET" ? ["GET", "HEAD"] : [route[0]];
  if (!allowed.includes(request.method)) return reply(405, { ok: false, message: "Méthode non autorisée." }, "no-store", { Allow: allowed.join(", ") });
  try {
    return await route[1](c);
  } catch (e) {
    if (!e.status || e.status >= 500) console.error("store:", action, e && e.message);
    return reply(e.status || 500, { ok: false, message: e.status ? e.message : "Erreur serveur." });
  }
}

// ====================================================================== page /store-apk
const PAGE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' https://i.imgur.com data: blob:; connect-src 'self'; base-uri 'self'; form-action 'self' https://wa.me; frame-ancestors 'none'; object-src 'none'"
};
async function storePage(request, env, url) {
  // On essaie les deux formes, sans jamais suivre de redirection (évite toute boucle /store-apk <-> /store-apk/)
  for (const p of ["/store-apk/index.html", "/store-apk/"]) {
    const r = await env.ASSETS.fetch(new Request(url.origin + p, { method: "GET", redirect: "manual" }));
    if (r.status === 200) {
      const h = new Headers(r.headers);
      for (const [k, v] of Object.entries(PAGE_HEADERS)) h.set(k, v);
      h.set("Content-Type", "text/html; charset=utf-8");
      h.set("Cache-Control", "public, max-age=0, must-revalidate");
      return new Response(request.method === "HEAD" ? null : r.body, { status: 200, headers: h });
    }
  }
  return new Response("Store introuvable.", { status: 404 });
}

// ====================================================================== point d'entrée
export default {
  async fetch(request, env, ctx) {
    ENV = env;
    CTX = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api" || path.startsWith("/api/")) return api(request, url);
    if (path === "/store" || path === "/store.html") return Response.redirect(url.origin + "/store-apk", 301);
    if (path === "/store-apk") return storePage(request, env, url);
    return env.ASSETS.fetch(request);
  }
};

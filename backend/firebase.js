"use strict";

// DAVBOT Store — FIREBASE CENTRALISÉ (même projet que Davbot : davbot-v2).
// Firebase reste UNIQUEMENT dans le backend : aucun SDK Firebase dans les pages.
// Le store n'écrit que sous  store/…  et ne lit que  users/…  (comptes Davbot One).

const crypto = require("crypto");

// Configuration publique du projet (identique à Davbot-main/backend/firebase.js).
const firebaseConfig = {
  projectId: "davbot-v2",
  databaseURL: "https://davbot-v2-default-rtdb.firebaseio.com",
  storageBucket: "davbot-v2.firebasestorage.app"
};

// Comptes autorisés à supprimer n'importe quelle application du store (numéros Davbot One).
const STORE_ADMINS = [];

// ---------------------------------------------------------------------------
// Compte de service Firebase (projet davbot-v2) : accès administrateur à la base
// et à Storage. ⚠ Contient une clé privée : ne jamais la publier dans un dépôt public.
//   Option A (recommandée) : variable Vercel FIREBASE_SERVICE_ACCOUNT = le JSON complet.
//   Option B : coller l'objet JSON ci-dessous (dépôt PRIVÉ uniquement).
// ---------------------------------------------------------------------------
const INLINE_SERVICE_ACCOUNT = null;

let account = null;
function serviceAccount() {
  if (account) return account;
  let raw = INLINE_SERVICE_ACCOUNT;
  if (!raw && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (_) { raw = null; }
  }
  if (!raw || !raw.client_email || !raw.private_key) {
    throw httpError("Store non configuré : compte de service Firebase manquant (voir README).", 503);
  }
  account = { ...raw, private_key: String(raw.private_key).replace(/\\n/g, "\n") };
  return account;
}

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---- Jeton OAuth2 Google (1 h, mis en cache) pour la base et Storage ----
let tokenCache = { value: "", exp: 0 };
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp - 120 > now) return tokenCache.value;
  const sa = serviceAccount();
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({
    iss: sa.client_email,
    scope: [
      "https://www.googleapis.com/auth/firebase.database",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/devstorage.read_write"
    ].join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  });
  const sig = crypto.createSign("RSA-SHA256").update(head + "." + claim).sign(sa.private_key).toString("base64url");
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
const authHeaders = async () => ({ Authorization: "Bearer " + (await accessToken()) });

// ---- Realtime Database (REST) ----
function dbPath(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (parts.some((p) => p === ".." || p === "." || p.length > 200) || parts.length > 8) throw httpError("Chemin invalide.");
  return parts.map(encodeURIComponent).join("/");
}

async function db(path, method = "GET", body, query = "") {
  const url = `${firebaseConfig.databaseURL}/${dbPath(path)}.json${query ? "?" + query : ""}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw httpError((data && data.error) || `Base Davbot HTTP ${res.status}`, 502);
  return data;
}

// ---- Cloud Storage (APK) ----
const BUCKET = firebaseConfig.storageBucket;
const objUrl = (name) => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(name)}`;

// Session d'envoi reprenable : le navigateur envoie ensuite l'APK directement à Google
// (pas de limite de taille Vercel). `origin` autorise le CORS pour cette session.
async function startResumableUpload(name, size, origin) {
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o?uploadType=resumable&name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        ...(await authHeaders()),
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/vnd.android.package-archive",
        "X-Upload-Content-Length": String(size),
        Origin: origin
      },
      body: JSON.stringify({ name, contentType: "application/vnd.android.package-archive" })
    }
  );
  const location = res.headers.get("location");
  if (!res.ok || !location) throw httpError("Impossible de préparer l'envoi (Storage).", 502);
  return location;
}

async function objectMeta(name) {
  const res = await fetch(objUrl(name), { headers: await authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw httpError("Lecture Storage impossible.", 502);
  return res.json();
}

// Lit une partie de l'objet (ex. "bytes=0-3" ou "bytes=-524288").
async function objectRange(name, range) {
  const res = await fetch(objUrl(name) + "?alt=media", { headers: { ...(await authHeaders()), Range: range } });
  if (!res.ok && res.status !== 206) throw httpError("Lecture Storage impossible.", 502);
  return Buffer.from(await res.arrayBuffer());
}

async function objectDelete(name) {
  const res = await fetch(objUrl(name), { method: "DELETE", headers: await authHeaders() });
  if (!res.ok && res.status !== 404) throw httpError("Suppression Storage impossible.", 502);
}

// URL de téléchargement signée (V4, 5 min) : le visiteur télécharge directement depuis Google,
// le bucket reste privé et aucun lien permanent n'existe.
function signedDownloadUrl(name, filename, ttl = 300) {
  const sa = serviceAccount();
  const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = stamp.slice(0, 8);
  const scope = `${day}/auto/storage/goog4_request`;
  const query = {
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${sa.client_email}/${scope}`,
    "X-Goog-Date": stamp,
    "X-Goog-Expires": String(ttl),
    "X-Goog-SignedHeaders": "host",
    "response-content-disposition": `attachment; filename="${filename}"`,
    "response-content-type": "application/vnd.android.package-archive"
  };
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join("&");
  const path = `/${BUCKET}/${name.split("/").map(enc).join("/")}`;
  const canonical = ["GET", path, canonicalQuery, "host:storage.googleapis.com", "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["GOOG4-RSA-SHA256", stamp, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signature = crypto.createSign("RSA-SHA256").update(toSign).sign(sa.private_key).toString("hex");
  return `https://storage.googleapis.com${path}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

// ---- Sessions du store (jeton signé, aucun état serveur) ----
function sessionKey() {
  return crypto.createHash("sha256").update("davbot-store:" + serviceAccount().private_key).digest();
}
function signSession(payload, ttlMs = 12 * 3600 * 1000) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionKey()).update(body).digest("base64url");
  return { token: `${body}.${sig}`, exp: Date.now() + ttlMs };
}
function verifySession(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", sessionKey()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p && p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = {
  firebaseConfig, STORE_ADMINS, httpError, db, safeEqual,
  startResumableUpload, objectMeta, objectRange, objectDelete, signedDownloadUrl,
  signSession, verifySession
};

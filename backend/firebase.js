"use strict";

// DAVBOT Store — FIREBASE CENTRALISÉ (même projet que Davbot : davbot-v2).
// Firebase reste UNIQUEMENT dans le backend : aucun SDK Firebase dans les pages.
// Le store n'écrit que sous  store/…  et ne lit que  users/…  (comptes Davbot One).

const crypto = require("crypto");

// Configuration publique du projet (identique à Davbot-main/backend/firebase.js).
const firebaseConfig = {
  projectId: "davbot-v2",
  databaseURL: "https://davbot-v2-default-rtdb.firebaseio.com"
};

// Comptes autorisés à supprimer n'importe quelle application du store (numéros Davbot One).
const STORE_ADMINS = ["+243967930291"];

// ---------------------------------------------------------------------------
// Compte de service Firebase (projet davbot-v2) : accès administrateur à la base
// (Realtime Database uniquement, sans Storage). Intégré ici (même objet que Davbot-main/backend/firebase.js) :
// AUCUNE variable d'environnement. ⚠ Contient une clé privée : dépôt PRIVÉ uniquement.
// ---------------------------------------------------------------------------
const INLINE_SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "davbot-v2",
  "private_key_id": "684a24c47780bbd4ce830b447372a8c41773956f",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC2eGOxr0YRKV7I\n3IS7eTHuzK82BbSk0u0RGnJrUAxVspsE+u9rVfJ9IqDU+CsczU3WA6a7xcOKcKI0\n3UAy6nGrJ24ijUrSIVG6e31yYmv/p2AlVXcMUcqqf3I0xjuLjt9aki9nVkB1XOwd\nsA68MTCKP6irsdqbU5NdaBegVWnVaArP7n/s2kRRuqv8mn6JPKNaHEV8+Plif3NR\n2XG9qPkd12Jh30O4j2OMcR6tsxq4WaF0KETLgpHb161TmlrqtzFUjvDup/RdSkyI\nx371T1St4x1q6+udUYvvwsSrQuyjDkxGOISfevyctoYYV9jswgMKNFDxKDlun/H4\nrS3C0NszAgMBAAECggEAKknPbQwedHa+iVWWC27ElD/qsV30JijeGVMkRluYaDoK\n9EYFu74BA2BFnuXe8/9etSVGfIkSTuDYruDB8qrj6hMq0qYlO3rOWqYpBhvqRKcx\nQKXEf93q1sXPnYx9m1PizrZHdy8FpE2DSUQWviW2RqwHNrdy3wGpCwJHS3jQHM1p\n8ckT8kM7kJiEB1wcH8yZGhtUFoXDsAO7Wwkr67zsorMotDioabW50qAWTpeqCaur\n5OXKylOVEEpiYTlCclIY56c2tU0lNTkjSS7pGXGXLsvzmMwx3g+LZgWFkEUxSDmD\n+Hrwu25TdrosX8KeEnhJiWGuAV7FLoE8jcwshKNZlQKBgQDsg0FjkiI/nOStpJyy\npXhHdfLbKXrrQRDLZy/9RkCiRoaAQw0LCP24A3MkFH2U4ZaJnfVHpLf1olh7J1Ak\nu8R82t0iPlydNbKZixcBA+dDZUBkjWbvhi9gt1EA6VJ54hWDiM5AQ64irIfgi0dv\nxlrkIk8pFVS59PjlROtjZQ1sDQKBgQDFgTiJ5ZMVeLAggrdTmR8dl53alP4sgbvc\nngW+lCohTK4GXEBDuDRtriiY+NxiOjXslgNC3HjbjOmUut8HW/d2cf1phGGlz2B5\nXgL5kUE5LltNLOjL4ZQiNeAYWwk5WPjqan2fCjaZuGYUolOfT8aCu/wOD74vIcOm\nvPbemotUPwKBgBORMGG6f1bf9hNfoQ8unWrcGUGEhwTblzYczV2Y6FQEnbAS3Atj\nrQoCTw5XG6SrnTa5eMd6mzWZPtTBheHkHvdtbAofOq5O+P23Aio1Vna+87rd7/w1\nD8pioDMBGq+2wqzlLpsmfkukFoG/RCO9N1vUctQlTaMs30KolwjcHWYpAoGAAmn2\n5/CPYKbN+EfAt9vaPoFY45AIn0CirCqeRVsIPMn0Io3EF0/MDD8hreT0xJqTiCW5\nOnr5Wy2YuUGjcjKUjrUL9NsyWlVzh2g3vxcgZfOEGChhXASQy+4+o+2Q6kuFF1Bf\n4q68Rhqz3LKzNPJDqdtkVEOq/mZ6PrJ2jffzlf8CgYEA5nflHsMZDShpBLcDJqdG\nzV2FKOwBSiTgSrrF/Gntvd3wWpbEi+pOh5XoXjnOx3W4ZTgUPcrk0J0u3UmQph6W\nPtWZ5SjlW6WHj+O2V4ipMkFI4XSMQ6IvfyiQZ3mm9kBF/CRQH0KlNOiC+NFsYYsG\n8kG8B9MmtU/e2SNbIGte+cU=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@davbot-v2.iam.gserviceaccount.com",
  "client_id": "107586753655785269757",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40davbot-v2.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

let account = null;
function serviceAccount() {
  if (account) return account;
  account = { ...INLINE_SERVICE_ACCOUNT, private_key: String(INLINE_SERVICE_ACCOUNT.private_key).replace(/\\n/g, "\n") };
  return account;
}

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---- Jeton OAuth2 Google (1 h, mis en cache) pour la base ----
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
      "https://www.googleapis.com/auth/userinfo.email"
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
  signSession, verifySession
};

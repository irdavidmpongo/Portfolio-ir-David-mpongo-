const express = require("express");
const path = require("path");
const app = express();
const store = require("./api/store.js");

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// Fichiers de configuration Cloudflare : jamais servis au public
app.use((req, res, next) => (/^\/_(worker\.js|headers|redirects)$/.test(req.path) ? res.status(404).end() : next()));

// API du store (mêmes routes que vercel.json)
const api = (action, withId) => (req, res) => { req.query = { ...req.query, action, ...(withId ? { id: req.params.id } : {}) }; return store(req, res); };
app.all("/api/store", store);
app.get("/api/apps", api("list"));
app.get("/api/download/:id", api("download", true));
app.get("/api/latest/:id", api("latest", true));
app.get("/api/icon/:id", api("icon", true));

app.get(["store.html", "public/index.html", "/store.html"], (req, res) => res.redirect(301, "/store-apk"));
app.get("/store-apk", (req, res) => res.sendFile(path.join(__dirname, "public", "store-apk", "index.html")));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));

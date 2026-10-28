"use strict";

/* DAVBOT Store — code NAVIGATEUR (catalogue, connexion Davbot One, publication / mise à jour d'APK).
   Appelle uniquement /api/store?action=… (le serveur est dans api/store.js). */
(function () {
  const $ = (id) => document.getElementById(id);
  const API = "/api/store";
  const SESSION_KEY = "davbot-store-session";
  const INSTALLED_KEY = "davbot-installed-";
  const MIN_APK = 50 * 1024;
  const MAX_APK = 10 * 1024 * 1024;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* indisponible */ } }
  };

  const st = { apps: [], cat: "Tout", q: "", session: null, target: null, chosen: null, icon: "", cancelled: false, current: null };

  // ---------- utilitaires ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const icon = (cls) => h("i", { class: cls, "aria-hidden": "true" });
  function newer(a, b) {
    const pa = String(a).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
    const pb = String(b).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
  }
  const sizeLabel = (b) => { const mb = b / 1048576; return mb >= 1 ? mb.toFixed(1) + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko"; };

  async function api(action, opts) {
    const { method = "GET", body, query = "", auth = false } = opts || {};
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && st.session) headers.Authorization = "Bearer " + st.session.token;
    let res;
    try {
      res = await fetch(`${API}?action=${action}${query}`, { method, headers, cache: "no-store", body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (_) { throw new Error("Connexion impossible. Vérifiez votre réseau."); }
    let data = null;
    try { data = await res.json(); } catch (_) { /* réponse non JSON */ }
    if (!res.ok || !data || data.ok === false) {
      const hint = res.status === 413 ? "Fichier trop volumineux." : res.status === 504 ? "Le serveur a mis trop de temps à répondre, réessayez." : `Erreur serveur (${res.status}).`;
      const err = new Error((data && data.message) || hint);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- catalogue ----------
  function installed(id) { return ls.get(INSTALLED_KEY + id); }

  function card(a) {
    const inst = installed(a.id);
    const hasUpdate = !!inst && newer(a.version, inst);
    const mine = !!(st.session && !a.official && a.ownerId && a.ownerId === st.session.ownerId);

    let ico;
    const fallback = () => { const d = h("div", { class: "app-icon" }, icon("fa-brands fa-android")); Object.assign(d.style, { display: "grid", placeItems: "center", fontSize: "30px" }); return d; };
    if (a.icon) { ico = h("img", { class: "app-icon", src: a.icon, alt: "", width: "76", height: "76", loading: "lazy" }); ico.addEventListener("error", () => ico.replaceWith(fallback())); }
    else ico = fallback();

    const stars = a.stars > 0 ? h("div", { class: "app-stars", "aria-label": `${a.stars} sur 5` }, [0, 1, 2, 3, 4].map((i) => icon("fa-solid fa-star" + (i < a.stars ? "" : " off")))) : null;
    const tags = a.tags && a.tags.length ? h("div", { class: "app-tags" }, a.tags.map((t) => h("span", { text: t }))) : null;

    const dl = h("a", { class: "btn btn-gold small download", href: `${API}?action=download&id=${encodeURIComponent(a.id)}`, rel: "nofollow", onclick: () => ls.set(INSTALLED_KEY + a.id, a.version) },
      icon(hasUpdate ? "fa-solid fa-arrows-rotate" : "fa-solid fa-download"), " ", hasUpdate ? "Mettre à jour" : "Télécharger");

    const actions = h("div", { class: "app-actions" }, dl,
      mine ? h("button", { class: "btn btn-ghost small", type: "button", title: "Publier une nouvelle version", onclick: () => openForm(a) }, icon("fa-solid fa-cloud-arrow-up"), " Version") : null,
      mine ? h("button", { class: "icon-btn", type: "button", "aria-label": "Supprimer " + a.name, onclick: () => removeApp(a) }, icon("fa-solid fa-trash")) : null);

    return h("article", { class: "app-card" + (a.premium ? " premium" : "") },
      h("div", { class: "app-top" }, ico,
        h("div", {}, h("h3", { text: a.name }),
          h("small", { text: `${a.developer || ""} · v${a.version} · ${a.size || ""}` }),
          h("div", {}, h("span", { class: "badge " + (a.official ? "badge-official" : "badge-community"), text: a.official ? "Officiel" : "Communauté" })))),
      stars,
      h("p", { class: "app-desc", text: a.description || "" }),
      tags,
      a.changelog ? h("div", { class: "app-count" }, icon("fa-solid fa-sparkles"), `Nouveautés : ${a.changelog}`) : null,
      h("div", { class: "app-count" }, icon("fa-solid fa-download"), `${(a.downloads || 0).toLocaleString("fr-FR")} téléchargements`, hasUpdate ? "  ·  Nouvelle version disponible" : ""),
      actions);
  }

  function renderChips() {
    const cats = ["Tout", ...new Set(st.apps.map((a) => a.category).filter(Boolean))];
    const box = $("categories");
    box.replaceChildren(...cats.map((c) => h("button", { class: "chip" + (c === st.cat ? " active" : ""), type: "button", "aria-pressed": String(c === st.cat), text: c, onclick: () => { st.cat = c; render(); } })));
  }

  function render() {
    const grid = $("apps");
    grid.setAttribute("aria-busy", "false");
    const q = st.q.trim().toLowerCase();
    const list = st.apps.filter((a) => (st.cat === "Tout" || a.category === st.cat) &&
      (!q || [a.name, a.description, a.developer, a.category, (a.tags || []).join(" ")].join(" ").toLowerCase().includes(q)));
    renderChips();
    $("resultCount").textContent = `${list.length} application${list.length > 1 ? "s" : ""}`;
    grid.replaceChildren(...(list.length ? list.map(card) : [h("p", { class: "state", text: "Aucune application trouvée." })]));
  }

  async function loadApps() {
    const grid = $("apps");
    grid.setAttribute("aria-busy", "true");
    try {
      const data = await api("list", { query: "&t=" + Date.now() });
      st.apps = data.apps || [];
      render();
    } catch (e) {
      grid.setAttribute("aria-busy", "false");
      grid.replaceChildren(h("div", { class: "state" }, h("p", { text: "Impossible de charger les applications. " + e.message }),
        h("button", { class: "btn btn-gold", type: "button", onclick: loadApps }, "Réessayer")));
    }
  }

  async function removeApp(a) {
    if (!window.confirm(`Supprimer « ${a.name} » du store ? Cette action est définitive.`)) return;
    try { await api("remove", { method: "POST", auth: true, body: { id: a.id } }); await loadApps(); }
    catch (e) { window.alert(e.message); }
  }

  // ---------- session Davbot One ----------
  function paintAuth() {
    $("authLabel").textContent = st.session ? st.session.name : "Connexion Davbot One";
    $("logoutBtn").hidden = !st.session;
  }
  function saveSession(s) { st.session = s; if (s) ls.set(SESSION_KEY, JSON.stringify(s)); else ls.del(SESSION_KEY); paintAuth(); }
  async function restoreSession() {
    try { const s = JSON.parse(ls.get(SESSION_KEY) || "null"); if (s && s.token) st.session = s; } catch (_) { /* session illisible */ }
    paintAuth();
    if (!st.session) return;
    try {
      const me = await api("me", { auth: true });
      saveSession({ ...st.session, name: me.name, ownerId: me.ownerId });
      render();
    } catch (e) { if (e.status === 401) { saveSession(null); render(); } }
  }

  // ---------- fenêtre de publication ----------
  const STEPS = ["stepLogin", "stepForm", "stepUp", "stepDone"];
  function step(name) { STEPS.forEach((s) => { $(s).hidden = s !== name; }); }
  function openModal() { const m = $("pubModal"); m.classList.add("open"); m.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
  function closeModal() {
    if (!$("stepUp").hidden) return; // envoi en cours : utiliser « Annuler »
    const m = $("pubModal"); m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); document.body.style.overflow = "";
  }

  function openLogin() { $("lgErr").textContent = ""; step("stepLogin"); openModal(); setTimeout(() => $("lgId").focus(), 50); }

  function resetDrop() {
    st.chosen = null; $("apkFile").value = "";
    $("drop").classList.remove("ok"); $("dropTitle").textContent = "Déposez votre APK ici";
    $("dropSub").textContent = "ou touchez pour parcourir · 10 Mo maximum";
  }

  // app = application existante à mettre à jour, sinon nouvelle publication
  function openForm(app) {
    if (!st.session) { st.target = app || null; return openLogin(); }
    st.target = app || null;
    const upd = !!app;
    $("pubForm").reset(); resetDrop(); st.icon = ""; $("icoPrev").hidden = true; $("pubErr").textContent = "";
    $("whoName").textContent = st.session.name;
    document.querySelectorAll("[data-pub=new]").forEach((el) => { el.hidden = upd; });
    $("fName").required = !upd;
    $("fDesc").required = !upd; $("fDesc").minLength = upd ? 0 : 10; $("fDesc").maxLength = upd ? 300 : 600;
    $("pubEyebrow").textContent = upd ? "NOUVELLE VERSION" : "NOUVELLE APPLICATION";
    $("pubHead").textContent = upd ? `Mettre à jour ${app.name}` : "Publier mon APK";
    $("lblDesc").textContent = upd ? "Nouveautés de cette version (facultatif)" : "Description";
    $("fDesc").placeholder = upd ? "Ce qui change dans cette version" : "À quoi sert votre application ?";
    if (upd) $("fVersion").value = app.version;
    step("stepForm"); openModal();
  }

  function chooseFile(file) {
    $("pubErr").textContent = "";
    if (!file) return;
    if (!/\.apk$/i.test(file.name)) { $("pubErr").textContent = "Seuls les fichiers .apk sont acceptés."; return; }
    if (file.size < MIN_APK || file.size > MAX_APK) { $("pubErr").textContent = "L'APK doit faire entre 50 Ko et 10 Mo."; return; }
    st.chosen = file;
    $("drop").classList.add("ok"); $("dropTitle").textContent = file.name; $("dropSub").textContent = sizeLabel(file.size);
    if (!st.target && !$("fName").value) $("fName").value = file.name.replace(/\.apk$/i, "").replace(/[-_.]+/g, " ").trim().slice(0, 40);
  }

  function pickIcon(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let out = "";
      outer: for (const side of [128, 96, 64]) {
        const c = document.createElement("canvas"); c.width = c.height = side;
        c.getContext("2d").drawImage(img, 0, 0, side, side);
        for (const type of ["image/webp", "image/jpeg"]) {
          const d = c.toDataURL(type, 0.85);
          if (d.startsWith("data:" + type) && d.length <= 80000) { out = d; break outer; }
        }
      }
      URL.revokeObjectURL(url);
      st.icon = out;
      if (out) { $("icoPrev").src = out; $("icoPrev").hidden = false; } else $("pubErr").textContent = "Icône trop lourde, choisissez-en une autre.";
    };
    img.onerror = () => { URL.revokeObjectURL(url); $("pubErr").textContent = "Image illisible."; };
    img.src = url;
  }

  const toB64 = (blob) => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => ko(new Error("Lecture du fichier impossible."));
    r.readAsDataURL(blob);
  });
  async function retry(fn, n = 3) {
    for (let i = 1; ; i++) {
      try { return await fn(); }
      catch (e) { if (i >= n || (e.status && e.status < 500 && e.status !== 429)) throw e; await new Promise((r) => setTimeout(r, 800 * i)); }
    }
  }
  function progress(p) {
    const C = 2 * Math.PI * 54, ring = $("ringFg");
    ring.style.strokeDasharray = String(C);
    ring.style.strokeDashoffset = String(C * (1 - Math.min(1, p)));
    $("ringPct").textContent = Math.round(p * 100) + "%";
  }

  async function submit(e) {
    e.preventDefault();
    const err = $("pubErr"); err.textContent = "";
    const file = st.chosen;
    if (!file) { err.textContent = "Choisissez d'abord un fichier APK."; return; }
    const upd = !!st.target;
    const body = upd
      ? { appId: st.target.id, version: $("fVersion").value.trim(), filename: file.name, size: file.size, changelog: $("fDesc").value.trim() }
      : { name: $("fName").value.trim(), version: $("fVersion").value.trim(), category: $("fCat").value, tags: $("fTags").value.trim(), description: $("fDesc").value.trim(), filename: file.name, size: file.size, icon: st.icon };

    st.cancelled = false; st.current = null;
    $("pubBtn").disabled = true; progress(0); $("upInfo").textContent = "Préparation…"; step("stepUp");
    try {
      const init = await api("init", { method: "POST", auth: true, body });
      st.current = { id: init.id, update: !!init.update };
      const size = init.chunk, total = Math.ceil(file.size / size);
      for (let i = 0; i < total; i++) {
        if (st.cancelled) throw new Error("__cancel__");
        const data = await toB64(file.slice(i * size, (i + 1) * size));
        await retry(() => api("chunk", { method: "POST", auth: true, body: { id: init.id, i, data } }));
        progress(((i + 1) / total) * 0.95);
        $("upInfo").textContent = `Envoi… ${i + 1}/${total}`;
      }
      if (st.cancelled) throw new Error("__cancel__");
      $("upInfo").textContent = "Vérification de l'APK…";
      const fin = await api("finish", { method: "POST", auth: true, body: { id: init.id } });
      progress(1);
      $("doneTitle").textContent = fin.updated ? "Application mise à jour" : "Application publiée";
      $("doneName").textContent = fin.app && fin.app.name ? fin.app.name : (upd ? st.target.name : body.name);
      $("doneMsg").textContent = fin.updated ? "est passée à la nouvelle version." : "est maintenant disponible dans le catalogue.";
      st.current = null; step("stepDone");
      if (fin.app) { st.apps = [...st.apps.filter((a) => a.official), fin.app, ...st.apps.filter((a) => !a.official && a.id !== fin.app.id)]; render(); }
      loadApps();
    } catch (ex) {
      await cleanup();
      if (ex.message === "__cancel__") { step("stepForm"); }
      else {
        if (ex.status === 401) { saveSession(null); step("stepForm"); err.textContent = "Session expirée : reconnectez-vous."; openLogin(); }
        else { step("stepForm"); err.textContent = ex.message; }
      }
    } finally { $("pubBtn").disabled = false; }
  }

  // supprime l'envoi inachevé (nouvelle app) ou annule la mise à jour en attente
  async function cleanup() {
    const c = st.current; st.current = null;
    if (!c || !st.session) return;
    try { await api(c.update ? "abort" : "remove", { method: "POST", auth: true, body: { id: c.id } }); } catch (_) { /* nettoyage au mieux */ }
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $("lgBtn"), err = $("lgErr"); err.textContent = ""; btn.disabled = true;
    try {
      const r = await api("login", { method: "POST", body: { identity: $("lgId").value.trim(), password: $("lgPw").value } });
      saveSession({ token: r.token, exp: r.exp, name: r.name, ownerId: r.ownerId });
      $("lgPw").value = "";
      render();
      openForm(st.target);
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  }

  // ---------- branchements ----------
  function init() {
    $("publishBtn").addEventListener("click", () => openForm(null));
    $("authBtn").addEventListener("click", () => (st.session ? openForm(null) : openLogin()));
    $("logoutBtn").addEventListener("click", () => { saveSession(null); render(); });
    $("pubClose").addEventListener("click", closeModal);
    $("doneBtn").addEventListener("click", () => { closeModal(); });
    $("pubModal").addEventListener("click", (e) => { if (e.target === $("pubModal")) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    $("loginForm").addEventListener("submit", doLogin);
    $("pubForm").addEventListener("submit", submit);
    $("upCancel").addEventListener("click", async () => { st.cancelled = true; $("upInfo").textContent = "Annulation…"; });

    const drop = $("drop");
    drop.addEventListener("click", (e) => { if (e.target !== $("apkFile")) $("apkFile").click(); });
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("apkFile").click(); } });
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => chooseFile(e.dataTransfer && e.dataTransfer.files[0]));
    $("apkFile").addEventListener("change", (e) => chooseFile(e.target.files[0]));
    $("icoFile").addEventListener("change", (e) => pickIcon(e.target.files[0]));
    $("search").addEventListener("input", (e) => { st.q = e.target.value; render(); });

    loadApps();
    restoreSession();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

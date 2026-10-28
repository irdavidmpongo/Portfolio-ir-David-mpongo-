"use strict";

/* DAVBOT Store : catalogue, connexion Davbot One et publication d'APK. */
(function () {
  const $ = (id) => document.getElementById(id);
  const grid = $("apps");
  if (!grid) return;

  const MAX_APK = 10 * 1024 * 1024, MIN_APK = 50 * 1024;
  const KEY = "davbot-store-session";
  let apps = [], category = "tous";

  /* ---------- versions déjà téléchargées sur cet appareil → bouton « Mettre à jour » ---------- */
  const INST = "davbot-store-installed";
  const installed = {
    all() { try { return JSON.parse(localStorage.getItem(INST)) || {}; } catch (_) { return {}; } },
    set(id, version) { try { const o = this.all(); o[id] = version; localStorage.setItem(INST, JSON.stringify(o)); } catch (_) { /* stockage indisponible */ } }
  };
  // true si la version a est strictement supérieure à b (ex. 2.1 > 2.0.8)
  function newer(a, b) {
    const pa = String(a).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0), pb = String(b).split(/[.\-_]/).map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }

  /* ---------- utilitaires ---------- */
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const icon = (c) => { const i = el("i", c); i.setAttribute("aria-hidden", "true"); return i; };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mb = (b) => (b / 1048576).toFixed(b >= 1.05e7 ? 0 : 1) + " Mo";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const session = {
    get() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.exp > Date.now() ? s : null; } catch (_) { return null; } },
    set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* stockage indisponible */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (_) { /* ignoré */ } }
  };

  function toast(message) {
    const t = el("div", "toast", message);
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  async function api(action, { method = "GET", body, auth = false } = {}) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    const s = session.get();
    if (auth && s) headers.Authorization = "Bearer " + s.token;
    const res = await fetch("/api/store?action=" + action, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      if (auth && res.status === 401) { session.clear(); syncAuth(); }
      const e = new Error(data.message || "Erreur " + res.status);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  /* ---------- catalogue ---------- */
  function stars(n) {
    const w = el("div", "app-stars");
    w.setAttribute("role", "img"); w.setAttribute("aria-label", n + " sur 5");
    for (let i = 1; i <= 5; i++) w.appendChild(icon(i <= n ? "fa-solid fa-star" : "fa-solid fa-star off"));
    return w;
  }

  function card(app) {
    const mine = session.get()?.ownerId && app.ownerId === session.get().ownerId;
    const have = installed.all()[app.id];
    const needsUpdate = !!have && newer(app.version, have);
    const a = el("article", app.premium ? "app-card premium" : "app-card");
    a.dataset.category = norm(app.category);
    a.dataset.search = norm([app.name, app.developer, app.category, app.description, ...(app.tags || [])].join(" "));

    const top = el("div", "app-top");
    const img = el("img", "app-icon");
    if (app.icon) img.src = app.icon;
    else {
      const ch = app.name.charAt(0).toUpperCase();
      const letter = /^[A-Z0-9]$/.test(ch) ? ch : "A";
      img.src = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 76"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2d7cff"/><stop offset="1" stop-color="#00d9ff"/></linearGradient></defs><rect width="76" height="76" rx="20" fill="url(#g)"/><text x="38" y="50" font-size="36" font-weight="800" text-anchor="middle" fill="#04101f" font-family="sans-serif">' + letter + '</text></svg>');
    }
    img.alt = "Icône " + app.name; img.width = 76; img.height = 76; img.loading = "lazy";
    const head = el("div");
    head.append(el("h3", "app-name", app.name), el("div", "app-dev", app.developer));
    const badge = el("span", "badge " + (app.official ? "badge-official" : "badge-community"));
    badge.append(icon(app.official ? "fa-solid fa-circle-check" : "fa-solid fa-users"), app.official ? " Officiel" : " Communauté");
    head.appendChild(badge);
    if (app.premium) { const v = el("span", "premium-badge"); v.append(icon("fa-solid fa-crown"), " VIP"); head.appendChild(v); }
    if (needsUpdate) { const u = el("span", "badge badge-update"); u.append(icon("fa-solid fa-arrows-rotate"), " Nouvelle version"); head.appendChild(u); }
    top.append(img, head);

    const info = el("div", "app-tags");
    [["fa-code-branch", "v" + app.version], ["fa-box", app.size], ["fa-layer-group", app.category]].forEach(([ic, label]) => {
      const s = el("span"); s.append(icon("fa-solid " + ic), label); info.appendChild(s);
    });
    (app.tags || []).forEach((t) => info.appendChild(el("span", "", t)));

    const count = el("div", "app-count");
    count.append(icon("fa-solid fa-download"), `${Number(app.downloads).toLocaleString("fr-FR")} téléchargements`);

    const actions = el("div", "app-actions");
    const dl = el("a", needsUpdate ? "download update" : "download");
    dl.href = app.download; dl.setAttribute("download", ""); dl.setAttribute("aria-label", (needsUpdate ? "Mettre à jour " : "Télécharger ") + app.name);
    dl.append(icon(needsUpdate ? "fa-solid fa-arrows-rotate" : "fa-solid fa-download"), needsUpdate ? " Mettre à jour" : " Télécharger");
    dl.addEventListener("click", () => installed.set(app.id, app.version));
    actions.appendChild(dl);
    if (mine) {
      const upd = el("button", "btn btn-ghost small");
      upd.type = "button"; upd.setAttribute("aria-label", "Publier une mise à jour de " + app.name);
      upd.append(icon("fa-solid fa-cloud-arrow-up"), " Mise à jour");
      upd.addEventListener("click", () => openModal(app));
      actions.appendChild(upd);
      const del = el("button", "btn btn-ghost small danger");
      del.type = "button"; del.setAttribute("aria-label", "Supprimer " + app.name);
      del.appendChild(icon("fa-solid fa-trash"));
      del.addEventListener("click", async () => {
        if (!confirm(`Supprimer « ${app.name} » du store ?`)) return;
        try { await api("remove", { method: "POST", body: { id: app.id }, auth: true }); toast("Application supprimée."); load(); }
        catch (e) { toast(e.message); }
      });
      actions.appendChild(del);
    }
    const news = app.changelog ? el("p", "app-news", "Nouveautés v" + app.version + " : " + app.changelog) : null;
    a.append(top, app.stars ? stars(app.stars) : el("div"), info, el("p", "app-desc", app.description), ...(news ? [news] : []), count, actions);
    return a;
  }

  function buildChips() {
    const box = $("categories");
    box.replaceChildren();
    ["Tous", ...new Set(apps.map((a) => a.category))].forEach((label, i) => {
      const c = el("button", i === 0 ? "chip active" : "chip", label);
      c.type = "button"; c.dataset.category = i === 0 ? "tous" : norm(label); c.setAttribute("aria-pressed", String(i === 0));
      c.addEventListener("click", () => {
        box.querySelectorAll(".chip").forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
        c.classList.add("active"); c.setAttribute("aria-pressed", "true");
        category = c.dataset.category; filter();
      });
      box.appendChild(c);
    });
  }

  function filter() {
    const q = norm($("search")?.value.trim());
    let visible = 0;
    grid.querySelectorAll(".app-card").forEach((c) => {
      const show = (category === "tous" || c.dataset.category === category) && (!q || c.dataset.search.includes(q));
      c.hidden = !show; if (show) visible++;
    });
    $("resultCount").textContent = `${visible} application${visible > 1 ? "s" : ""}`;
    grid.querySelector(".state")?.remove();
    if (!visible) grid.appendChild(el("p", "state", "Aucune application ne correspond à votre recherche."));
  }

  async function load() {
    grid.setAttribute("aria-busy", "true");
    grid.replaceChildren(el("p", "state", "Chargement des applications…"));
    try {
      const data = await api("list");
      apps = data.apps;
      grid.replaceChildren(...apps.map(card));
      buildChips(); filter();
    } catch (err) {
      console.error("Catalogue indisponible :", err);
      grid.replaceChildren();
      const box = el("div", "state");
      const retry = el("button", "btn btn-ghost", "Réessayer");
      retry.type = "button"; retry.addEventListener("click", load);
      box.append(el("p", "", "Impossible de charger le catalogue pour le moment."), retry);
      grid.appendChild(box);
      $("resultCount").textContent = "";
    }
    grid.setAttribute("aria-busy", "false");
  }

  /* ---------- compte Davbot One ---------- */
  function syncAuth() {
    const s = session.get();
    $("authLabel").textContent = s ? s.name : "Connexion Davbot One";
    $("authBtn").classList.toggle("on", !!s);
    $("logoutBtn").hidden = !s;
  }

  const modal = $("pubModal");
  const steps = ["stepLogin", "stepForm", "stepUp", "stepDone"];
  const show = (id) => steps.forEach((s) => { $(s).hidden = s !== id; });
  let lastFocus = null, uploading = null;

  let updateTarget = null;
  function setMode(app) {
    updateTarget = app || null;
    document.querySelectorAll('[data-pub="new"]').forEach((n) => { n.hidden = !!app; });
    $("fName").required = !app;
    $("fDesc").required = !app;
    $("fDesc").minLength = app ? 0 : 10;
    $("pubEyebrow").textContent = app ? "MISE À JOUR" : "NOUVELLE APPLICATION";
    $("pubHead").textContent = app ? "Mettre à jour " + app.name : "Publier mon APK";
    $("lblDesc").textContent = app ? "Nouveautés de cette version (facultatif)" : "Description";
    $("fDesc").placeholder = app ? "Ex. : correctifs, nouvelles fonctions…" : "À quoi sert votre application ?";
    $("fVersion").placeholder = app ? "Actuelle : " + app.version : "1.0";
    $("pubBtn").replaceChildren(icon("fa-solid fa-rocket"), app ? " Publier la mise à jour" : " Publier");
  }

  function openModal(app) {
    setMode(app && app.id ? app : null);
    lastFocus = document.activeElement;
    const s = session.get();
    if (s) { $("whoName").textContent = s.name; show("stepForm"); } else show("stepLogin");
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
    setTimeout(() => (s ? $("drop") : $("lgId")).focus(), 50);
  }
  function closeModal() {
    if (uploading) return;
    modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    lastFocus?.focus?.();
  }

  $("publishBtn").addEventListener("click", () => openModal());
  $("authBtn").addEventListener("click", () => openModal());
  $("pubClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) closeModal(); });
  $("logoutBtn").addEventListener("click", () => { session.clear(); syncAuth(); load(); toast("Déconnecté."); });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("lgBtn"); $("lgErr").textContent = ""; btn.disabled = true;
    try {
      const d = await api("login", { method: "POST", body: { identity: $("lgId").value, password: $("lgPw").value } });
      session.set({ token: d.token, exp: d.exp, name: d.name, ownerId: d.ownerId });
      $("lgPw").value = ""; syncAuth(); load();
      $("whoName").textContent = d.name; show("stepForm");
    } catch (err) { $("lgErr").textContent = err.message; }
    btn.disabled = false;
  });

  /* ---------- sélection de l'APK ---------- */
  let apk = null, iconData = "";
  const drop = $("drop"), fileInput = $("apkFile");

  async function pickApk(file) {
    $("pubErr").textContent = "";
    if (!file) return;
    if (!/\.apk$/i.test(file.name)) return void ($("pubErr").textContent = "Choisissez un fichier .apk.");
    if (file.size > MAX_APK || file.size < MIN_APK) return void ($("pubErr").textContent = "L'APK doit faire entre 50 Ko et 10 Mo.");
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] !== 0x50 || head[1] !== 0x4b) return void ($("pubErr").textContent = "Ce fichier n'est pas un APK valide.");
    apk = file;
    drop.classList.add("ok");
    $("dropTitle").textContent = file.name;
    $("dropSub").textContent = mb(file.size) + " · prêt à être envoyé";
    if (!$("fName").value) $("fName").value = file.name.replace(/\.apk$/i, "").replace(/[-_.]+/g, " ").replace(/\s*v?\d+(\.\d+)*\s*$/i, "").trim().slice(0, 40);
  }
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener("change", () => pickApk(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pickApk(e.dataTransfer.files[0]));

  // Icône : réduite à 192×192 en WebP dans le navigateur (≈ 10 Ko).
  $("icoFile").addEventListener("change", async () => {
    const f = $("icoFile").files[0];
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const c = document.createElement("canvas"); c.width = c.height = 192;
      const side = Math.min(bmp.width, bmp.height);
      c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 192, 192);
      iconData = c.toDataURL("image/webp", 0.82);
      $("icoPrev").src = iconData; $("icoPrev").hidden = false;
    } catch (_) { iconData = ""; $("pubErr").textContent = "Image illisible."; }
  });

  /* ---------- envoi par morceaux (vers le serveur DAVBOT, base64, reprise par morceau) ---------- */
  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Lecture du fichier impossible"));
    r.readAsDataURL(blob);
  });

  // Envoi d'un morceau avec progression réelle (XHR), délai maximum et annulation.
  function postChunk(payload, token, onBytes, ctl) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      ctl.abort = () => x.abort();
      x.open("POST", "/api/store?action=chunk");
      x.timeout = 90000;
      x.setRequestHeader("Content-Type", "application/json");
      x.setRequestHeader("Accept", "application/json");
      x.setRequestHeader("Authorization", "Bearer " + token);
      x.upload.onprogress = (e) => { if (e.lengthComputable) onBytes(e.loaded / e.total); };
      x.onload = () => {
        let out = {};
        try { out = JSON.parse(x.responseText); } catch (_) { /* réponse non JSON */ }
        if (x.status >= 200 && x.status < 300 && out.ok !== false) return resolve();
        const err = new Error(out.message || "Serveur indisponible (" + x.status + ")");
        err.fatal = x.status >= 400 && x.status < 500 && x.status !== 429 && x.status !== 408;
        reject(err);
      };
      x.onerror = () => reject(new Error("Réseau interrompu"));
      x.ontimeout = () => reject(new Error("Délai dépassé"));
      x.onabort = () => reject(Object.assign(new Error("Annulé"), { aborted: true }));
      x.send(JSON.stringify(payload));
    });
  }

  async function sendFile(file, id, chunk, onProgress, ctl) {
    const count = Math.ceil(file.size / chunk);
    for (let i = 0; i < count; i++) {
      const start = i * chunk, end = Math.min(start + chunk, file.size);
      const data = await toBase64(file.slice(start, end));
      let tries = 0;
      for (;;) {
        if (ctl.cancelled) throw Object.assign(new Error("Annulé"), { aborted: true });
        try {
          const s = session.get();
          await postChunk({ id, i, data }, s ? s.token : "", (f) => onProgress(start + (end - start) * f, i + 1, count), ctl);
          break;
        } catch (err) {
          if (err.aborted || err.fatal) throw err;
          if (++tries > 6) throw new Error(`Échec du morceau ${i + 1}/${count} : ${err.message}`);
          $("upInfo").textContent = `Morceau ${i + 1}/${count} : ${err.message} · nouvel essai ${tries}/6…`;
          await sleep(1000 * tries);
        }
      }
      onProgress(end, i + 1, count);
    }
  }

  function setRing(p) {
    $("ringFg").style.strokeDashoffset = String(339.3 * (1 - p));
    $("ringPct").textContent = Math.round(p * 100) + "%";
  }

  $("pubForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("pubErr").textContent = "";
    if (!apk) return void ($("pubErr").textContent = "Ajoutez d'abord votre fichier APK.");
    const upd = updateTarget;
    const ctl = { abort() {}, cancelled: false, id: "" };
    uploading = ctl;
    show("stepUp"); setRing(0); $("upInfo").textContent = "Préparation…";
    $("upCancel").onclick = () => { ctl.cancelled = true; ctl.abort(); };
    try {
      const init = await api("init", { method: "POST", auth: true, body: upd ? {
        appId: upd.id, version: $("fVersion").value, changelog: $("fDesc").value, size: apk.size, filename: apk.name
      } : {
        name: $("fName").value, version: $("fVersion").value, category: $("fCat").value, tags: $("fTags").value,
        description: $("fDesc").value, size: apk.size, filename: apk.name, icon: iconData
      } });
      ctl.id = init.id;
      const t0 = Date.now();
      await sendFile(apk, init.id, init.chunk, (sent, part, parts) => {
        setRing(sent / apk.size);
        const sec = Math.max((Date.now() - t0) / 1000, 0.5), speed = sent / sec;
        const eta = speed > 0 ? Math.ceil((apk.size - sent) / speed) : 0;
        $("upInfo").textContent = `${mb(sent)} / ${mb(apk.size)} · morceau ${part}/${parts} · ${(speed / 1048576).toFixed(1)} Mo/s · ${eta > 0 ? "encore " + eta + " s" : "finalisation…"}`;
      }, ctl);
      $("upInfo").textContent = "Vérification de l'APK…";
      const done = await api("finish", { method: "POST", auth: true, body: { id: init.id } });
      $("doneName").textContent = done.app.name;
      $("doneTitle").textContent = upd ? "Mise à jour publiée" : "Application publiée";
      $("doneMsg").textContent = upd ? "est passée en version " + done.app.version + ". Les utilisateurs verront « Mettre à jour »." : "est maintenant disponible dans le catalogue.";
      show("stepDone");
      apk = null; iconData = "";
      setMode(null); $("pubForm").reset(); drop.classList.remove("ok"); $("dropTitle").textContent = "Déposez votre APK ici";
      $("dropSub").textContent = "ou touchez pour parcourir · 10 Mo maximum"; $("icoPrev").hidden = true;
      load();
    } catch (err) {
      if (ctl.id) api(upd ? "abort" : "remove", { method: "POST", auth: true, body: { id: ctl.id } }).catch(() => {});
      show("stepForm");
      $("pubErr").textContent = ctl.cancelled ? "Envoi annulé." : err.message;
    }
    uploading = null;
  });

  $("doneBtn").addEventListener("click", () => { closeModal(); $("catalogue").scrollIntoView({ behavior: "smooth" }); });
  window.addEventListener("beforeunload", (e) => { if (uploading) { e.preventDefault(); e.returnValue = ""; } });

  $("search")?.addEventListener("input", filter);
  syncAuth();
  load();
})();

"use strict";

/* DAVBOT Store : catalogue chargé depuis /api/apps, filtrage et téléchargement. */
(function () {
  const grid = document.getElementById("apps");
  const search = document.getElementById("search");
  const chipsBox = document.getElementById("categories");
  const counter = document.getElementById("resultCount");
  if (!grid) return;

  let apps = [];
  let category = "tous";

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = (classes) => { const i = el("i", classes); i.setAttribute("aria-hidden", "true"); return i; };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function stars(count) {
    const wrap = el("div", "app-stars");
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", `${count} sur 5`);
    for (let i = 1; i <= 5; i++) wrap.appendChild(icon(i <= count ? "fa-solid fa-star" : "fa-solid fa-star off"));
    return wrap;
  }

  function card(app) {
    const article = el("article", app.premium ? "app-card premium" : "app-card");
    article.dataset.category = norm(app.category);
    article.dataset.search = norm([app.name, app.developer, app.category, app.description, ...(app.tags || [])].join(" "));

    const top = el("div", "app-top");
    const img = el("img", "app-icon");
    img.src = app.icon; img.alt = `Icône ${app.name}`; img.width = 76; img.height = 76; img.loading = "lazy";
    const head = el("div");
    head.append(el("h3", "app-name", app.name), el("div", "app-dev", app.developer));
    if (app.premium) {
      const badge = el("span", "premium-badge");
      badge.append(icon("fa-solid fa-crown"), " VIP");
      head.appendChild(badge);
    }
    top.append(img, head);

    const info = el("div", "app-tags");
    [["fa-code-branch", `v${app.version}`], ["fa-box", app.size], ["fa-layer-group", app.category]].forEach(([ic, label]) => {
      const s = el("span"); s.append(icon(`fa-solid ${ic}`), label); info.appendChild(s);
    });
    (app.tags || []).forEach((t) => info.appendChild(el("span", "", t)));

    const count = el("div", "app-count");
    count.append(icon("fa-solid fa-download"), `${Number(app.downloads).toLocaleString("fr-FR")} téléchargements`);

    const link = el("a", "download");
    link.href = app.download;
    link.setAttribute("download", "");
    link.setAttribute("aria-label", `Télécharger ${app.name}`);
    link.append(icon("fa-solid fa-download"), " Télécharger");

    article.append(top, stars(app.stars), info, el("p", "app-desc", app.description), count, link);
    return article;
  }

  function buildChips() {
    const cats = [...new Set(apps.map((a) => a.category))];
    chipsBox.replaceChildren();
    ["Tous", ...cats].forEach((label, idx) => {
      const chip = el("button", idx === 0 ? "chip active" : "chip", label);
      chip.type = "button";
      chip.dataset.category = idx === 0 ? "tous" : norm(label);
      chip.setAttribute("aria-pressed", String(idx === 0));
      chip.addEventListener("click", () => {
        chipsBox.querySelectorAll(".chip").forEach((c) => { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
        chip.classList.add("active"); chip.setAttribute("aria-pressed", "true");
        category = chip.dataset.category;
        filter();
      });
      chipsBox.appendChild(chip);
    });
  }

  function filter() {
    const q = norm(search?.value.trim());
    let visible = 0;
    grid.querySelectorAll(".app-card").forEach((c) => {
      const show = (category === "tous" || c.dataset.category === category) && (!q || c.dataset.search.includes(q));
      c.hidden = !show;
      if (show) visible++;
    });
    counter.textContent = `${visible} application${visible > 1 ? "s" : ""}`;
    grid.querySelector(".state")?.remove();
    if (!visible) grid.appendChild(el("p", "state", "Aucune application ne correspond à votre recherche."));
  }

  function showError() {
    grid.replaceChildren();
    const box = el("div", "state");
    box.appendChild(el("p", "", "Impossible de charger le catalogue pour le moment."));
    const retry = el("button", "btn btn-ghost", "Réessayer");
    retry.type = "button";
    retry.addEventListener("click", load);
    box.appendChild(retry);
    grid.appendChild(box);
    grid.setAttribute("aria-busy", "false");
    counter.textContent = "";
  }

  async function load() {
    grid.setAttribute("aria-busy", "true");
    grid.replaceChildren(el("p", "state", "Chargement des applications…"));
    try {
      const res = await fetch("/api/apps", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.apps)) throw new Error("Réponse invalide");
      apps = data.apps;
      grid.replaceChildren(...apps.map(card));
      buildChips();
      grid.setAttribute("aria-busy", "false");
      filter();
    } catch (err) {
      console.error("Catalogue indisponible :", err);
      showError();
    }
  }

  search?.addEventListener("input", filter);
  load();
})();

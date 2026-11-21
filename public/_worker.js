// Cloudflare Pages (mode avancé) : fichiers statiques + proxy de /api/* vers le backend.
// Changez uniquement API_ORIGIN si le backend (api/store.js) est hébergé ailleurs.
const API_ORIGIN = "https://portfolio-ir-david-mpongo.onrender.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, API_ORIGIN);
      return fetch(new Request(target, request), { redirect: "manual" });
    }
    if (url.pathname === "/store" || url.pathname === "/store.html" || url.pathname === "/store-apk/index.html") {
      return Response.redirect(url.origin + "/store-apk", 301);
    }
    if (url.pathname === "/store-apk" || url.pathname === "/store-apk/") {
      // Sert le store directement à l'adresse /store-apk (évite la boucle /store-apk <-> /store-apk/)
      return env.ASSETS.fetch(new Request(url.origin + "/store-apk/", request));
    }
    return env.ASSETS.fetch(request);
  }
};

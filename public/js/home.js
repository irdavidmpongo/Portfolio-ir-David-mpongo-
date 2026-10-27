"use strict";

/* Page d'accueil : simulateur solaire et formulaire de contact (WhatsApp). */
(function () {
  const WA_NUMBER = "243982697752";
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  /* Simulateur solaire : pertes système 25 %, panneaux 400 W, décharge batterie 80 % */
  const conso = $("slConso"), sun = $("slSun"), aut = $("slAut");
  function calc() {
    const c = +conso.value, s = +sun.value, a = +aut.value;
    const kwc = (c * 1.25) / s;
    const panels = Math.ceil((kwc * 1000) / 400);
    const battery = a > 0 ? (c * a) / 0.8 : 0;
    const autText = a > 0 ? `${fmt(a)} ${a > 1 ? "jours" : "jour"}` : "sans batterie";

    $("oConso").textContent = `${fmt(c)} kWh`;
    $("oSun").textContent = `${fmt(s)} h/jour`;
    $("oAut").textContent = autText;
    $("rKwc").textContent = fmt(kwc);
    $("rPan").textContent = panels;
    $("rBat").textContent = fmt(battery);

    const msg = `Bonjour David, je souhaite une étude solaire : ${fmt(c)} kWh/jour, ${fmt(s)} h de soleil, ` +
      `autonomie ${autText} (estimation : ${fmt(kwc)} kWc, ${panels} panneaux, batterie ${fmt(battery)} kWh).`;
    const link = $("rWa");
    link.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  if (conso && sun && aut) {
    [conso, sun, aut].forEach((el) => el.addEventListener("input", calc));
    calc();
  }

  /* Formulaire de contact : ouvre WhatsApp avec le message prêt à envoyer */
  const form = $("waForm");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const text = `Bonjour David, je suis ${d.get("name")} (${d.get("email")}).\nService : ${d.get("service")}\n\n${d.get("message")}`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    $("formStatus").textContent = "WhatsApp s’ouvre avec votre message. Si rien ne s’affiche, écrivez à davbotapp@gmail.com.";
  });
})();

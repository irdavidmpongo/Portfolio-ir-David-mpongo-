# Déployer sur Netlify

1. Mets ce dossier dans un dépôt GitHub (ou glisse-dépose le dossier sur app.netlify.com/drop).
2. Netlify > Add new site > Import from Git > choisis le dépôt. Aucune commande de build : Netlify lit `netlify.toml` (dossier publié : `public`).
3. Le store appelle `/api/...` : Netlify relaie vers le backend indiqué dans `netlify.toml`
   (`https://portfolio-ir-david-mpongo.onrender.com`). Si ton backend est ailleurs, change cette adresse (une seule ligne `to`).
4. Le backend doit donc rester en ligne (Render, Vercel…). Le portfolio, lui, fonctionne sans.

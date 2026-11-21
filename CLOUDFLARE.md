# Tout sur Cloudflare Pages (sans Render ni Netlify)

Le site ET l'API du store tournent maintenant sur Cloudflare : `public/_worker.js` contient tout le backend.

## À faire une seule fois

1. **Nouvelle clé Firebase** (l'ancienne a circulé : on la remplace)
   - Console Firebase → projet `davbot-v2` → ⚙ Paramètres du projet → **Comptes de service** → **Générer une nouvelle clé privée** → un fichier `.json` se télécharge.
   - Même page → *Gérer les autorisations du compte de service* → onglet **Clés** → supprime l'**ancienne** clé.
2. **Secret Cloudflare**
   - Cloudflare → Workers & Pages → ton projet → **Settings → Variables and Secrets → Add**
   - Type **Secret**, nom `FIREBASE_SERVICE_ACCOUNT`, valeur = **tout le contenu** du fichier `.json`.
   - (Optionnel) variable `STORE_ADMINS` = numéros admin séparés par des virgules (par défaut `+243967930291`).
3. **Déployer** : pousse les fichiers sur GitHub (dossier de sortie `public`, aucune commande de build).

## Vérifier
- `https://TON-SITE.pages.dev/api/apps` doit afficher du JSON avec `"ok":true`.
- `https://TON-SITE.pages.dev/store-apk` affiche le store ; connexion, publication et téléchargement fonctionnent.
- Message « Configuration manquante » = le secret n'est pas (bien) enregistré. Pense à redéployer après l'avoir ajouté.

## Bon à savoir
- Applications officielles : modifier la liste `OFFICIAL` en haut de `public/_worker.js` (et `data/apps.json` si tu gardes Render).
- Plan gratuit Cloudflare : 100 000 requêtes/jour pour le worker (seules `/api/*` et `/store-apk` le sollicitent, le reste du site est servi gratuitement et sans limite) et 10 ms de processeur par requête. Les APK officiels (relayés depuis GitHub) et les listes passent sans problème ; le téléchargement d'un gros APK communautaire (plus de ~5 Mo) peut dépasser cette limite. Si cela arrive : plan **Workers Paid (5 $/mois)**.
- Les limites anti-abus (essais de connexion) sont gardées en mémoire par instance Cloudflare : elles freinent les attaques simples mais ne sont pas aussi strictes que sur un serveur unique.
- `vercel.json`, `netlify.toml`, `server.js` et `api/store.js` ne servent plus ; tu peux les garder ou les supprimer.

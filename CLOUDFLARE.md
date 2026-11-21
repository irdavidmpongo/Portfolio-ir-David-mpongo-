# Tout sur Cloudflare (sans Render ni Netlify)

Ton projet est un **Worker Cloudflare avec fichiers statiques** : `wrangler.jsonc` + `worker/index.js` contiennent le backend du store (`/api/*`), le dossier `public` contient le site. Le Worker ne reçoit que `/api/*` et `/store-apk` ; le reste du site est servi gratuitement et sans limite.

## À faire une seule fois

1. **Nouvelle clé Firebase** (l'ancienne a circulé : on la remplace)
   - Console Firebase → projet `davbot-v2` → ⚙ Paramètres du projet → **Comptes de service** → **Générer une nouvelle clé privée** → un fichier `.json` se télécharge.
   - Même page → *Gérer les autorisations du compte de service* → onglet **Clés** → supprime l'**ancienne** clé.
2. **Secret Cloudflare**
   - Cloudflare → Workers & Pages → ton Worker `portfolio-ir-david-mpongo` → **Settings → Variables and Secrets → Add**
   - Type **Secret**, nom `FIREBASE_SERVICE_ACCOUNT`, valeur = **tout le contenu** du fichier `.json`.
3. **Déployer** : pousse les fichiers sur GitHub ; la construction Cloudflare lit `wrangler.jsonc`.

## Vérifier
- `https://TON-SITE/api/apps` doit afficher du JSON avec `"ok":true`.
- `https://TON-SITE/store-apk` affiche le store ; connexion, publication et téléchargement fonctionnent.
- Message « Configuration manquante » = le secret n'est pas (bien) enregistré ; redéploie après l'avoir ajouté.

## Bon à savoir
- Applications officielles : modifier la liste `OFFICIAL` en haut de `worker/index.js` (et `data/apps.json` si tu gardes Render).
- Admins du store : `STORE_ADMINS` dans `wrangler.jsonc`.
- Plan gratuit : 100 000 requêtes/jour pour le Worker et 10 ms de processeur par requête. Les APK officiels (relayés depuis GitHub), les listes et les connexions passent sans problème ; le téléchargement d'un gros APK communautaire (plus de ~5 Mo) peut dépasser cette limite. Si cela arrive : plan **Workers Paid (5 $/mois)**.
- Les limites anti-abus (essais de connexion) sont gardées en mémoire par instance : elles freinent les attaques simples mais sont moins strictes que sur un serveur unique.
- `public/.assetsignore` empêche de publier d'anciens fichiers `_worker.js`. `vercel.json`, `netlify.toml`, `server.js` et `api/store.js` ne servent plus.

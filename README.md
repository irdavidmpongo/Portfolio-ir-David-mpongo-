# Portfolio Ir David Mpongo + DAVBOT Store

Site statique + **une seule fonction Vercel** (`api/store.js`), branchée sur le **même Firebase que Davbot** (projet `davbot-v2`).

## Règles du store

| Qui | Peut |
| --- | --- |
| Tout le monde | parcourir et **télécharger** (sans compte) |
| Compte **Davbot One** | en plus, **publier son APK** (5 apps max par compte, 10 Mo max) et **le mettre à jour** |

Connexion : numéro ou Gmail + mot de passe du compte Davbot One (lus dans `users/` de la base Davbot).

## Structure

```
api/store.js          toutes les routes : list, icon, download, latest, login, me, init, chunk, finish, abort, remove
backend/firebase.js   Firebase centralisé (Realtime Database, jetons) — seul fichier qui parle à Firebase
data/apps.json        les 2 applications officielles (DAVBOT IA PRO, DAVBOT One)
public/               index.html (portfolio), store.html, css/style.css, js/app.js, js/store.js, img/
vercel.json           routes, sécurité (CSP), cache
```

Données écrites dans la Realtime Database : `store/apps`, `store/icons`, `store/stats`, `store/files` (les APK, en base64). Aucun Firebase Storage, aucun changement à faire dans la console Firebase.

## Mise en route

Aucune variable d'environnement. Le compte de service est intégré dans `backend/firebase.js` (le même que `Davbot-main/backend/firebase.js`). Dépôt **privé** obligatoire. Déployer sur Vercel, c'est tout.

Les numéros dans `STORE_ADMINS` (`backend/firebase.js`) peuvent supprimer n'importe quelle application.

## Comment fonctionne l'upload

1. `init` : le serveur contrôle le compte et les limites (10 Mo par APK, 5 apps par compte, 400 Mo au total).
2. `chunk` : le navigateur envoie l'APK par morceaux de 1 Mo (barre de progression, nouvel essai automatique, annulation). Chaque morceau est écrit dans `store/files/<id>/c<n>`.
3. `finish` : le serveur vérifie que c'est une archive contenant `AndroidManifest.xml`, puis publie. Sinon tout est supprimé.
4. Téléchargement : le serveur relit les morceaux et les renvoie en flux (`/api/download/<id>`).

## Mise à jour d'une application (propriétaire)

1. Se connecter au store avec son compte Davbot One, puis cliquer **Mise à jour** sur sa carte.
2. Choisir le nouvel APK, indiquer la **nouvelle version** (supérieure à l'actuelle) et, si on veut, les nouveautés.
3. L'ancien APK reste téléchargeable pendant l'envoi. Il n'est remplacé qu'après vérification. Si l'envoi échoue ou est annulé, rien ne change.

Le lien de téléchargement de l'application ne change pas.

## « Mettre à jour » chez les utilisateurs

- **Dans le store** : si l'utilisateur a déjà téléchargé l'application depuis ce navigateur et qu'une version plus récente existe, le bouton devient **Mettre à jour** (avec le badge « Nouvelle version » et les nouveautés).
- **Dans l'application elle-même** : coller `docs/verification-mise-a-jour.js` dans l'app (une seule fois, puis publier un nouvel APK). Elle interroge `/api/latest/<slug ou id>` et affiche une barre « Mettre à jour » quand une version plus récente existe.

`GET /api/latest/<slug ou id>` renvoie `{ ok, version, changelog, download, … }` (public, sans compte).

## Mettre à jour une app officielle (DAVBOT IA PRO, DAVBOT One)

Modifier `data/apps.json` (le lien doit rester sous `github.com/davbotapp/Publications-apk-online-/releases/download/`).

## Développement

```bash
npm run check   # vérifie la syntaxe
npx vercel dev  # lance le site en local
```

## Déploiement Cloudflare (Worker + fichiers statiques)

Tout tourne sur Cloudflare (site + API du store dans `worker/index.js`, config dans `wrangler.jsonc`), sans Render ni Netlify. Mise en route : voir **CLOUDFLARE.md** (un secret `FIREBASE_SERVICE_ACCOUNT` à ajouter).

- Le Worker ne s'exécute que pour `/api/*` et `/store-apk` ; le reste de `public` est servi gratuitement par Cloudflare.
- `/store`, `/store.html` redirigent vers `/store-apk` (`public/_redirects`).
- SEO : canonical, Open Graph, JSON-LD, `sitemap.xml` et `robots.txt` pointent vers `https://portfolio-irdavid-mpongo.pages.dev`. Après déploiement : Google Search Console → Sitemaps → `sitemap.xml`, puis « Inspecter l'URL » sur `/` et `/store-apk`.

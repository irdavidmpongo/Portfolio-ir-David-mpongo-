# Portfolio Ir David Mpongo + DAVBOT Store

Site statique + **une seule fonction Vercel** (`api/store.js`), branchée sur le **même Firebase que Davbot** (projet `davbot-v2`).

## Règles du store

| Qui | Peut |
| --- | --- |
| Tout le monde | parcourir et **télécharger** (sans compte) |
| Compte **Davbot One** | en plus, **publier son APK** (5 apps max par compte, 10 Mo max) |

Connexion : numéro ou Gmail + mot de passe du compte Davbot One (lus dans `users/` de la base Davbot).

## Structure

```
api/store.js          toutes les routes : list, icon, download, login, me, init, finish, remove
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

## Mettre à jour une app officielle

Modifier `data/apps.json` (le lien doit rester sous `github.com/davbotapp/Publications-apk-online-/releases/download/`).

## Développement

```bash
npm run check   # vérifie la syntaxe
npx vercel dev  # lance le site en local
```

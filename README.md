# Portfolio Ir David Mpongo + DAVBOT Store

Site statique + **une seule fonction Vercel** (`api/store.js`), branchée sur le **même Firebase que Davbot** (projet `davbot-v2`).

## Règles du store

| Qui | Peut |
| --- | --- |
| Tout le monde | parcourir et **télécharger** (sans compte) |
| Compte **Davbot One** | en plus, **publier son APK** (5 apps max par compte, 150 Mo max) |

Connexion : numéro ou Gmail + mot de passe du compte Davbot One (lus dans `users/` de la base Davbot).

## Structure

```
api/store.js          toutes les routes : list, icon, download, login, me, init, finish, remove
backend/firebase.js   Firebase centralisé (base, Storage, jetons) — seul fichier qui parle à Firebase
data/apps.json        les 2 applications officielles (DAVBOT IA PRO, DAVBOT One)
public/               index.html (portfolio), store.html, css/style.css, js/app.js, js/store.js, img/
vercel.json           routes, sécurité (CSP), cache
```

Données écrites dans Firebase : `store/apps`, `store/icons`, `store/stats` (rien d'autre). APK dans Storage : `apk/<id>.apk`.

## Mise en route (obligatoire)

1. Vercel → *Settings → Environment Variables* → `FIREBASE_SERVICE_ACCOUNT` = le JSON complet du compte de service
   (le même que dans `Davbot-main/backend/firebase.js`, objet `SERVICE_ACCOUNT`).
   Alternative : coller l'objet dans `INLINE_SERVICE_ACCOUNT` de `backend/firebase.js` (**dépôt privé uniquement**).
2. Déployer. Aucune autre variable.
3. Optionnel : ajouter vos numéros Davbot One dans `STORE_ADMINS` (`backend/firebase.js`) pour pouvoir supprimer n'importe quelle application.

## Comment fonctionne l'upload

1. Le navigateur demande `init` → le serveur contrôle le compte et ouvre une session d'envoi Google Storage.
2. L'APK part **directement vers Google** par morceaux de 4 Mo (barre de progression, reprise automatique, annulation).
3. `finish` : le serveur vérifie que c'est une archive contenant `AndroidManifest.xml`, puis publie. Sinon le fichier est supprimé.
4. Téléchargement : lien Google signé valable 5 minutes (le bucket reste privé).

## Mettre à jour une app officielle

Modifier `data/apps.json` (le lien doit rester sous `github.com/davbotapp/Publications-apk-online-/releases/download/`).

## Développement

```bash
npm run check   # vérifie la syntaxe
npx vercel dev  # lance le site en local
```

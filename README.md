# Portfolio Ir David Mpongo + DAVBOT Store

Site statique + deux fonctions serverless, déployé sur **Vercel**.

| Route | Rôle |
| --- | --- |
| `/` | Portfolio (expertise, simulateur solaire, écosystème DAVBOT, contact WhatsApp) |
| `/store-apk` | DAVBOT Store (catalogue chargé depuis l'API) |
| `/api/apps` | Catalogue public (sans lien GitHub) |
| `/api/download/:id` | Téléchargement de l'APK en flux, via le serveur |

## Applications publiées

1. **DAVBOT IA PRO** — assistant IA, fonctionne hors connexion.
2. **DAVBOT One** (Davbot Outils) — réseau social et plateforme d'outils tout-en-un.

## Structure

```
api/            fonctions Vercel (apps.js, download/[id].js)
data/apps.json  catalogue : seule source de vérité
lib/catalog.js  lecture du catalogue + liste blanche des liens APK
public/         pages, CSS, JS, images
scripts/        vérification locale
vercel.json     routes, en-têtes de sécurité, cache
```

## Mettre à jour une application

Modifier `data/apps.json` (version, taille, lien `downloadUrl`), puis redéployer.
Le lien doit pointer vers `https://github.com/davbotapp/Publications-apk-online-/releases/download/…`,
sinon le téléchargement est refusé (voir `lib/catalog.js`).

## Développement

```bash
npm run check   # valide le catalogue
npx vercel dev  # lance le site en local
```

Aucune variable d'environnement n'est requise.

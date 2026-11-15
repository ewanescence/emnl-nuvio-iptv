# Mini Live TV — add-on Nuvio/Stremio minimal

Un exemple d’add-on, le plus court possible, pour apprendre le [protocole Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html) que Nuvio utilise. Il propose **une seule chaîne : BFM TV**, avec son flux HLS officiel. Pas de dépendance : seulement Node.js (version 20 ou plus) et un fichier, `server.js`.

## Lancer en local

```bash
npm start
# puis ouvrir http://127.0.0.1:7000/manifest.json
```

## Les routes

Nuvio appelle ces adresses dans l’ordre : le manifeste à l’installation, le catalogue pour afficher les chaînes, la fiche quand on ouvre une chaîne, puis le flux quand on lance la lecture. Toutes les réponses sont en JSON avec l’en-tête CORS `Access-Control-Allow-Origin: *`, sans lequel Nuvio ne peut pas lire l’add-on.

| Route | Rôle |
|---|---|
| `GET /manifest.json` | Carte d’identité de l’add-on : nom, version, ressources (`catalog`, `meta`, `stream`), type `tv`, préfixe des IDs (`minitv:`) et la liste des catalogues (ici un seul, `live`, nommé « Live TV »). |
| `GET /catalog/tv/live.json` | Le catalogue : `{ "metas": [...] }`, une liste d’aperçus (ID, nom, logo). Nuvio l’affiche dans Découvrir. |
| `GET /meta/tv/minitv:bfmtv.json` | La fiche détaillée d’une chaîne : `{ "meta": {...} }`. |
| `GET /stream/tv/minitv:bfmtv.json` | Appelée quand on lance la lecture : `{ "streams": [{ "url": "...m3u8" }] }`. Nuvio lit ensuite le flux **directement** depuis le serveur de BFM TV ; aucune vidéo ne passe par l’add-on. `behaviorHints.proxyHeaders` indique les en-têtes HTTP (ici le `Referer`) que le lecteur doit envoyer. |

Les IDs commencent par `minitv:` : c’est grâce au champ `idPrefixes` que Nuvio sait que cet add-on gère ces contenus.

## Ajouter une chaîne

Ajoutez un objet dans le tableau `CHANNELS` de `server.js` (ID avec le préfixe `minitv:`, nom, logo, URL du flux). N’utilisez que des flux officiels et gratuits. Si une chaîne demande un lien signé obtenu à la volée, faites cet appel dans la route `/stream`, au moment de la lecture.

## Déployer sur le VPS (derrière Zoraxy)

```bash
docker compose up -d --build
```

L’add-on écoute sur le port `7000`. Dans Zoraxy, créez une règle de proxy de votre domaine vers `127.0.0.1:7000` avec un certificat Let’s Encrypt. Puis dans Nuvio : **Paramètres → Addons → Ajouter**, et collez `https://VOTRE_DOMAINE/manifest.json`.

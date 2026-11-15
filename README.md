# Mini Live TV — add-on Nuvio/Stremio minimal

Un add-on court et lisible pour apprendre le [protocole Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html) que Nuvio utilise. Les chaînes sont définies dans `channels.json` ; le lien du flux est récupéré automatiquement depuis l’API publique d’[iptv-org](https://iptv-org.github.io/), puis filtré pour ne garder que les flux **officiels** de la chaîne. Aucune dépendance : seulement Node.js 22 ou plus.

Fichiers : `server.js` (le serveur), `channels.json` (les chaînes), `Dockerfile` et `docker-compose.yml` (déploiement).

## Lancer en local

```bash
npm start
# puis ouvrir http://127.0.0.1:7000/manifest.json
```

## Le fichier `channels.json`

Un tableau, une entrée par chaîne :

```json
[
  {
    "id": "bfmtv",
    "name": "BFM TV",
    "logo": "https://i.imgur.com/YJCcczD.png",
    "country": "FR",
    "iptvOrgId": "BFMTV.fr",
    "officialDomains": ["bfmtv.com", "nextradiotv.com"],
    "referer": "https://www.bfmtv.com/",
    "fallbackUrl": "https://live-cdn-stream-euw1.bfmtv.bct.nextradiotv.com/master.m3u8"
  }
]
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | Identifiant court. L’ID vu par Nuvio devient `minitv:bfmtv`. |
| `name`, `logo` | oui | Nom et logo affichés dans le catalogue. |
| `country` | oui | Code pays (affiché dans la description). |
| `iptvOrgId` | oui | ID de la chaîne chez iptv-org (ex. `BFMTV.fr`). |
| `officialDomains` | oui | Domaines appartenant à la chaîne. Seuls les flux hébergés sur ces domaines (ou leurs sous-domaines) sont proposés. |
| `referer` | non | En-tête `Referer` envoyé par le lecteur si iptv-org n’en donne pas. |
| `fallbackUrl` | non | Flux officiel utilisé si iptv-org ne renvoie aucun flux autorisé. |

Le fichier est lu au démarrage : après une modification, redémarrez l’add-on (`docker compose up -d --build`).

## Comment le flux est trouvé

1. L’add-on télécharge `https://iptv-org.github.io/api/streams.json` (la liste publique d’iptv-org : `channel`, `url`, `quality`, `referrer`, `user_agent`…).
2. Il garde les flux dont `channel` vaut le `iptvOrgId` de la chaîne.
3. **Liste blanche obligatoire :** il ne garde que les URL dont l’hôte est un des `officialDomains` ou un de leurs sous-domaines. `live-cdn-stream-euw1.bfmtv.bct.nextradiotv.com` passe pour `nextradiotv.com` ; un flux hébergé ailleurs (relais d’un opérateur, site tiers) est ignoré. C’est ce qui limite l’add-on aux flux de la chaîne elle-même.
4. Les flux restants sont renvoyés du meilleur au moins bon (`1080p` avant `576p`), avec les en-têtes `Referer` / `User-Agent` indiqués par iptv-org (ou le `referer` de la chaîne).
5. Si aucun ne convient, l’add-on utilise `fallbackUrl` ; sans `fallbackUrl`, il renvoie une liste vide et écrit la raison dans les logs.

**Cache :** la liste iptv-org (environ 4 Mo) est gardée en mémoire 6 heures, puis retéléchargée à la demande suivante. Si le téléchargement échoue, l’add-on continue avec la dernière copie valide. Elle est préchargée au démarrage.

## Ajouter une chaîne

1. Cherchez la chaîne sur [iptv-org.github.io](https://iptv-org.github.io/) et notez son ID (ex. `France24.fr`).
2. Regardez les URL de ses flux dans `streams.json` et repérez celles qui sont sur le **domaine du diffuseur lui-même** (ex. `france24.com`).
3. Ajoutez une entrée dans `channels.json` avec ce domaine dans `officialDomains`, puis redémarrez.

N’ajoutez que des domaines qui appartiennent vraiment à la chaîne : la liste blanche est ce qui garantit des flux officiels et gratuits.

## Les routes

Nuvio les appelle dans cet ordre. Toutes répondent en JSON avec l’en-tête CORS `Access-Control-Allow-Origin: *`, sans lequel Nuvio ne peut pas lire l’add-on.

| Route | Rôle |
|---|---|
| `GET /manifest.json` | Carte d’identité de l’add-on : nom, version, ressources (`catalog`, `meta`, `stream`), type `tv`, préfixe des IDs (`minitv:`) et le catalogue `live` (« Live TV »). |
| `GET /catalog/tv/live.json` | `{ "metas": [...] }` : un aperçu (ID, nom, logo) par entrée de `channels.json`. |
| `GET /meta/tv/minitv:bfmtv.json` | `{ "meta": {...} }` : la fiche d’une chaîne. |
| `GET /stream/tv/minitv:bfmtv.json` | Appelée au lancement de la lecture : `{ "streams": [{ "url": "...m3u8", ... }] }`, trouvés comme décrit plus haut. Nuvio lit ensuite le flux **directement** chez la chaîne ; aucune vidéo ne passe par l’add-on. |

## Déployer sur le VPS (derrière Zoraxy)

```bash
docker compose up -d --build
```

L’add-on écoute sur le port `7000`. Dans Zoraxy, créez une règle de proxy de votre domaine vers `127.0.0.1:7000` avec un certificat Let’s Encrypt. Puis dans Nuvio : **Paramètres → Addons → Ajouter**, et collez `https://VOTRE_DOMAINE/manifest.json`.

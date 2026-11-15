// Add-on Nuvio/Stremio minimal : une seule chaîne (BFM TV), zéro dépendance.
// Protocole : https://stremio.github.io/stremio-addon-sdk/protocol.html
import http from "node:http";

const PORT = Number(process.env.PORT || 7000);

// Toutes nos IDs commencent par ce préfixe : Nuvio sait ainsi quels contenus
// appartiennent à cet add-on (champ idPrefixes du manifeste).
const PREFIX = "minitv:";

// La chaîne. L'URL est le flux HLS officiel de BFM TV (même source que nuvio-livetv).
const BFMTV = {
  id: `${PREFIX}bfmtv`,
  type: "tv",
  name: "BFM TV",
  logo: "https://i.imgur.com/YJCcczD.png",
  description: "Flux officiel en direct de BFM TV.",
  streamUrl: "https://live-cdn-stream-euw1.bfmtv.bct.nextradiotv.com/master.m3u8",
};
const CHANNELS = [BFMTV];

// 1) Le manifeste : décrit l'add-on et ce qu'il sait faire.
const manifest = {
  id: "com.example.nuvio-minimal",
  version: "1.0.0",
  name: "Mini Live TV",
  description: "Exemple minimal : BFM TV en direct.",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  idPrefixes: [PREFIX],
  catalogs: [{ type: "tv", id: "live", name: "Live TV" }],
};

// Aperçu d'une chaîne, utilisé dans le catalogue et la fiche (meta).
function toMeta(ch) {
  return {
    id: ch.id,
    type: "tv",
    name: ch.name,
    poster: ch.logo,
    posterShape: "square",
    logo: ch.logo,
    description: ch.description,
  };
}

// Réponse JSON + en-têtes CORS (obligatoires : Nuvio/Stremio appellent depuis un autre domaine).
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let m;

  // Requête de pré-vol CORS envoyée par certains clients : on répond juste « OK ».
  if (req.method === "OPTIONS") return send(res, 200, {});

  // 1) GET /manifest.json
  if (path === "/manifest.json") return send(res, 200, manifest);

  // 2) GET /catalog/tv/live.json -> liste des chaînes (aperçus)
  if ((m = path.match(/^\/catalog\/tv\/([^/]+)\.json$/))) {
    const metas = m[1] === "live" ? CHANNELS.map(toMeta) : [];
    return send(res, 200, { metas });
  }

  // 3) GET /meta/tv/minitv:bfmtv.json -> fiche d'une chaîne
  if ((m = path.match(/^\/meta\/tv\/([^/]+)\.json$/))) {
    const ch = CHANNELS.find((c) => c.id === m[1]);
    return send(res, ch ? 200 : 404, { meta: ch ? toMeta(ch) : null });
  }

  // 4) GET /stream/tv/minitv:bfmtv.json -> lien vers la source, demandé
  //    par Nuvio quand l'utilisateur lance la lecture.
  if ((m = path.match(/^\/stream\/tv\/([^/]+)\.json$/))) {
    const ch = CHANNELS.find((c) => c.id === m[1]);
    if (!ch) return send(res, 200, { streams: [] });
    return send(res, 200, {
      streams: [
        {
          name: "Direct",
          title: ch.name,
          url: ch.streamUrl,
          // HLS direct : lisible tel quel. Le Referer imite le lecteur du site officiel.
          behaviorHints: {
            notWebReady: false,
            proxyHeaders: { request: { Referer: "https://www.bfmtv.com/" } },
          },
        },
      ],
    });
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(`Mini Live TV : http://127.0.0.1:${PORT}/manifest.json`));

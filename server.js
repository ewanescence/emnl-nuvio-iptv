// Add-on Nuvio/Stremio minimal, zéro dépendance (Node 22+).
// Protocole : https://stremio.github.io/stremio-addon-sdk/protocol.html
//
// - La liste des chaînes vient de channels.json (lu au démarrage).
// - Le lien du flux est cherché dans l'API publique d'iptv-org, puis filtré :
//   on ne garde que les URL hébergées sur les domaines officiels de la chaîne.
import http from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT || 7000);

// Toutes nos IDs commencent par ce préfixe : grâce au champ idPrefixes du
// manifeste, Nuvio sait quels contenus appartiennent à cet add-on.
const PREFIX = "minitv:";

// ---------------------------------------------------------------------------
// 1) Les chaînes (channels.json)
// ---------------------------------------------------------------------------
const CHANNELS = JSON.parse(readFileSync(new URL("./channels.json", import.meta.url), "utf8"));
console.log(`${CHANNELS.length} chaîne(s) chargée(s) depuis channels.json`);

const findChannel = (fullId) => CHANNELS.find((c) => PREFIX + c.id === fullId);

// Aperçu d'une chaîne, utilisé par le catalogue et la fiche (meta).
function toMeta(ch) {
  return {
    id: PREFIX + ch.id,
    type: "tv",
    name: ch.name,
    poster: ch.logo,
    posterShape: "square",
    logo: ch.logo,
    description: `${ch.name} en direct (${ch.country}).`,
  };
}

// ---------------------------------------------------------------------------
// 2) Les flux iptv-org, gardés en mémoire 6 h
// ---------------------------------------------------------------------------
const IPTV_ORG_STREAMS = "https://iptv-org.github.io/api/streams.json";
const CACHE_MS = 6 * 60 * 60 * 1000;
let cache = { at: 0, streams: [] };

async function getIptvOrgStreams() {
  if (Date.now() - cache.at < CACHE_MS) return cache.streams;
  try {
    const res = await fetch(IPTV_ORG_STREAMS, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = { at: Date.now(), streams: await res.json() };
    console.log(`iptv-org : ${cache.streams.length} flux téléchargés`);
  } catch (err) {
    // En cas d'échec, on garde la dernière copie valide (éventuellement vide).
    console.warn(`iptv-org indisponible (${err.message}), on garde la copie en cache`);
  }
  return cache.streams;
}

// Vrai si l'hôte de l'URL est un des domaines officiels, ou un de leurs sous-domaines.
// Exemple : "live-cdn.bfmtv.bct.nextradiotv.com" est accepté pour "nextradiotv.com".
function isOfficialHost(url, domains) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith("." + d));
}

// "1080p" -> 1080, pour trier du meilleur au moins bon.
const qualityNumber = (q) => parseInt(q, 10) || 0;

// Construit un objet "stream" pour Nuvio, avec les en-têtes HTTP que le lecteur doit envoyer.
function toStream(ch, url, { quality, referrer, userAgent } = {}) {
  const headers = {};
  if (referrer || ch.referer) headers.Referer = referrer || ch.referer;
  if (userAgent) headers["User-Agent"] = userAgent;
  const stream = { name: quality || "Direct", title: ch.name, url, behaviorHints: { notWebReady: false } };
  if (Object.keys(headers).length) stream.behaviorHints.proxyHeaders = { request: headers };
  return stream;
}

async function resolveStreams(ch) {
  const all = await getIptvOrgStreams();
  const sameChannel = all.filter((s) => s.channel === ch.iptvOrgId);
  const official = sameChannel
    .filter((s) => isOfficialHost(s.url, ch.officialDomains))
    .sort((a, b) => qualityNumber(b.quality) - qualityNumber(a.quality));

  if (official.length) {
    return official.map((s) =>
      toStream(ch, s.url, { quality: s.quality, referrer: s.referrer, userAgent: s.user_agent }),
    );
  }
  const why = sameChannel.length
    ? `${sameChannel.length} flux iptv-org pour ${ch.iptvOrgId}, aucun sur ${ch.officialDomains.join(", ")}`
    : `aucun flux iptv-org pour ${ch.iptvOrgId}`;
  if (ch.fallbackUrl) {
    console.warn(`${ch.id} : ${why} -> fallbackUrl`);
    return [toStream(ch, ch.fallbackUrl, { quality: "Secours" })];
  }
  console.warn(`${ch.id} : ${why}, pas de fallbackUrl -> aucun flux`);
  return [];
}

// ---------------------------------------------------------------------------
// 3) Le manifeste : décrit l'add-on et ce qu'il sait faire
// ---------------------------------------------------------------------------
const manifest = {
  id: "com.example.nuvio-minimal",
  version: "1.1.0",
  name: "Mini Live TV",
  description: "Exemple minimal d'add-on de chaînes en direct (flux officiels).",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  idPrefixes: [PREFIX],
  catalogs: [{ type: "tv", id: "live", name: "Live TV" }],
};

// ---------------------------------------------------------------------------
// 4) Le serveur HTTP et ses routes
// ---------------------------------------------------------------------------
// Réponse JSON + en-têtes CORS (obligatoires : Nuvio appelle depuis une autre origine).
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let m;

  // Requête de pré-vol CORS envoyée par certains clients : on répond juste « OK ».
  if (req.method === "OPTIONS") return send(res, 200, {});

  // GET /manifest.json
  if (path === "/manifest.json") return send(res, 200, manifest);

  // GET /catalog/tv/live.json -> liste des chaînes (aperçus)
  if ((m = path.match(/^\/catalog\/tv\/([^/]+)\.json$/))) {
    return send(res, 200, { metas: m[1] === "live" ? CHANNELS.map(toMeta) : [] });
  }

  // GET /meta/tv/minitv:bfmtv.json -> fiche d'une chaîne
  if ((m = path.match(/^\/meta\/tv\/([^/]+)\.json$/))) {
    const ch = findChannel(m[1]);
    return send(res, ch ? 200 : 404, { meta: ch ? toMeta(ch) : null });
  }

  // GET /stream/tv/minitv:bfmtv.json -> liens vers la source, demandés quand
  // l'utilisateur lance la lecture. Nuvio lit ensuite le flux directement.
  if ((m = path.match(/^\/stream\/tv\/([^/]+)\.json$/))) {
    const ch = findChannel(m[1]);
    return send(res, 200, { streams: ch ? await resolveStreams(ch) : [] });
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`Mini Live TV : http://127.0.0.1:${PORT}/manifest.json`);
  getIptvOrgStreams(); // préchargement du cache, sans bloquer le démarrage
});

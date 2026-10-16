// Fetches avalanche incidents from LAWIS (Lawinenwarndienste Österreich, also Bavaria and South Tyrol) for the app's area
// and writes data/unfaelle.geojson (points, compact properties) and data/unfaelle-text.json (descriptions, loaded on demand).
// Runs in GitHub Actions (Node 20). Details are fetched only for new or revised incidents, the rest comes from the last run.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const API = "https://lawis.at/lawis_api/v2_3/incident/";
const BBOX = { s: 46.6, w: 9.5, n: 47.85, e: 13.1 }; // same area as the OSM data
const ASPECT = { 1: "N", 2: "NE", 3: "E", 4: "SE", 5: "S", 6: "SW", 7: "W", 8: "NW" };
const UA = { "User-Agent": "lawinen-app (github.com/nicourban97-dot/lawinen-app)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  let last;
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      last = new Error(`${url} ${r.status}`);
    } catch (e) { last = e; }
    await sleep(2000 * (a + 1));
  }
  throw last;
}
const n = v => v == null || v === "" ? null : Number(v);
const clean = s => s == null ? null : String(s).replace(/\s+/g, " ").trim() || null;

mkdirSync("data", { recursive: true });
const logLines = [];
const say = (...a) => { const t = `${new Date().toISOString()} ${a.join(" ")}`; console.log(t); logLines.push(t); };

const old = existsSync("data/unfaelle.geojson") ? JSON.parse(readFileSync("data/unfaelle.geojson", "utf8")) : { features: [] };
const oldText = existsSync("data/unfaelle-text.json") ? JSON.parse(readFileSync("data/unfaelle-text.json", "utf8")) : {};
const known = new Map(old.features.map(f => [f.properties.id, f]));

try {
  const list = await getJSON(API);
  const inArea = list.filter(x => x.latitude >= BBOX.s && x.latitude <= BBOX.n && x.longitude >= BBOX.w && x.longitude <= BBOX.e
    && x.datum && x.datum >= "1990");
  say(`LAWIS: ${list.length} Ereignisse, im Gebiet ${inArea.length}`);
  const feats = [], text = {};
  let fetched = 0, failed = 0;
  // Only new or revised incidents; many have no description at all, those are not asked for again.
  const todo = inArea.filter(x => { const k = known.get(x.incident_id); return !k || k.properties.rev !== x.revision; });
  say(`Details neu zu laden: ${todo.length}`);
  const details = new Map();
  // Four requests at a time, a short pause in between: the API serves a public website.
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async x => {
      try { details.set(x.incident_id, await getJSON(API + x.incident_id)); fetched++; } catch (e) { failed++; }
    }));
    if (i % 200 === 0 && i) say(`Details ${i}/${todo.length}`);
    await sleep(150);
  }
  for (const x of inArea) {
    const d = details.get(x.incident_id), k = known.get(x.incident_id);
    if (!d && k && k.properties.rev === x.revision) { feats.push(k); if (oldText[x.incident_id]) text[x.incident_id] = oldText[x.incident_id]; continue; }
    const src = d || {};
    const p = {
      id: x.incident_id, rev: x.revision, d: x.datum.slice(0, 16), o: clean(x.ort), e: n(x.elevation), i: n(x.incline),
      a: ASPECT[x.aspect_id] || null, l: x.danger_id >= 1 && x.danger_id <= 5 ? x.danger_id : 0,
      dead: n(x.n_dead) || 0, inj: n(x.n_injured) || 0, un: n(x.n_uninjured) || 0, inv: x.involved === "yes" ? 1 : 0,
      t: n(src.type_id), s: n(src.size_id) >= 1 && n(src.size_id) <= 5 ? n(src.size_id) : null,
      bur: n(src.buried_total), par: n(src.buried_partial), sw: n(src.sweeped),
      ad: clean(src.asc_desc), rel: clean(src.av_release), wet: clean(src.av_humidity)
    };
    for (const key of Object.keys(p)) if (p[key] == null) delete p[key];
    feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [Math.round(x.longitude * 1e5) / 1e5, Math.round(x.latitude * 1e5) / 1e5] }, properties: p });
    const c = clean(src.comments) || oldText[x.incident_id] || null;
    if (c) text[x.incident_id] = c.length > 1200 ? c.slice(0, 1200) + " …" : c;
  }
  feats.sort((a, b) => b.properties.d.localeCompare(a.properties.d));
  const stamp = new Date().toISOString();
  writeFileSync("data/unfaelle.geojson", JSON.stringify({ type: "FeatureCollection", generated: stamp,
    source: "LAWIS – Lawinenwarndienste Österreich, Bayern und Südtirol (lawis.at)", features: feats }));
  writeFileSync("data/unfaelle-text.json", JSON.stringify(text));
  say(`Geschrieben: ${feats.length} Ereignisse, Details geladen ${fetched}, fehlgeschlagen ${failed}`);
} catch (e) { say("Unfälle fehlgeschlagen, alte Dateien bleiben:", e.stack || e); }
writeFileSync("data/unfaelle-log.txt", logLines.join("\n") + "\n");

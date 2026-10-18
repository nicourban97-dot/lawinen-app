// Fetches ski touring routes and wildlife protection zones from OpenStreetMap (Overpass API) for the Alps
// and writes compact GeoJSON files to data/, split into bands of 2° longitude. Runs in GitHub Actions (Node 20).
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { PNG } from "pngjs";
import { simplify, rings, inShape, km, bandOf, joinWays } from "./osm-lib.mjs";

const AREA = { s: 43.7, w: 5.0, n: 48.4, e: 16.5 }; // the Alps from France to Slovenia
const BBOX = `${AREA.s},${AREA.w},${AREA.n},${AREA.e}`;
const REGION_CODES = ["AT-02", "AT-03", "AT-04", "AT-05", "AT-06", "AT-07", "AT-08", "DE-BY", "CH", "FR",
  "IT-21", "IT-23", "IT-25", "IT-32-BZ", "IT-32-TN", "IT-34", "IT-36", "SI"];
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function overpass(query) {
  let last;
  for (const url of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "lawinen-app (github.com/nicourban97-dot/lawinen-app)" } });
        if (r.ok) return await r.json();
        last = new Error(`${url} ${r.status}`);
        console.log(`Overpass ${url} Antwort ${r.status}, Versuch ${attempt + 1}`);
      } catch (e) { last = e; console.log(`Overpass ${url} Fehler ${e.message}, Versuch ${attempt + 1}`); }
      await new Promise(res => setTimeout(res, 15000 * (attempt + 1)));
    }
  }
  throw last;
}
const r5 = v => Math.round(v * 1e5) / 1e5;
const line = g => simplify(g.map(p => [r5(p.lon), r5(p.lat)]));
const keep = (tags, keys) => Object.fromEntries(keys.filter(k => tags[k] != null).map(k => [k, tags[k]]));

const ROUTE_TAGS = ["name", "piste:name", "piste:difficulty", "piste:type", "route", "description", "ref", "website", "note", "piste:grooming", "operator"];
let joinStats = null;
async function routes() {
  const q = `[out:json][timeout:900];(way["piste:type"="skitour"](${BBOX});relation["piste:type"="skitour"](${BBOX});relation["route"="ski"](${BBOX}););out geom;`;
  const j = await overpass(q);
  const feats = [], inRelation = new Set(), loose = [], relLines = [];
  for (const e of j.elements) if (e.type === "relation") for (const m of e.members || []) if (m.type === "way") inRelation.add(m.ref);
  for (const e of j.elements) {
    if (e.type === "way" && e.geometry && e.tags && e.tags["piste:type"] === "skitour") {
      if (inRelation.has(e.id)) continue; // drawn as part of its route relation
      loose.push({ id: e.id, tags: keep(e.tags, ROUTE_TAGS), coords: e.geometry.map(p => [p.lon, p.lat]) });
    } else if (e.type === "relation" && e.tags) {
      const t = e.tags;
      if (t.route === "ski" && t["piste:type"] && t["piste:type"] !== "skitour") continue; // nordic or downhill
      const members = (e.members || []).filter(m => m.type === "way" && m.geometry);
      // Every relation member counts as a route passing through, so loose pieces are not joined across it.
      members.forEach(m => relLines.push(m.geometry.map(p => [p.lon, p.lat])));
      const lines = members.map(m => line(m.geometry));
      if (!lines.length) continue;
      feats.push({ type: "Feature", id: `r${e.id}`, properties: { osm: `relation/${e.id}`, osm_ways: members.map(m => `way/${m.ref}`), ...keep(t, ROUTE_TAGS) },
        geometry: { type: "MultiLineString", coordinates: lines } });
    }
  }
  // Pieces of one tour, split in OSM, become one route.
  const joined = joinWays(loose, 25, relLines);
  joinStats = { before: loose.length, after: joined.length };
  for (const it of joined) feats.push({ type: "Feature", id: `w${it.ids[0]}`,
    properties: { osm: `way/${it.ids[0]}`, osm_ways: it.ids.map(i => `way/${i}`), ...it.tags },
    geometry: { type: "LineString", coordinates: simplify(it.coords.map(c => [r5(c[0]), r5(c[1])])) } });
  return feats;
}

const ZONE_TAGS = ["name", "protection_title", "protect_class", "description", "seasonal", "access", "access:conditional", "ski", "ski:conditional",
  "opening_hours", "operator", "website", "related_law", "hazard", "start_date", "note", "leisure", "boundary"];
const WILD = /schongebiet|schutzzone|wildruhe|ruhezone|wildschutz|wald-wild|gebietsverbot|wegegebot|wild-europaschutz|wildlife|raufu|auerhuhn|birkhuhn|einstand|zone de tranquillit|quiete|tranquillità/i;
const NOT_WILD = /flora|fauna-flora|naturpark|naturdenkmal|wiesenbr|fischlaich|natura 2000|wasserschutz/i;
// The Alps hold far more protected areas than one Overpass request returns in time: one request per band.
async function zones() {
  const feats = [], stats = {}, seen = new Set();
  for (let b = bandOf(AREA.w); b <= bandOf(AREA.e - 1e-9); b++) {
    const w = 5 + 2 * b, e = Math.min(w + 2, AREA.e), box = `${AREA.s},${w},${AREA.n},${e}`;
    const q = `[out:json][timeout:900];(way["boundary"="protected_area"](${box});relation["boundary"="protected_area"](${box});way["leisure"="nature_reserve"](${box});relation["leisure"="nature_reserve"](${box}););out geom;`;
    const j = await overpass(q);
    for (const el of j.elements) {
      const key = `${el.type}/${el.id}`; if (seen.has(key)) continue; seen.add(key);
      const t = el.tags || {};
      const text = [t.name, t.protection_title, t.description, t["protection_title:de"], t.note].filter(Boolean).join(" ");
      const wild = !NOT_WILD.test(t.protection_title || "") && (WILD.test(text) || t.seasonal === "winter" || !!t["ski:conditional"] || /winter|dec|nov|jan/i.test(t["access:conditional"] || ""));
      const sk = `${t.protect_class || "-"} | ${t.protection_title || "-"}`;
      stats[sk] = (stats[sk] || 0) + 1;
      if (!wild) continue;
      let geometry = null;
      if (el.type === "way" && el.geometry) {
        const c = line(el.geometry);
        if (c.length >= 4) { if (c[0][0] !== c.at(-1)[0] || c[0][1] !== c.at(-1)[1]) c.push(c[0]); geometry = { type: "Polygon", coordinates: [c] }; }
      } else if (el.type === "relation") {
        const outer = rings((el.members || []).filter(m => m.type === "way" && m.geometry && m.role !== "inner").map(m => line(m.geometry)));
        const inner = rings((el.members || []).filter(m => m.type === "way" && m.geometry && m.role === "inner").map(m => line(m.geometry)));
        if (outer.length) geometry = { type: "MultiPolygon", coordinates: outer.map((o, i) => i === 0 ? [o, ...inner] : [o]) };
      }
      if (!geometry) continue;
      feats.push({ type: "Feature", id: `${el.type[0]}${el.id}`, properties: { osm: key, ...keep(t, ZONE_TAGS) }, geometry });
    }
    console.log(`Schutzgebiete Band ${b}: bisher ${feats.length}`);
  }
  return { feats, stats };
}

// --- route statistics from the Terrarium elevation tiles (zoom 12, about 26 m per pixel), same method as the app ---
const ASPECTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DEM_Z = 12, demTiles = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function demTile(x, y) {
  const key = `${x}/${y}`;
  if (!demTiles.has(key)) demTiles.set(key, (async () => {
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_Z}/${x}/${y}.png`);
        if (!r.ok) throw new Error(String(r.status));
        const png = PNG.sync.read(Buffer.from(await r.arrayBuffer())), h = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) h[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
        return h;
      } catch (e) { await sleep(1500 * (a + 1)); }
    }
    return null;
  })());
  return demTiles.get(key);
}
function worldPx(lon, lat) {
  const n = 2 ** DEM_Z * 256, s = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
async function demPoint(lon, lat) {
  const [X, Y] = worldPx(lon, lat), tx = Math.floor(X / 256), ty = Math.floor(Y / 256);
  const h = await demTile(tx, ty); if (!h) return null;
  const i = Math.min(254, Math.max(1, Math.floor(X - tx * 256))), j = Math.min(254, Math.max(1, Math.floor(Y - ty * 256)));
  const at = (a, b) => h[b * 256 + a], px = 40075016.686 * Math.cos(lat * Math.PI / 180) / (256 * 2 ** DEM_Z);
  const dx = ((at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1)) - (at(i - 1, j - 1) + 2 * at(i - 1, j) + at(i - 1, j + 1))) / (8 * px);
  const dy = ((at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1)) - (at(i - 1, j - 1) + 2 * at(i, j - 1) + at(i + 1, j - 1))) / (8 * px);
  let br = Math.atan2(-dx, dy) * 180 / Math.PI; if (br < 0) br += 360;
  return { e: at(i, j), s: Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI, asp: ASPECTS[Math.round(br / 45) % 8] };
}
async function routeStats(geom) {
  const lines = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates, samples = [];
  let length = 0;
  lines.forEach((ln, li) => {
    for (let k = 0; k < ln.length; k++) {
      if (!k) { samples.push({ p: ln[0], seg: 0, li }); continue; }
      const a = ln[k - 1], b = ln[k], d = km(a, b) * 1000, steps = Math.max(1, Math.round(d / 30));
      for (let t = 1; t <= steps; t++) samples.push({ p: [a[0] + (b[0] - a[0]) * t / steps, a[1] + (b[1] - a[1]) * t / steps], seg: d / steps, li });
      length += d;
    }
  });
  const vals = await Promise.all(samples.map(x => demPoint(x.p[0], x.p[1])));
  const pts = samples.map((x, k) => ({ ...x, ...(vals[k] || {}) })).filter(x => x.e != null);
  if (!pts.length) return null;
  let asc = 0, top = pts[0], low = pts[0], max = 0; const cls = [0, 0, 0, 0], asp = {};
  pts.forEach((x, k) => {
    if (x.e > top.e) top = x; if (x.e < low.e) low = x; if (x.s > max) max = x.s;
    const q = pts[k - 1]; if (q && q.li === x.li && x.e > q.e) asc += x.e - q.e;
    if (x.s >= 30) { cls[x.s >= 45 ? 3 : x.s >= 40 ? 2 : x.s >= 35 ? 1 : 0] += x.seg; asp[x.asp] = (asp[x.asp] || 0) + x.seg; }
  });
  return { len: Math.round(length), asc: Math.round(asc), top: Math.round(top.e), low: Math.round(low.e), max: Math.round(max),
    cls: cls.map(Math.round), asp: ASPECTS.filter(a => (asp[a] || 0) >= 60), tlon: r5(top.p[0]), tlat: r5(top.p[1]), slon: r5(low.p[0]), slat: r5(low.p[1]) };
}
async function regionShapes() {
  const out = [];
  for (const c of REGION_CODES) {
    try { const g = await (await fetch(`https://regions.avalanches.org/micro-regions/${c}_micro-regions.geojson.json`)).json();
      out.push(...g.features.filter(f => !f.properties.end_date)); } catch (e) { console.warn("regions", c, e.message); }
  }
  return out;
}
async function peaks() {
  const j = await overpass(`[out:json][timeout:600];node["natural"="peak"]["name"](${BBOX});out;`);
  return j.elements.map(e => ({ name: e.tags.name, ele: Number(String(e.tags.ele || "").replace(",", ".")) || null, p: [e.lon, e.lat] }));
}
async function addStats(features) {
  const [shapes, pk] = await Promise.all([regionShapes(), peaks().catch(() => [])]);
  // Peaks on a grid of 0.02° so the nearest-peak search stays fast for the whole Alps.
  const grid = new Map(), gk = (x, y) => `${Math.floor(x / 0.02)}|${Math.floor(y / 0.02)}`;
  for (const p of pk) { const k = gk(p.p[0], p.p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  let n = 0;
  for (const f of features) {
    const st = await routeStats(f.geometry);
    if (!st) continue;
    f.properties.st = st;
    const reg = shapes.find(s => inShape(st.tlon, st.tlat, s.geometry));
    if (reg) f.properties.region = reg.properties.id;
    let best = null, bd = 1.2;
    const cx = Math.floor(st.tlon / 0.02), cy = Math.floor(st.tlat / 0.02);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const p of grid.get(`${cx + dx}|${cy + dy}`) || []) { const d = km([st.tlon, st.tlat], p.p); if (d < bd) { bd = d; best = p; } }
    if (best) { f.properties.peak = best.name; if (best.ele) f.properties.peak_ele = best.ele; }
    if (++n % 200 === 0) console.log(`stats ${n}/${features.length}, tiles ${demTiles.size}`);
  }
}
// One file per band plus an index with each part's bounding box, so the app loads only what it shows.
function writeParts(dir, name, feats, lonOf, meta) {
  rmSync(`data/${dir}`, { recursive: true, force: true });
  mkdirSync(`data/${dir}`, { recursive: true });
  const bands = new Map();
  for (const f of feats) { const lon = lonOf(f); if (lon == null) continue; const b = bandOf(lon); if (!bands.has(b)) bands.set(b, []); bands.get(b).push(f); }
  const parts = [];
  for (const [b, list] of [...bands].sort((x, y) => x[0] - y[0])) {
    let w = 180, s = 90, e = -180, n = -90;
    const walk = c => { if (typeof c[0] === "number") { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
    list.forEach(f => walk(f.geometry.coordinates));
    const file = `${name}-${b}.geojson`;
    writeFileSync(`data/${dir}/${file}`, JSON.stringify({ type: "FeatureCollection", ...meta, features: list }));
    parts.push({ file, w: r5(w), s: r5(s), e: r5(e), n: r5(n), count: list.length });
  }
  writeFileSync(`data/${dir}/index.json`, JSON.stringify({ ...meta, parts }, null, 1));
  return parts;
}
const bboxMidLon = f => { let w = 180, e = -180; const walk = c => { if (typeof c[0] === "number") { w = Math.min(w, c[0]); e = Math.max(e, c[0]); } else c.forEach(walk); }; walk(f.geometry.coordinates); return (w + e) / 2; };

mkdirSync("data", { recursive: true });
// Every step logs to data/osm-log.txt (committed with the data) so failures can be read without the Actions login.
const logLines = [];
const say = (...a) => { const t = `${new Date().toISOString()} ${a.join(" ")}`; console.log(t); logLines.push(t); };
const meta = { generated: new Date().toISOString(), source: "OpenStreetMap-Mitwirkende (ODbL)" };
let rt = null, z = null;
try {
  rt = await routes(); say(`Routen geladen: ${rt.length}`);
  if (joinStats) say(`Touren vor dem Verbinden: ${joinStats.before} Wege, danach: ${joinStats.after}`);
  try { await addStats(rt); say(`Kennzahlen berechnet: ${rt.filter(f => f.properties.st).length}, Kacheln ${demTiles.size}`); }
  catch (e) { say("Kennzahlen fehlgeschlagen:", e.stack || e); }
  const sugg = rt.filter(f => f.properties.st && f.properties.region && f.properties.st.asc >= 200 && f.properties.st.len >= 1000).length;
  say(`vorschlagbar (ab 200 Hm und 1 km, mit Teilgebiet): ${sugg}`);
  const parts = writeParts("skitouren", "skitouren", rt, f => f.properties.st ? f.properties.st.tlon : bboxMidLon(f), meta);
  say(`Tourendateien: ${parts.map(p => `${p.file} ${p.count}`).join(", ")}`);
  if (existsSync("data/skitouren.geojson")) rmSync("data/skitouren.geojson");
} catch (e) { say("Routen fehlgeschlagen, alte Dateien bleiben:", e.stack || e); }
try {
  z = await zones(); say(`Schutzgebiete: ${z.feats.length}`);
  const parts = writeParts("wildschutz", "wildschutz", z.feats, bboxMidLon, meta);
  say(`Schutzgebietsdateien: ${parts.map(p => `${p.file} ${p.count}`).join(", ")}`);
  if (existsSync("data/wildschutz.geojson")) rmSync("data/wildschutz.geojson");
  const top = Object.entries(z.stats).sort((a, b) => b[1] - a[1]).slice(0, 80);
  writeFileSync("data/osm-info.json", JSON.stringify({ generated: meta.generated, routes: rt ? rt.length : null, zones: z.feats.length,
    zoneNames: z.feats.slice(0, 200).map(f => [f.properties.name, f.properties.protection_title, f.properties.protect_class, f.properties.seasonal, f.properties["access:conditional"] || f.properties["ski:conditional"]]),
    protectedAreaTypes: top }, null, 1));
} catch (e) { say("Schutzgebiete fehlgeschlagen, alte Dateien bleiben:", e.stack || e); }
writeFileSync("data/osm-log.txt", logLines.join("\n") + "\n");

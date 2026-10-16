// Fetches ski touring routes and wildlife protection zones from OpenStreetMap (Overpass API)
// for the app's area and writes compact GeoJSON files to data/. Runs in GitHub Actions (Node 20).
import { writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const BBOX = "46.6,9.5,47.85,13.1"; // south,west,north,east: Vorarlberg, Allgäu, Bavarian Alps, Tyrol, South Tyrol north
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
      } catch (e) { last = e; }
      await new Promise(res => setTimeout(res, 15000 * (attempt + 1)));
    }
  }
  throw last;
}
const r5 = v => Math.round(v * 1e5) / 1e5;
// Douglas-Peucker, tolerance in degrees (5e-5 is about 4 to 5 m in the Alps).
function simplify(pts, tol = 5e-5) {
  if (pts.length < 3) return pts;
  const f = pts[0], l = pts[pts.length - 1];
  if (f[0] === l[0] && f[1] === l[1]) {
    // Closed ring: split at the point farthest from the start, otherwise every distance is measured to a single point.
    let far = 1, best = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - f[0], pts[i][1] - f[1]); if (d > best) { best = d; far = i; } }
    if (far <= 0 || far >= pts.length - 1) return pts;
    return simplify(pts.slice(0, far + 1), tol).concat(simplify(pts.slice(far), tol).slice(1));
  }
  const keepIdx = new Uint8Array(pts.length); keepIdx[0] = keepIdx[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > max) { max = d; idx = i; } }
    if (max > tol) { keepIdx[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keepIdx[i]);
}
const line = g => simplify(g.map(p => [r5(p.lon), r5(p.lat)]));
const keep = (tags, keys) => Object.fromEntries(keys.filter(k => tags[k] != null).map(k => [k, tags[k]]));

// Join open way pieces into closed rings (for multipolygon relations).
function rings(parts) {
  const out = [], pool = parts.map(p => p.slice());
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (pool.length && guard++ < 10000) {
      const a = ring[0], b = ring[ring.length - 1];
      if (a[0] === b[0] && a[1] === b[1] && ring.length > 3) break;
      const i = pool.findIndex(p => (p[0][0] === b[0] && p[0][1] === b[1]) || (p[p.length - 1][0] === b[0] && p[p.length - 1][1] === b[1]));
      if (i < 0) break;
      let next = pool.splice(i, 1)[0];
      if (!(next[0][0] === b[0] && next[0][1] === b[1])) next = next.reverse();
      ring = ring.concat(next.slice(1));
    }
    const a = ring[0], b = ring[ring.length - 1];
    if (!(a[0] === b[0] && a[1] === b[1])) ring.push(a);
    if (ring.length >= 4) out.push(ring);
  }
  return out;
}

const ROUTE_TAGS = ["name", "piste:name", "piste:difficulty", "piste:type", "route", "description", "ref", "website", "note", "piste:grooming", "operator"];
async function routes() {
  const q = `[out:json][timeout:600];(way["piste:type"="skitour"](${BBOX});relation["piste:type"="skitour"](${BBOX});relation["route"="ski"](${BBOX}););out geom;`;
  const j = await overpass(q);
  const feats = [], inRelation = new Set();
  for (const e of j.elements) if (e.type === "relation") for (const m of e.members || []) if (m.type === "way") inRelation.add(m.ref);
  for (const e of j.elements) {
    if (e.type === "way" && e.geometry && e.tags && e.tags["piste:type"] === "skitour") {
      if (inRelation.has(e.id)) continue; // drawn as part of its route relation
      feats.push({ type: "Feature", id: `w${e.id}`, properties: { osm: `way/${e.id}`, ...keep(e.tags, ROUTE_TAGS) },
        geometry: { type: "LineString", coordinates: line(e.geometry) } });
    } else if (e.type === "relation" && e.tags) {
      const t = e.tags;
      if (t.route === "ski" && t["piste:type"] && t["piste:type"] !== "skitour") continue; // nordic or downhill
      const lines = (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => line(m.geometry));
      if (!lines.length) continue;
      feats.push({ type: "Feature", id: `r${e.id}`, properties: { osm: `relation/${e.id}`, ...keep(t, ROUTE_TAGS) },
        geometry: { type: "MultiLineString", coordinates: lines } });
    }
  }
  return feats;
}

const ZONE_TAGS = ["name", "protection_title", "protect_class", "description", "seasonal", "access", "access:conditional", "ski", "ski:conditional",
  "opening_hours", "operator", "website", "related_law", "hazard", "start_date", "note", "leisure", "boundary"];
const WILD = /schongebiet|schutzzone|wildruhe|ruhezone|wildschutz|wald-wild|gebietsverbot|wegegebot|wild-europaschutz|wildlife|raufu|auerhuhn|birkhuhn|einstand/i;
const NOT_WILD = /flora|fauna-flora|naturpark|naturdenkmal|wiesenbr|fischlaich|natura 2000|wasserschutz/i;
async function zones() {
  const q = `[out:json][timeout:600];(way["boundary"="protected_area"](${BBOX});relation["boundary"="protected_area"](${BBOX});way["leisure"="nature_reserve"](${BBOX});relation["leisure"="nature_reserve"](${BBOX}););out geom;`;
  const j = await overpass(q);
  const feats = [], stats = {};
  for (const e of j.elements) {
    const t = e.tags || {};
    const text = [t.name, t.protection_title, t.description, t["protection_title:de"], t.note].filter(Boolean).join(" ");
    const wild = !NOT_WILD.test(t.protection_title || "") && (WILD.test(text) || t.seasonal === "winter" || !!t["ski:conditional"] || /winter|dec|nov|jan/i.test(t["access:conditional"] || ""));
    const key = `${t.protect_class || "-"} | ${t.protection_title || "-"}`;
    stats[key] = (stats[key] || 0) + 1;
    if (!wild) continue;
    let geometry = null;
    if (e.type === "way" && e.geometry) {
      const c = line(e.geometry);
      if (c.length >= 4) { if (c[0][0] !== c.at(-1)[0] || c[0][1] !== c.at(-1)[1]) c.push(c[0]); geometry = { type: "Polygon", coordinates: [c] }; }
    } else if (e.type === "relation") {
      const outer = rings((e.members || []).filter(m => m.type === "way" && m.geometry && m.role !== "inner").map(m => line(m.geometry)));
      const inner = rings((e.members || []).filter(m => m.type === "way" && m.geometry && m.role === "inner").map(m => line(m.geometry)));
      if (outer.length) geometry = { type: "MultiPolygon", coordinates: outer.map((o, i) => i === 0 ? [o, ...inner] : [o]) };
    }
    if (!geometry) continue;
    feats.push({ type: "Feature", id: `${e.type[0]}${e.id}`, properties: { osm: `${e.type}/${e.id}`, ...keep(t, ZONE_TAGS) }, geometry });
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
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
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
  const r5 = v => Math.round(v * 1e5) / 1e5;
  return { len: Math.round(length), asc: Math.round(asc), top: Math.round(top.e), low: Math.round(low.e), max: Math.round(max),
    cls: cls.map(Math.round), asp: ASPECTS.filter(a => (asp[a] || 0) >= 60), tlon: r5(top.p[0]), tlat: r5(top.p[1]), slon: r5(low.p[0]), slat: r5(low.p[1]) };
}
function inShape(lon, lat, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const inRing = ring => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  return polys.some(p => inRing(p[0]) && !p.slice(1).some(inRing));
}
async function regionShapes() {
  const out = [];
  for (const c of ["AT-07", "AT-08", "DE-BY", "IT-32-BZ", "IT-32-TN"]) {
    try { const g = await (await fetch(`https://regions.avalanches.org/micro-regions/${c}_micro-regions.geojson.json`)).json();
      out.push(...g.features.filter(f => !f.properties.end_date)); } catch (e) { console.warn("regions", c, e.message); }
  }
  return out;
}
async function peaks() {
  const j = await overpass(`[out:json][timeout:300];node["natural"="peak"]["name"](${BBOX});out;`);
  return j.elements.map(e => ({ name: e.tags.name, ele: Number(String(e.tags.ele || "").replace(",", ".")) || null, p: [e.lon, e.lat] }));
}
async function addStats(features) {
  const [shapes, pk] = await Promise.all([regionShapes(), peaks().catch(() => [])]);
  let n = 0;
  for (const f of features) {
    const st = await routeStats(f.geometry);
    if (!st) continue;
    f.properties.st = st;
    const reg = shapes.find(s => inShape(st.tlon, st.tlat, s.geometry));
    if (reg) f.properties.region = reg.properties.id;
    let best = null, bd = 1.2;
    for (const p of pk) { const d = km([st.tlon, st.tlat], p.p); if (d < bd) { bd = d; best = p; } }
    if (best) { f.properties.peak = best.name; if (best.ele) f.properties.peak_ele = best.ele; }
    if (++n % 100 === 0) console.log(`stats ${n}/${features.length}, tiles ${demTiles.size}`);
  }
}

mkdirSync("data", { recursive: true });
const stamp = new Date().toISOString();
const rt = await routes();
await addStats(rt);
writeFileSync("data/skitouren.geojson", JSON.stringify({ type: "FeatureCollection", generated: stamp, source: "OpenStreetMap-Mitwirkende (ODbL)", features: rt }));
const z = await zones();
writeFileSync("data/wildschutz.geojson", JSON.stringify({ type: "FeatureCollection", generated: stamp, source: "OpenStreetMap-Mitwirkende (ODbL)", features: z.feats }));
const top = Object.entries(z.stats).sort((a, b) => b[1] - a[1]).slice(0, 80);
writeFileSync("data/osm-info.json", JSON.stringify({ generated: stamp, routes: rt.length, zones: z.feats.length,
  zoneNames: z.feats.slice(0, 200).map(f => [f.properties.name, f.properties.protection_title, f.properties.protect_class, f.properties.seasonal, f.properties["access:conditional"] || f.properties["ski:conditional"]]),
  protectedAreaTypes: top }, null, 1));
console.log(`routes ${rt.length}, zones ${z.feats.length}`);

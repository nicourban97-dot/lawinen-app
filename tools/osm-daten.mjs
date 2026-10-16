// Fetches ski touring routes and wildlife protection zones from OpenStreetMap (Overpass API)
// for the app's area and writes compact GeoJSON files to data/. Runs in GitHub Actions (Node 20).
import { writeFileSync, mkdirSync } from "node:fs";

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
const line = g => g.map(p => [r5(p.lon), r5(p.lat)]);
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
      feats.push({ type: "Feature", id: `w${e.id}`, properties: { osm: `way/${e.id}`, ...keep(e.tags, ROUTE_TAGS), part: inRelation.has(e.id) || undefined },
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
const WILD = /wild|schon|ruhe|winter|habitat|raufu|auerhuhn|birkhuhn|gams|steinbock|einstand/i;
async function zones() {
  const q = `[out:json][timeout:600];(way["boundary"="protected_area"](${BBOX});relation["boundary"="protected_area"](${BBOX});way["leisure"="nature_reserve"](${BBOX});relation["leisure"="nature_reserve"](${BBOX}););out geom;`;
  const j = await overpass(q);
  const feats = [], stats = {};
  for (const e of j.elements) {
    const t = e.tags || {};
    const text = [t.name, t.protection_title, t.description, t["protection_title:de"], t.note].filter(Boolean).join(" ");
    const wild = WILD.test(text) || t.protect_class === "14" || !!t["ski:conditional"] || !!t["access:conditional"] || t.seasonal === "winter";
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

mkdirSync("data", { recursive: true });
const stamp = new Date().toISOString();
const rt = await routes();
writeFileSync("data/skitouren.geojson", JSON.stringify({ type: "FeatureCollection", generated: stamp, source: "OpenStreetMap-Mitwirkende (ODbL)", features: rt }));
const z = await zones();
writeFileSync("data/wildschutz.geojson", JSON.stringify({ type: "FeatureCollection", generated: stamp, source: "OpenStreetMap-Mitwirkende (ODbL)", features: z.feats }));
const top = Object.entries(z.stats).sort((a, b) => b[1] - a[1]).slice(0, 80);
writeFileSync("data/osm-info.json", JSON.stringify({ generated: stamp, routes: rt.length, zones: z.feats.length,
  zoneNames: z.feats.slice(0, 200).map(f => [f.properties.name, f.properties.protection_title, f.properties.protect_class, f.properties.seasonal, f.properties["access:conditional"] || f.properties["ski:conditional"]]),
  protectedAreaTypes: top }, null, 1));
console.log(`routes ${rt.length}, zones ${z.feats.length}`);

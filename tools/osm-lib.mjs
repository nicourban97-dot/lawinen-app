// Pure helpers for the data actions: geometry, simplification, joining OSM way pieces into whole tours.

export const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };

// Douglas-Peucker, tolerance in degrees (5e-5 is about 4 to 5 m in the Alps).
export function simplify(pts, tol = 5e-5) {
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

// Join open way pieces into closed rings (for multipolygon relations).
export function rings(parts) {
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

export function inShape(lon, lat, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const inRing = ring => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  return polys.some(p => inRing(p[0]) && !p.slice(1).some(inRing));
}

// Bands of 2 degrees longitude from 5° E, used to split the data files.
export const bandOf = lon => Math.floor((lon - 5) / 2);

// OSM often splits one tour into several ways. Pieces are joined where exactly two ends meet (within tolM metres)
// and their names agree (or only one has a name). At a junction of three or more ends nothing is joined.
export function joinWays(ways, tolM = 25) {
  let items = ways.map(w => ({ ids: [w.id], tags: { ...w.tags }, coords: w.coords.map(c => [c[0], c[1]]) }));
  const cell = 0.001, tolKm = tolM / 1000;
  const keyOf = (x, y) => `${Math.floor(x / cell)}|${Math.floor(y / cell)}`;
  const namesOk = (a, b) => !a.tags.name || !b.tags.name || a.tags.name === b.tags.name;
  for (;;) {
    const ends = [], grid = new Map();
    items.forEach((it, i) => { if (it.coords.length < 2) return; [0, 1].forEach(end => {
      const p = end ? it.coords[it.coords.length - 1] : it.coords[0], e = { i, end, p };
      ends.push(e); const k = keyOf(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); }); });
    const near = e => {
      const cx = Math.floor(e.p[0] / cell), cy = Math.floor(e.p[1] / cell), out = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        for (const o of grid.get(`${cx + dx}|${cy + dy}`) || []) if (o !== e && km(e.p, o.p) <= tolKm) out.push(o);
      return out;
    };
    let merged = false;
    for (const e of ends) {
      const n = near(e);
      if (n.length !== 1) continue;
      const o = n[0];
      if (o.i === e.i || near(o).length !== 1) continue;
      const A = items[e.i], B = items[o.i];
      if (!namesOk(A, B)) continue;
      // Orient both so that A's end meets B's start.
      const a = e.end ? A.coords : A.coords.slice().reverse(), aIds = e.end ? A.ids : A.ids.slice().reverse();
      const b = o.end ? B.coords.slice().reverse() : B.coords, bIds = o.end ? B.ids.slice().reverse() : B.ids;
      const joined = e.end === 0 && o.end === 1
        ? { ids: B.ids.concat(A.ids), coords: B.coords.concat(A.coords.slice(1)) }
        : { ids: aIds.concat(bIds), coords: a.concat(b.slice(1)) };
      const tags = {};
      for (const [k, v] of Object.entries(A.tags)) if (B.tags[k] === v) tags[k] = v;
      const name = A.tags.name || B.tags.name; if (name) tags.name = name;
      items = items.filter((_, i) => i !== e.i && i !== o.i).concat([{ ...joined, tags }]);
      merged = true;
      break;
    }
    if (!merged) return items;
  }
}

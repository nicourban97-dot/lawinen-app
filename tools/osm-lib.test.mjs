import { test } from "node:test";
import assert from "node:assert/strict";
import { joinWays, bandOf, buildSearchIndex } from "./osm-lib.mjs";

const w = (id, coords, tags = {}) => ({ id, coords, tags: { "piste:type": "skitour", ...tags } });

test("verbindet zwei Stücke, die sich am Ende berühren", () => {
  const out = joinWays([w(1, [[10, 47], [10.001, 47.001]]), w(2, [[10.001, 47.001], [10.002, 47.003]])]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].ids, [1, 2]);
  assert.equal(out[0].coords.length, 3);
});
test("dreht ein Stück um, wenn es falsch herum liegt", () => {
  const out = joinWays([w(1, [[10, 47], [10.001, 47.001]]), w(2, [[10.002, 47.003], [10.001, 47.001]])]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].coords.at(-1), [10.002, 47.003]);
});
test("verbindet nicht an einer Kreuzung mit drei Enden", () => {
  const p = [10.001, 47.001];
  const out = joinWays([w(1, [[10, 47], p]), w(2, [p, [10.002, 47.003]]), w(3, [p, [10.0, 47.004]])]);
  assert.equal(out.length, 3);
});
test("verbindet nicht bei verschiedenen Namen", () => {
  const out = joinWays([w(1, [[10, 47], [10.001, 47.001]], { name: "A" }), w(2, [[10.001, 47.001], [10.002, 47.003]], { name: "B" })]);
  assert.equal(out.length, 2);
});
test("übernimmt den Namen, wenn nur ein Stück einen hat", () => {
  const out = joinWays([w(1, [[10, 47], [10.001, 47.001]], { name: "A" }), w(2, [[10.001, 47.001], [10.002, 47.003]])]);
  assert.equal(out[0].tags.name, "A");
});
test("Toleranz 25 m", () => {
  const out = joinWays([w(1, [[10, 47], [10.001, 47.001]]), w(2, [[10.0012, 47.0011], [10.002, 47.003]])]);
  assert.equal(out.length, 1);
});
test("verbindet nicht, wenn ein dritter Weg durch den Punkt läuft", () => {
  const p = [10.001, 47.001];
  const out = joinWays([w(1, [[10, 47], p]), w(2, [p, [10.002, 47.003]]), w(3, [[10.0, 47.002], p, [10.002, 47.0]])]);
  assert.equal(out.length, 3);
});
test("verbindet nicht, wenn eine Routen-Relation durch den Punkt läuft", () => {
  const p = [10.001, 47.001];
  const out = joinWays([w(1, [[10, 47], p]), w(2, [p, [10.002, 47.003]])], 25, [[[10.0, 47.002], p, [10.002, 47.0]]]);
  assert.equal(out.length, 2);
});
test("verbindet nicht bei verschiedenem piste:name", () => {
  const out = joinWays([w(1, [[10, 47], [10.001, 47.001]], { "piste:name": "A" }), w(2, [[10.001, 47.001], [10.002, 47.003]], { "piste:name": "B" })]);
  assert.equal(out.length, 2);
});
test("Suchindex nur aus vorschlagbaren Touren", () => {
  const f = (osm, len, asc, name) => ({ properties: { osm, name, peak: "Gipfel " + osm, st: { len, asc, tlon: 10.123456, tlat: 47.654321 } } });
  const idx = buildSearchIndex([f("relation/1", 3000, 800, "A"), f("way/2", 500, 100, "Stück")]);
  assert.deepEqual(idx, [{ n: "A", p: "Gipfel relation/1", o: "relation/1", x: 10.12346, y: 47.65432, b: 2 }]);
});
test("Bänder zu 2 Grad ab 5 Grad Ost", () => {
  assert.equal(bandOf(5.0), 0); assert.equal(bandOf(10.3), 2); assert.equal(bandOf(16.4), 5);
});

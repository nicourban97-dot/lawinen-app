// Tests for the pure helpers in index.html: the block between the pure markers is cut out and evaluated on its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/\/\/ --- pure:start ---([\s\S]*?)\/\/ --- pure:end ---/);
if (!m) throw new Error("pure block missing in index.html");
const P = new Function(m[1] + "; return { tourMinutes, fmtDuration, swipePage, powderList, searchTours, boxAround, swipeCommit };")();

test("Dauer nach Alpenvereinsregel", () => {
  assert.equal(P.tourMinutes(3951, 972), 224);     // h=3.24, w=0.988 -> 3.73 h
  assert.equal(P.tourMinutes(8000, 300), 150);     // w=2 dominiert: 2 + 0.5 = 2.5 h
  assert.equal(P.fmtDuration(224), "ca. 3 h 45 min");
  assert.equal(P.fmtDuration(180), "ca. 3 h");
  assert.equal(P.fmtDuration(5), "ca. 15 min");
  assert.equal(P.fmtDuration(45), "ca. 45 min");
});
test("Wischen", () => {
  const pg = ["lage", "karte", "touren", "wetter"];
  assert.equal(P.swipePage(pg, "lage", -80, 10), "karte");
  assert.equal(P.swipePage(pg, "karte", 80, 0), "lage");
  assert.equal(P.swipePage(pg, "lage", 80, 0), null);
  assert.equal(P.swipePage(pg, "wetter", -80, 0), null);
  assert.equal(P.swipePage(pg, "lage", -50, 0), null);
  assert.equal(P.swipePage(pg, "lage", -80, 50), null);
});
test("Powderliste", () => {
  const pts = [{ area: "tirol", past24: 12, past72: 40, next24: 5 }, { area: "tirol", past24: 25.4, past72: 30, next24: 0 },
    { area: "bayern", past24: 21, past72: 21, next24: 30 }, { area: "ch", past24: 3, past72: 8, next24: 1 }];
  assert.deepEqual(P.powderList(pts, 20, "past24"), [{ area: "tirol", cm: 25 }, { area: "bayern", cm: 21 }]);
  assert.deepEqual(P.powderList(pts, 20, "next24"), [{ area: "bayern", cm: 30 }]);
  assert.deepEqual(P.powderList(pts, 50, "past72"), []);
});
test("Tourensuche", () => {
  const idx = [{ n: "Rauhhorn", p: "" }, { n: "Über die Gaißhornscharte", p: "Gaißhorn" }, { n: "Hornspitze", p: "" }];
  assert.equal(P.searchTours(idx, "uber")[0].n, "Über die Gaißhornscharte");      // Umlaut egal
  assert.deepEqual(P.searchTours(idx, "HORN").map(e => e.n), ["Hornspitze", "Rauhhorn", "Über die Gaißhornscharte"]); // Wortanfang zuerst
  assert.deepEqual(P.searchTours(idx, "gaißhorn").map(e => e.p), ["Gaißhorn"]);
  assert.deepEqual(P.searchTours(idx, " "), []);
});
test("Rechteck um einen Punkt im Format von loadParts", () => {
  assert.deepEqual(P.boxAround(6.9, 45.9, 0.15, 0.1), [[6.75, 45.8], [7.050000000000001, 46]]);
});test("Wisch wird ausgeführt nach Weg oder Tempo", () => {
  assert.equal(P.swipeCommit(-100, 600, 375), true);   // mehr als ein Viertel der Breite, langsam
  assert.equal(P.swipeCommit(90, 600, 375), false);    // knapp unter einem Viertel, langsam: zurück
  assert.equal(P.swipeCommit(-40, 100, 375), true);    // kurzer schneller Wisch (0,4 px/ms)
  assert.equal(P.swipeCommit(-20, 30, 375), false);    // zu kurz, auch wenn schnell
  assert.equal(P.swipeCommit(0, 0, 375), false);
});
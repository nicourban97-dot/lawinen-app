# Lawinen-App 0.9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Powderalert in der App, Wischen zwischen Seiten, Karten- und Wettersuche, Tour-Kurzinfo mit Lage- und Wetterknopf, Höhenlinien auf der 2D-Karte.

**Architecture:** Alles bleibt in der Einzeldatei `index.html`. Reine Hilfsfunktionen kommen in einen markierten Block (`// --- pure:start ---` … `// --- pure:end ---`), den ein node:test-Test aus der Datei herausschneidet und auswertet. UI-Teile werden im Browser-Pane geprüft (lokaler Server `lawinen-app`, Port 8765). Die OSM-Action erzeugt zusätzlich einen Suchindex.

**Tech Stack:** Vanilla JS, MapLibre GL JS 4.7.1, `maplibre-contour` (neu, feste Version von unpkg), Open-Meteo Forecast und Geocoding API, node:test (Node 20 in der Action, Node 24 lokal).

**Spec:** `docs/superpowers/specs/2026-10-18-lawinen-app-0.9-design.md`

## Global Constraints

- Branch `v0.9` von `main`; `const VERSION = "0.9";`.
- Nur freie Dienste ohne Schlüssel, CORS-fähig; externe Skripte nur von unpkg/jsDelivr/cdnjs mit fester Version.
- Bestehende `localStorage`-Schlüssel nicht brechen (`lawinenapp.threshold.v1`, `…favs.v1`, `…wxplace.v1`, `…mapfilter.v1`, `finder.v2`); neue Schlüssel mit Suffix `.v1`.
- Open-Meteo: mehrere Koordinaten pro Abfrage, höchstens 100 pro Abfrage, Abfragen nacheinander.
- Design C: Farben nur über die Tokens in `:root` (mit Dunkelmodus), Überschriften `--font-head`.
- Lawinenstufe steht überall neben dem Neuschnee.
- Texte auf Deutsch, Kommentare im Code auf Englisch (wie bisher).
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Nachrichtendatei per `[IO.File]::WriteAllText` (ohne BOM).
- Tests lokal: `node --test "tools/*.test.mjs"`.

## Review Focus

1. **Wisch in einem waagrecht scrollbaren Element** (Wetter-Stundenleiste, Filter-Chips, Schieberegler): darf die Seite nicht wechseln. Test in Task 3.
2. **Open-Meteo nicht erreichbar oder Datum außerhalb der Saison:** Powderalert-Kasten zeigt einen Hinweis statt zu verschwinden oder zu hängen; Kurzinfo und Tourwetter bleiben bedienbar. Test in Task 2 und Task 5.
3. **Tour ohne Lagebericht oder ohne Region** (Sommer, Tour außerhalb der Regionen): Kurzinfo zeigt „–“ für die Stufe, der Knopf „Lage“ öffnet den Hinweis „Kein Lagebericht“ statt abzustürzen. Test in Task 4.
4. **Suche ohne Treffer oder Geocoding-Fehler:** Liste sagt „Nichts gefunden“ bzw. „Ortssuche nicht erreichbar“, Tourentreffer erscheinen trotzdem. Test in Task 7.
5. **Datumswechsel bei offener Kurzinfo oder offenem Tourwetter:** Kurzinfo schließt (wie das bisherige Routenblatt), keine Werte vom alten Tag. Test in Task 4.

---

### Task 1: Branch, Version, reine Hilfsfunktionen mit Testgerüst

**Files:**
- Modify: `index.html` (VERSION; neuer Block `// --- pure:start ---` … `// --- pure:end ---` im Skript, vor `const state`)
- Create: `tools/app-pure.test.mjs` (läuft in der Action über `tools/*.test.mjs` automatisch mit)

**Interfaces:**
- Produces (alle im pure-Block, ohne DOM- und Zustandszugriff):
  - `tourMinutes(lenM: number, ascM: number) -> number` — Alpenvereinsregel: `h = ascM/300`, `w = lenM/1000/4`, Ergebnis `round((max(h,w) + min(h,w)/2) * 60)`.
  - `fmtDuration(min: number) -> string` — `"ca. 45 min"`, `"ca. 3 h"`, `"ca. 3 h 15 min"`; auf 15 min gerundet, mindestens 15.
  - `swipePage(pages: string[], current: string, dx: number, dy: number) -> string | null` — Wechsel nur bei `|dx| >= 60` und `|dx| > 2·|dy|`; `dx < 0` → nächste, `dx > 0` → vorige; am Rand `null`.
  - `powderList(points: {area, past24, past72, next24}[], threshold: number, period: "past24"|"past72"|"next24") -> {area, cm}[]` — je Gebiet der höchste Wert des Zeitraums, nur `>= threshold`, absteigend sortiert, `cm` auf ganze Zahl gerundet.
  - `searchTours(index: {n, p, o, x, y, b}[], q: string, limit = 8) -> entries[]` — trifft Name `n` oder Gipfel `p`, Groß-/Kleinschreibung und Umlaute egal (`ä→a` usw. per `normalize("NFD")`), Treffer am Wortanfang zuerst.

- [ ] **Step 1:** `git checkout -b v0.9`, `VERSION = "0.9"` setzen.
- [ ] **Step 2: Failing tests** in `tools/app-pure.test.mjs`. Der Test liest `index.html`, schneidet den Text zwischen den Markern heraus und wertet ihn mit `new Function(block + "; return { tourMinutes, fmtDuration, swipePage, powderList, searchTours };")()` aus.

```js
test("Dauer nach Alpenvereinsregel", () => {
  assert.equal(P.tourMinutes(3951, 972), 224);     // h=3.24, w=0.988 -> 3.73 h
  assert.equal(P.tourMinutes(8000, 300), 150);     // w=2 dominiert: 2 + 0.5 = 2.5 h
  assert.equal(P.fmtDuration(224), "ca. 3 h 45 min");
  assert.equal(P.fmtDuration(180), "ca. 3 h");
  assert.equal(P.fmtDuration(5), "ca. 15 min");
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
  assert.deepEqual(P.searchTours(idx, "HORN").map(e => e.n), ["Hornspitze", "Rauhhorn", "Über die Gaißhornscharte"]); // Wortanfang zuerst, sonst Reihenfolge des Index
  assert.deepEqual(P.searchTours(idx, "gaißhorn").map(e => e.p), ["Gaißhorn"]);
  assert.deepEqual(P.searchTours(idx, " "), []);
});
```

- [ ] **Step 3:** `node --test "tools/*.test.mjs"` → FAIL (Marker fehlen).
- [ ] **Step 4:** Die fünf Funktionen im pure-Block implementieren.
- [ ] **Step 5:** Tests → PASS (alle, auch `osm-lib`).
- [ ] **Step 6: Commit** „0.9: Version, reine Hilfsfunktionen mit Tests“.

### Task 2: Einstellungen und Powderalert auf der Lage-Seite

**Files:**
- Modify: `index.html` — `#settings`-Formular, `state`, neue Funktion `loadPowder`, `renderPowder` ersetzen, `renderAll`/`refresh`.

**Interfaces:**
- Consumes: `powderList` (Task 1), `shapesFor(date)`, `AREAS`, `regionArea(id)`, `areaSummary(a)`, `areaName(key)`, `showFinderFor(key)`, `weatherBase(date)`, `getJSON`.
- Produces:
  - `state.powder = { on: boolean, period: "past24"|"past72"|"next24" }`, gespeichert unter `lawinenapp.powder.v1`, Standard `{ on: true, period: "past24" }`. Schwelle bleibt `state.threshold` (`lawinenapp.threshold.v1`, Standard 20).
  - `loadPowder(date: string) -> Promise<{id, area, lat, lon, past24, past72, next24}[] | null>` — ein Punkt pro Mikroregion aus `shapesFor(date)` (Mittelpunkt der Bounding-Box, Höhe 2000 m), stündlich `snowfall`, Zeitraum `date-3` bis `date+1`, Bezugszeit wie `loadAreaWeather` (heute: jetzt, sonst 08:00). Abfragen in Paketen zu 100, nacheinander. Ergebnis im Speicher und in `sessionStorage` unter `lawinenapp.powder.<date>` zwischengespeichert. `null` bei Fehler.
  - `state.powderPts` (Ergebnis oder `null`), `state.powderLoading: boolean`.
- Einstellungen: Schalter „Powderalert“ (`#s-powder`, Checkbox), Schwelle `#s-thr` (bleibt), Auswahl `#s-period` mit „letzte 24 h“, „letzte 3 Tage“, „nächste 24 h“. Schwelle und Zeitraum ausgegraut, wenn aus.
- Kasten `#powder` auf der Lage-Seite:
  - aus → versteckt.
  - lädt → „Neuschnee wird geladen …“.
  - Fehler → „Neuschnee gerade nicht abrufbar.“
  - keine Treffer → „Nirgends über {n} cm {zeitraumtext}.“
  - Treffer → je Gebiet eine Zeile: Gebietsname, „{cm} cm“, Stufenfeld (höchste Stufe des Tages aus `areaSummary`, sonst „–“), Knopf „Touren“ → `showFinderFor(key)`. Höchstens 8 Zeilen, Rest „+ n weitere“ aufklappbar.
- Ladezeitpunkt: `loadPowder` startet erst, nachdem `renderAll()` nach den Lageberichten gelaufen ist, und nur wenn `state.powder.on`.

- [ ] **Step 1:** Einstellungen und `state.powder` einbauen; `#s-thr` schreibt weiter `lawinenapp.threshold.v1`; jede Änderung ruft `renderPowder()` und (Task 6) `refreshPowderLayer()` auf, falls definiert.
- [ ] **Step 2:** `loadPowder` implementieren und im Datumsablauf nach `renderAll()` anstoßen; bei Datumswechsel alten Stand verwerfen (Antworten für ein altes Datum ignorieren).
- [ ] **Step 3:** `renderPowder` neu schreiben (Zustände wie oben). Gebiet einer Mikroregion über `regionArea(id)`; Mikroregionen ohne App-Gebiet unter ihrem Länder-Präfix-Gebiet zusammenfassen, sonst weglassen.
- [ ] **Step 4: Browser-Prüfung** (Testtag 15.01.2026, `sessionStorage` leer):
  - Kasten zeigt erst „wird geladen“, dann Treffer oder „Nirgends über 20 cm …“.
  - Schwelle 5 → mehr Zeilen, jede mit Stufenfeld.
  - Powderalert aus → Kasten weg.
  - Netzwerk für `api.open-meteo.com` blockieren (oder `getJSON` im Test werfen lassen) → „Neuschnee gerade nicht abrufbar.“
  - Netzwerkliste: höchstens 5 Open-Meteo-Abfragen für den Powderalert, alle nach den Lageberichten.
  - Heutiges Datum (keine Berichte): Kasten erscheint trotzdem, Stufen „–“.
- [ ] **Step 5: Commit** „0.9: Powderalert mit Schalter, Zeitraum und Alpen-Liste“.

### Task 3: Wischen zwischen den Seiten

**Files:**
- Modify: `index.html` — Touch-Handler auf `main` (Seiten-Container) und `nav.tabbar`.

**Interfaces:**
- Consumes: `swipePage` (Task 1), `goPage(name)`, `currentPage`, `PAGES`.
- Produces: `initSwipe()`; Reihenfolge `["lage", "karte", "touren", "wetter"]`.

Regeln (Spec):
- Kein Wechsel, wenn der Start auf der Karte liegt (`#map`, `.maplibregl-canvas`) oder in `input, select, textarea, [contenteditable]`, in einem Element mit `scrollWidth > clientWidth` und `overflow-x` `auto`/`scroll`, oder solange das Blatt `#sheet` offen ist.
- Auf `nav.tabbar` ist das Wischen auf allen Seiten erlaubt (auch Karte).
- `touchstart`/`touchend` passiv, nur `goPage` bei Treffer; keine Animation nötig.

- [ ] **Step 1:** `initSwipe` implementieren und beim Start aufrufen.
- [ ] **Step 2: Browser-Prüfung** mit synthetischen `TouchEvent`s (Handybreite, `resize_window` mobile):
  - Lage, Wisch nach links → Karte.
  - Karte, Wisch auf der Karte → bleibt Karte.
  - Karte, Wisch auf der Tab-Leiste nach links → Touren.
  - Wetter, Wisch in der Stundenleiste → bleibt Wetter.
  - Finder-Schieberegler → bleibt.
  - Blatt offen → bleibt.
  - Wetter, nach links → bleibt (Rand).
- [ ] **Step 3: Commit** „0.9: Wischen zwischen den Seiten“.

### Task 4: Kurzinfo beim Antippen einer Tour, Lage-Knopf überall

**Files:**
- Modify: `index.html` — neues Element `#peek` (unten über der Tab-Leiste, nur Karten-Seite), `showRoute`, Tippen auf eigene Tour (bisher `openSheet(t.name, …, "route")` um Zeile 2520), `tourBadge`, Tourenkarten im Finder und in „Meine Touren“, `routePanel`, Tour-Detail.

**Interfaces:**
- Consumes: `tourMinutes`, `fmtDuration` (Task 1); `compiled(regionId)`, `levelAt(c, elev)`, `maxLevel`, `state.regions`, `openRegionSheet(id)`, `routePanel()`, `routeName(p)`, `clearSelection()`, `bboxOf(geom)`.
- Produces:
  - `openPeek(kind: "route"|"tour", item)` — `item` ist das GeoJSON-Feature (route) oder die eigene Tour.
  - `closePeek()`.
  - `peekFacts(kind, item) -> { name, region, level: number|null, lenKm: number|null, asc: number|null, minutes: number|null }`.
    - Route: aus `p.st` (`len`, `asc`, `top`) und `p.region`.
    - Eigene Tour: `t.region`, `t.top`; Länge und Höhenmeter aus der berechneten Spur, falls vorhanden, sonst `null` (Anzeige „–“).
    - Stufe: `levelAt(compiled(region), top)`, ohne Bericht `null`.
  - `openBulletinFor(regionId: string)` — ruft `openRegionSheet(regionId)`; ohne Region öffnet sie ein Blatt mit „Für diese Tour ist keine Lawinenregion bekannt.“
  - `openTourWeather(kind, item)` — kommt aus Task 5; bis dahin ist der Knopf ausgeblendet.
- Kurzinfo:
  - Inhalt: Name; Zeile mit Stufenfeld, „{km} km“, „{hm} Hm“, „{dauer}“; Knöpfe „Lage“ und „Wetter“.
  - Höhe höchstens 25 % des Bildschirms.
  - Die Karte rückt die Tour mit `fitBounds`, `padding.bottom` = Höhe der Kurzinfo + 20.
  - Antippen der Fläche oder Hochziehen (dy < −40) öffnet das volle Blatt wie bisher.
  - Nach unten ziehen (dy > 40) oder Tipp auf leere Karte → `closePeek()` + `clearSelection()`.
- `tourBadge`: „Lage prüfen“ wird `<button class="badge">`, Klick → `openBulletinFor(region)` (Klick nicht an die Karte weiterreichen). Ebenso im vollen Routenblatt und im Tour-Detail ein Knopf „Lagebericht“.
- Datumswechsel: `closePeek()` dort, wo heute `sheetKind === "route"` das Blatt schließt.

- [ ] **Step 1:** `peekFacts` und `#peek` bauen; `showRoute` öffnet die Kurzinfo statt sofort das Blatt (Risiko-Berechnung `riskOf` läuft weiter im Hintergrund und zeichnet die Spur).
- [ ] **Step 2:** Eigene Touren auf der Karte genauso.
- [ ] **Step 3:** `openBulletinFor` und die Lage-Knöpfe.
- [ ] **Step 4: Browser-Prüfung** (15.01.2026, Tirol, Karte bei Zoom ≥ 9, Pane sichtbar):
  - Route antippen → Kurzinfo mit Stufe, km, Hm, „ca. …“; Spur oberhalb der Kurzinfo vollständig sichtbar (Bounding-Box der Spur in Pixeln liegt über `#peek`).
  - Kurzinfo antippen → volles Blatt.
  - „Lage“ → Lagebericht der Region.
  - Leere Karte antippen → zu.
  - Datum auf 22.02.2026 → Kurzinfo zu.
  - Heutiges Datum (keine Berichte) → Stufe „–“, „Lage“ zeigt „Kein Lagebericht“.
  - Finder-Karte „Lage prüfen“ → Lagebericht.
- [ ] **Step 5: Commit** „0.9: Kurzinfo für Touren, Lagebericht per Knopf“.

### Task 5: Tourwetter mit den letzten 7 Tagen

**Files:**
- Modify: `index.html` — `openTourWeather`, neuer Teil `wxPastDays`, Knöpfe aus Task 4 einblenden, Knopf im Tour-Detail.

**Interfaces:**
- Consumes: `tourWeather(t, date)` / `fetchTourWeather` (liefert schon `date-7 … date` täglich und stündlich), `forecastView(w, date, opts)`, `openSheet(title, node, returnTo, kind)`.
- Produces:
  - `openTourWeather(kind: "route"|"tour", item)`. Für Routen ein Pseudo-Tourobjekt `{ id: "r:" + p.osm, lat: st.tlat, lon: st.tlon, top: st.top }`.
  - Öffnet `openSheet("Wetter " + name, node, null, "tourwx")`.
  - Schließen kehrt zur Kurzinfo zurück, falls sie offen war (sie bleibt unter dem Blatt bestehen).
  - `wxPastDays(w, date) -> HTMLElement` — Tabelle der 7 Tage vor `date`: Datum (Wochentag kurz), Neuschnee (cm, `snowfall_sum`), Temperatur min/max (°C), Wind max (km/h) mit Böen, Summe Neuschnee über 7 Tage in der Kopfzeile.
- Vorhersage: zusätzlich eine Abfrage `forecastFor({lat, lon, elev: top}, date)` (schon vorhanden) für die Tage ab `date`. Darstellung über `forecastView`.
- Fehler: „Wetter gerade nicht abrufbar.“ im Blatt, Blatt bleibt schließbar.

- [ ] **Step 1:** `wxPastDays` und `openTourWeather` implementieren, Knöpfe aktivieren.
- [ ] **Step 2: Browser-Prüfung:**
  - Route in Tirol, Datum 15.01.2026, „Wetter“ → Vorhersage und 7 Zeilen 08.–14.01. mit Zahlen.
  - Schließen → Kurzinfo noch da.
  - Open-Meteo blockiert → Fehlertext, Schließen geht.
- [ ] **Step 3: Commit** „0.9: Tourwetter mit Rückschau auf 7 Tage“.

### Task 6: Neuschnee-Ebene auf der Karte

**Files:**
- Modify: `index.html` — Quelle/Ebene `powder` in der Kartenstilliste (bei den anderen Ebenen), Ebenen-Panel, Legende.

**Interfaces:**
- Consumes: `state.powderPts` und `loadPowder` (Task 2), `state.threshold`, `state.powder`, `mapState.shapes`, `renderMapPanel`, `renderLegend`, `activeLayerCount`.
- Produces:
  - `mapState.filter.powder: boolean` (Standard `true`; in `lawinenapp.mapfilter.v1` ergänzt, fehlender Schlüssel = true).
  - `refreshPowderLayer()`.
  - Ebene `powder-fill`: Mikroregionen mit Wert ≥ Schwelle im gewählten Zeitraum blau-weiß eingefärbt (Deckkraft nach cm, zwei Stufen: ≥ Schwelle, ≥ 2× Schwelle), unter den Touren.
  - Touren in solchen Regionen: dickere Linie (`line-width` +1.5) über eine Filterliste der Regions-IDs.
- Chip „Neuschnee“ im Panel nur, wenn `state.powder.on`. Legendenzeile „Neuschnee ≥ {n} cm ({zeitraum})“ mit Stufenhinweis „Neuschnee erhöht die Lawinengefahr“.
- Lädt `loadPowder` nach, falls noch nicht geschehen, sobald die Ebene sichtbar ist.

- [ ] **Step 1:** Ebene und Filter einbauen; `refreshPowderLayer` bei Datum, Schwelle, Zeitraum, Schalter aufrufen.
- [ ] **Step 2: Browser-Prüfung** (15.01.2026, Schwelle 5):
  - Gebiete gefärbt, Touren darin dicker.
  - Schwelle 100 → nichts gefärbt.
  - Powderalert aus → Chip und Ebene weg.
  - Ebenen-Zähler „Ebenen · n“ stimmt.
- [ ] **Step 3: Commit** „0.9: Neuschnee-Ebene auf der Karte“.

### Task 7: Suchindex und Kartensuche

**Files:**
- Modify: `tools/osm-lib.mjs` (`buildSearchIndex`), `tools/osm-daten.mjs` (schreibt `data/skitouren/search.json` nach den Teildateien)
- Create: `data/skitouren/search.json` (einmal lokal aus den vorhandenen Teildateien, Step 2)
- Modify: `index.html` — Suchfeld auf der Karte, `geocode`, Trefferliste.
- Test: `tools/app-pure.test.mjs` (Review Focus 4).

**Interfaces:**
- Consumes: `searchTours` (Task 1), `loadParts("routes", bbox)`, `findRoute(osm)`, `openPeek("route", feature)` (Task 4), Karte `flyTo`.
- Produces:
  - `data/skitouren/search.json`: Array `{ n: name, p: peak, o: osm, x: lon, y: lat, b: band }`, nur vorschlagbare Touren (gleiche Regel wie in der App: `st.asc >= 200 && st.len >= 1000`), `x`/`y` = Gipfelpunkt `st.tlon/st.tlat` auf 5 Stellen.
  - `buildSearchIndex(feats) -> entries[]` exportiert aus `tools/osm-lib.mjs` (rein, getestet) und von `osm-daten.mjs` benutzt.
  - `geocode(q: string) -> Promise<{name, admin, country, lat, lon, elev}[]>` über `https://geocoding-api.open-meteo.com/v1/search?name=…&count=8&language=de&format=json`. Wird von Task 8 wiederverwendet.
  - Suchfeld: Lupenknopf oben links auf der Karte (`#m-search-btn`), klappt `#m-search` auf (Eingabe + Liste). Eingabe mit 300 ms Verzögerung.
  - Gruppen:
    - „Touren“: `searchTours`, höchstens 8.
    - „Gipfel“: eindeutige `p` aus denselben Treffern, höchstens 5.
    - „Orte“: `geocode`, höchstens 5.
  - Tour antippen → Karte fliegt zum Gipfel (Zoom 13), Teildatei laden, `findRoute(o)` → `openPeek("route", f)`. Gipfel → fliegt hin (Zoom 13). Ort → fliegt hin (Zoom 12).
  - Leere Ergebnisse: „Nichts gefunden“; Geocoding-Fehler: Gruppe „Orte“ zeigt „Ortssuche nicht erreichbar“, Tourentreffer bleiben.

- [ ] **Step 1: Failing test** in `tools/osm-lib.test.mjs`:

```js
test("Suchindex nur aus vorschlagbaren Touren", () => {
  const f = (osm, len, asc, name) => ({ properties: { osm, name, peak: "Gipfel " + osm, st: { len, asc, tlon: 10.123456, tlat: 47.654321 } } });
  const idx = buildSearchIndex([f("relation/1", 3000, 800, "A"), f("way/2", 500, 100, "Stück")]);
  assert.deepEqual(idx, [{ n: "A", p: "Gipfel relation/1", o: "relation/1", x: 10.12346, y: 47.65432, b: 2 }]);
});
```

- [ ] **Step 2:** `buildSearchIndex` implementieren, in `osm-daten.mjs` einbinden; den Index einmalig aus den vorhandenen `data/skitouren/skitouren-*.geojson` erzeugen (kleines Einmal-Skript im Scratchpad, das `buildSearchIndex` importiert), Größe prüfen (< 150 KB).
- [ ] **Step 3:** Tests → PASS.
- [ ] **Step 4:** Suchfeld, `geocode` und Trefferaktionen in `index.html`.
- [ ] **Step 5: Browser-Prüfung:**
  - „steinkar“ → Tour „Hintere Steinkarspitze“, antippen → Kurzinfo dieser Tour.
  - „Innsbruck“ → Ort, Karte fliegt hin.
  - „xyzxyz“ → „Nichts gefunden“.
  - Geocoding blockiert → „Ortssuche nicht erreichbar“, Tourentreffer weiter da.
- [ ] **Step 6: Commit** „0.9: Kartensuche für Touren, Gipfel und Orte“.

### Task 8: Wetter-Suche nach Ort

**Files:**
- Modify: `index.html` — Wetter-Seite (`#wx-place` Umgebung), `wxPlaces`, `renderWeather`.

**Interfaces:**
- Consumes: `geocode(q)` (Task 7), `wxPlaces()`, `state.wxPlace`, `renderWeather()`.
- Produces:
  - Suchfeld über der Ortsauswahl.
  - Gewählter Ort wird zu `{ key: "g:<lat>,<lon>", label: "<name> (<admin>), <elev> m", lat, lon, elev, group: "Zuletzt gesucht" }`.
  - Gespeichert in `lawinenapp.wxsearch.v1`, höchstens 5, neueste zuerst, ohne Dubletten.
  - `state.wxPlace` auf den neuen Schlüssel.
  - `wxPlaces()` hängt die Gruppe „Zuletzt gesucht“ an.

- [ ] **Step 1:** Implementieren.
- [ ] **Step 2: Browser-Prüfung:**
  - „Sölden“ suchen und wählen → Wetter für Sölden, Ortsauswahl zeigt es unter „Zuletzt gesucht“.
  - Neu laden → bleibt gewählt.
  - Sechs Orte suchen → nur fünf gespeichert.
  - „Mein Standort“ weiter da.
- [ ] **Step 3: Commit** „0.9: Wetter-Suche nach Ort“.

### Task 9: Höhenlinien auf der 2D-Karte

**Files:**
- Modify: `index.html` — Skript `maplibre-contour` (feste Version von unpkg, z. B. `maplibre-contour@0.0.7` oder die aktuelle mindestens zwei Wochen alte Version), Quelle aus `DEM_URL` (terrarium), Ebenen `contour-line` und `contour-label`, Chip „Höhenlinien“ im Panel, `applyMode`/`set3D`.

**Interfaces:**
- Consumes: `DEM_URL`, `applyMode()`, `set3D(on)`, `mapState.filter`, `renderMapPanel`.
- Produces:
  - `mapState.filter.contours: boolean` (Standard `true`, fehlender Schlüssel = true).
  - Linienabstände:
    - ab Zoom 11: 100 m, Hauptlinien 500 m;
    - ab Zoom 13: 50/250 m;
    - ab Zoom 14: 20/100 m.
  - Hauptlinien beschriftet (Meter).
  - Farbe aus einem neuen Token `--contour` (hell: braun gedämpft, dunkel: heller).
  - Sichtbar nur in 2D und wenn `contours` an; über der Grundkarte, unter Gefahrenzonen und Touren.
  - Auf der Grundkarte „topo“ (hat eigene Linien) ebenfalls an, aber dünner; der Builder darf sie auf „topo“ standardmäßig aus lassen, wenn es doppelt wirkt — Entscheidung im Commit begründen.

- [ ] **Step 1:** Implementieren.
- [ ] **Step 2: Browser-Prüfung** (Pane sichtbar):
  - Grundkarte Relief, Zoom 13 bei Innsbruck → Linien und Beschriftungen sichtbar.
  - Satellit → sichtbar.
  - 3D → weg.
  - Chip aus → weg.
  - Konsole ohne Fehler.
- [ ] **Step 3: Commit** „0.9: Höhenlinien auf der 2D-Karte“.

### Task 10: Gesamtprüfung und Abschluss

**Files:**
- Modify: `index.html` (Quellen-Text im Einstellungsblatt: Open-Meteo Geocoding, maplibre-contour)

- [ ] **Step 1:** Quellen-Text ergänzen.
- [ ] **Step 2:** `node --test "tools/*.test.mjs"` → alle PASS.
- [ ] **Step 3: Gesamtdurchlauf** im Browser bei Handybreite mit leerem Speicher:
  - Lage mit Powderalert → Wisch zur Karte → Suche „steinkar“ → Kurzinfo → Lage → Wetter mit 7 Tagen → Höhenlinien sichtbar → Wisch auf Tab-Leiste zu Touren → „Lage prüfen“ → Wetter-Seite Ortssuche.
  - Konsole ohne Fehler außer den bekannten 404 der Lageberichte außerhalb der Saison.
- [ ] **Step 4: Commit** „0.9: Quellen, Gesamtprüfung“.

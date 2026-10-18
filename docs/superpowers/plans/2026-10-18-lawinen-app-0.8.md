# Lawinen-App 0.8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version 0.8 der Lawinen-App: ganze Alpen, Design „Bergkarte und Wegweiser“, verbundene OSM-Touren mit mehr Filtern, zoombare Lage-Karte, einklappbare Ebenen, Wetter wie eine Wetter-App.

**Architecture:** Die App bleibt eine einzelne `index.html` ohne Build-Schritt. Reine Datenlogik der Actions wandert in `tools/osm-lib.mjs` und bekommt Tests mit `node:test`; die Skripte `tools/osm-daten.mjs` und `tools/unfaelle.mjs` bleiben die Einstiegspunkte der GitHub Actions. Oberflächenlogik wird im Browser geprüft (lokaler Server Port 8765, Handybreite 375 px, Testtag 22.02.2026 und 15.01.2026).

**Tech Stack:** HTML/CSS/JS ohne Framework, MapLibre GL JS 4.7.1, Open-Meteo, CAAMLv6 (EAWS-Spiegel), OpenStreetMap/Overpass, Node 20 (Actions) bzw. 24 (lokal) mit `node:test`, `pngjs@7.0.0`.

**Spec:** `docs/superpowers/specs/2026-10-18-lawinen-app-0.8-design.md`

## Global Constraints

- Eine `index.html`, kein Framework, kein Build-Schritt; externe Skripte nur MapLibre 4.7.1 von unpkg.
- EAWS-Stufenfarben `#ccff66 #ffff00 #ff9900 #ff0000 #a30000` und Risikofarben `#ffd400 #ff8a00 #d7263d` bleiben exakt; das Design-Orange `#e8892b` nie für Warninhalte.
- Design C: Hintergrund `#f6f1e7`, Flächen `#fffaf0`, Kontur/Schrift `#2b2a26`, Orange `#e8892b`, Wildschutz-Grün `#3f6b4a`, Konturen 1,5 px; dunkel `#1f1c18` / `#2b2722`, Orange `#f0a04b`.
- Schriften: Überschriften „Bitter“, Stufenziffern „Barlow Condensed“, Text „Atkinson Hyperlegible“ (Google Fonts).
- Datengebiet der Actions: 43,7–48,4° N, 5,0–16,5° O. Action-Timeout 60 min.
- Lageberichte: `https://static.avalanche.report/eaws_bulletins/<d>/<d>-<R>.de.json`, sonst `<d>-<R>.json`; Regionen `AT-02 AT-03 AT-04 AT-05 AT-06 AT-07 AT-08 DE-BY CH FR IT-21 IT-23 IT-25 IT-32-BZ IT-32-TN IT-34 IT-36 SI`. Bisherige drei Quellen als Rückfall.
- Vorschlagsgrenze bleibt 200 Hm und 1 km. Risikoberechnung, Unfall-Logik und Lagebericht-Darstellung unverändert.
- Alle Texte Deutsch, Stil wie bisher (kurze Sätze, keine Prozent beim Risiko).

## Review Focus

- Lange OSM-Wegketten, die über einen Grat in eine andere Route laufen: Verbinden nur bei genau zwei Enden am Punkt und gleichem oder fehlendem Namen (Test in Task 1).
- Gespeicherte Touren mit altem `fromRoute`, dessen Weg jetzt in einer verbundenen Tour steckt: Tour wird über `osm_ways` gefunden, Spur bleibt sichtbar (Test in Task 6).
- Tag ohne Lagebericht für einzelne Länder (Saisonbeginn unterschiedlich, Spiegel fehlt): übrige Regionen werden trotzdem gezeigt, Rückfall-Quellen greifen (Prüfung in Task 3).
- Französischer Bericht ohne deutsche Fassung: Original wird angezeigt mit Hinweis, kein Absturz bei fehlenden Feldern (Prüfung in Task 3).
- Standort verweigert: Entfernungsfilter und Sortierung „Entfernung“ werden ausgeblendet bzw. deaktiviert, keine Fehlermeldung in der Konsole (Prüfung in Task 6).

---

### Task 1: OSM-Touren verbinden und Gebiet auf die Alpen erweitern

**Files:**
- Create: `tools/osm-lib.mjs`
- Create: `tools/osm-lib.test.mjs`
- Modify: `tools/osm-daten.mjs` (Funktionen `simplify`, `rings`, `inShape`, `km` nach `osm-lib.mjs` verschieben und importieren; `BBOX` ändern; Teildateien schreiben)
- Modify: `.github/workflows/osm-daten.yml` (`timeout-minutes: 60`, Schritt `node --test tools/` vor dem Lauf)

**Interfaces:**
- Produces: `joinWays(ways: {id:number, tags:object, coords:[lon,lat][]}[], tolM = 25): {ids:number[], tags:object, coords:[lon,lat][]}[]` in `tools/osm-lib.mjs`.
- Produces: `bandOf(lon:number): number` = `Math.floor((lon - 5) / 2)` (Bänder zu 2° ab 5° O).
- Produces Dateien: `data/skitouren/index.json` = `{ generated, source, parts: [{ file:"skitouren-<n>.geojson", w, s, e, n, count }] }` und `data/skitouren/skitouren-<n>.geojson` (FeatureCollection). Feature-Properties wie bisher plus `osm_ways: string[]` (alle `way/<id>`), `osm` = erster Eintrag. Eine Tour kommt in das Band ihres höchsten Punkts (`st.tlon`). `data/skitouren.geojson` entfällt.
- Wildschutz analog: `data/wildschutz/index.json` + `wildschutz-<n>.geojson`, Band nach Mittelpunkt der Bounding-Box.

- [ ] **Step 1: Write the failing tests** in `tools/osm-lib.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { joinWays, bandOf } from "./osm-lib.mjs";

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
test("Bänder zu 2 Grad ab 5 Grad Ost", () => {
  assert.equal(bandOf(5.0), 0); assert.equal(bandOf(10.3), 2); assert.equal(bandOf(16.4), 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/`
Expected: FAIL, `Cannot find module ... osm-lib.mjs` bzw. `joinWays is not a function`.

- [ ] **Step 3: Implement `joinWays` and `bandOf` in `tools/osm-lib.mjs`**, verschiebe `simplify`, `rings`, `inShape`, `km` dorthin und exportiere sie. Endpunkte über ein Raster (gerundet auf 1e-4°) indizieren, Grad am Punkt zählen, nur bei Grad 2 verbinden, wiederholen bis nichts mehr verbunden wird. Tags: gemeinsame Tags, `name` vom Stück, das einen hat.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Use it in `tools/osm-daten.mjs`**: `BBOX = "43.7,5.0,48.4,16.5"`; in `routes()` die Wege ohne Relation sammeln, `joinWays` anwenden, ein Feature pro Ergebnis mit `osm: "way/"+ids[0]`, `osm_ways`; Relationen wie bisher (`osm_ways` = Mitglieder). `regionShapes()` lädt alle 18 Regionsdateien aus den Global Constraints. Teildateien schreiben, alte Einzeldateien löschen. Protokoll ergänzt `Touren vor dem Verbinden: X, danach: Y, vorschlagbar: Z`.

- [ ] **Step 6: Lauf lokal**

Run: `node tools/osm-daten.mjs` (im Hintergrund, kann 30–60 min dauern)
Expected: `data/osm-log.txt` enthält „danach“ und „vorschlagbar“ mit Z deutlich über 406; `data/skitouren/index.json` existiert, jede Teildatei unter 3 MB.

- [ ] **Step 7: Commit**

```bash
git add tools .github/workflows/osm-daten.yml data
git commit -m "Touren: OSM-Teilstücke verbinden, Gebiet Alpen, Daten in Bändern"
```

### Task 2: Unfalldaten für das Alpengebiet

**Files:**
- Modify: `tools/unfaelle.mjs:8` (`BBOX = { s: 43.7, w: 5.0, n: 48.4, e: 16.5 }`)

**Interfaces:**
- Produces: unverändertes Format von `data/unfaelle.geojson` und `data/unfaelle-text.json`.

- [ ] **Step 1: BBOX ändern, lokal laufen lassen**

Run: `node tools/unfaelle.mjs`
Expected: `data/unfaelle-log.txt` meldet mehr als 4028 Ereignisse, 0 fehlgeschlagen.

- [ ] **Step 2: Commit**

```bash
git add tools/unfaelle.mjs data/unfaelle*
git commit -m "Unfälle: Gebiet Alpen"
```

### Task 3: Lageberichte und Gebiete für die Alpen

**Files:**
- Modify: `index.html` (Konstanten `PROVIDERS`, `AREAS`, `REGION_FILES`, `STATIC_REGION_NAMES`; `loadBulletins`, `areaRegions`, `renderAreas`, `regionArea`; Settings um Favoriten)

**Interfaces:**
- Produces: `EAWS_REGIONS: {code:string, name:string, lang:"de"|"fr"}[]` (18 Einträge laut Global Constraints, `FR` mit `lang:"fr"`).
- Produces: `AREAS` neu: `{ key, name, prefix: string[], points: {lat,lon,elev,label}[], subs?: {key,name,regions:string[]}[] }`. `prefix` sind Region-ID-Präfixe (z. B. Tirol `["AT-07-"]`). `subs` für Bayern (Allgäu `DE-BY-11, DE-BY-12`), Tirol (Tannheimer Tal `AT-07-01`, Lechtal `AT-07-07, AT-07-08, AT-07-02-02`), Vorarlberg (Kleinwalsertal `AT-08-02`).
- Produces: `state.favs: string[]` (Area-Keys, Speicher `lawinenapp.favs.v1`, Standard `["bayern","vorarlberg","tirol"]`), `regionArea(id): string|null` über `prefix`.
- Produces: `state.regions.get(id).lang` (`"de"`/`"fr"`).

- [ ] **Step 1: Loader** `loadBulletins(date)` lädt je Region aus `EAWS_REGIONS` zuerst `.de.json`, dann `.json`; bei Fehler für `DE-BY`, `AT-08`, `AT-07`/`IT-32-BZ`/`IT-32-TN` die bisherigen Quellen. Für heute/morgen wie bisher bis zwei Tage zurück. `state.fetched` je Region.
- [ ] **Step 2: Lage-Liste**: „Meine Gebiete“ oben, „Weitere Gebiete“ als `details`, Stern-Knopf je Zeile schaltet Favorit. Status-Zeile fasst zusammen („18 Regionen, 3 ohne Bericht“).
- [ ] **Step 3: Französisch**: Im Bulletin-Detail bei `lang === "fr"` Hinweis „Lagebericht nur auf Französisch“ oben.
- [ ] **Step 4: Prüfen im Browser** (22.02.2026): `state.regions.size` > 400, Lage-Karte färbt CH und FR ein, Stern verschiebt Gebiet nach oben und bleibt nach Neuladen; Region „FR-01“ öffnet Bericht mit Hinweis. Mit blockierter Spiegel-URL (DevTools: `fetch` für `eaws_bulletins` auf Fehler umleiten per JS-Patch) laden Bayern/Vorarlberg/Tirol über die alten Quellen.
- [ ] **Step 5: Commit** `git commit -am "Alpen: Lageberichte aller Regionen, Meine Gebiete"`

### Task 4: Lage-Karte zoombar

**Files:**
- Modify: `index.html` (`initLageMap`, CSS `.lage-hint`)

**Interfaces:**
- Consumes: `state.favs`, `AREAS` aus Task 3.
- Produces: `favBounds(): [[w,s],[e,n]]` (Bounding-Box der Regionen von „Meine Gebiete“, sonst Alpen `[[5,43.7],[16.5,48.4]]`).

- [ ] **Step 1**: `dragPan`, `scrollZoom`, `touchZoomRotate` an, `dragRotate`, `touchPitch`, Neigung aus; `minZoom 5`, `maxZoom 11`, `maxBounds [[3,42.5],[18,49.5]]`. Startausschnitt `favBounds()`, ebenso für `initMap` und `leaveRegion` auf der Seite „Karte“. Knopf „Gesamtansicht“ oben rechts, setzt auf `favBounds()`. Der `ResizeObserver` darf nicht mehr bei jedem Resize zurücksetzen (nur beim ersten Mal).
- [ ] **Step 2: Prüfen**: echter Zwei-Finger-Zoom nicht simulierbar; mit Mausrad und Ziehen zoomen/verschieben, Tippen öffnet Lagebericht, Seite lässt sich außerhalb der Karte scrollen, „Gesamtansicht“ setzt zurück.
- [ ] **Step 3: Commit** `git commit -am "Lage-Karte zoombar"`

### Task 5: Ebenen einklappbar

**Files:**
- Modify: `index.html` (HTML `.map-bar`, `renderQuick`, `renderMapPanel`, Listener `#m-layers`)

**Interfaces:**
- Produces: `mapState.panelOpen: boolean`, `toggleLayersPanel(open?: boolean): void`, `activeLayerCount(): number` (zählt `hazard, routes, acc, slope, snow, wild`).

- [ ] **Step 1**: Knopf `#m-layers` beschriftet „Ebenen · n“; Panel `#m-quick` standardmäßig versteckt, enthält die sechs Schalter und darunter „Weitere Einstellungen“ (`details`) mit dem bisherigen Inhalt von `renderMapPanel`. Tippen auf die Karte schließt das Panel. Das Blatt „Ebenen und Filter“ entfällt.
- [ ] **Step 2: Prüfen** (Handybreite): Panel zu beim Öffnen der Karte, Zähler stimmt nach Umschalten, Karte frei sichtbar.
- [ ] **Step 3: Commit** `git commit -am "Karte: Ebenen einklappbar"`

### Task 6: Tourensuche mit mehr Touren und Filtern

**Files:**
- Modify: `index.html` (`ROUTES_URL`, `loadRoutes`, `ensureLayerData`, `tourGeom`, `renderFinder`, `fetchRouteSnow`, `routeCard`, `routePanel`, Finder-HTML)

**Interfaces:**
- Consumes: `data/skitouren/index.json` und Teile aus Task 1; `AREAS`, `state.favs`, `regionArea` aus Task 3.
- Produces: `loadRouteParts(bbox?: [[w,s],[e,n]]): Promise<FeatureCollection>` (lädt nur Teile, die die Box schneiden; ohne Box alle Teile von „Meine Gebiete“), `findRoute(osmId: string): Feature|null` (sucht `osm` und `osm_ways`), `avLink(p): string`.
- Produces: `finder` erweitert um `q, ascMin, ascMax, steep, topMin, diff: string[], avoidAsp: string[], riskMax: 0|1|2, snowMin, distMax, sort: "snow"|"risk"|"asc"|"dist"|"name"`; Speicher `lawinenapp.finder.v2`.

- [ ] **Step 1**: Laden in Teilen, für Touren und Wildschutz (`data/wildschutz/index.json`); Karte lädt Teile beim Bewegen (`moveend`) nach. `tourGeom` und `toursGeoJSON` nutzen `findRoute`. `finder.area` kennt zusätzlich `"fav"` (Meine Gebiete, Standard) und alle Area-Keys aus Task 3.
- [ ] **Step 2**: Filterbereich (aufklappbar) mit allen Filtern aus der Spec, Chips mit aktiven Filtern oben, „Zurücksetzen“. „Entfernung“ fragt den Standort erst beim Einschalten; bei Ablehnung Filter und Sortierung deaktiviert mit kurzem Hinweis.
- [ ] **Step 3**: Neuschnee für alle nach den übrigen Filtern verbleibenden Touren in Paketen zu 50.
- [ ] **Step 4**: `avLink(p)` = `https://www.alpenvereinaktiv.com/de/suche/?q=` + Gipfel oder Name (URL-kodiert); Knopf „Bei alpenvereinaktiv ansehen“ in Routenkarte und Routenblatt.
- [ ] **Step 5: Prüfen** (15.01.2026, Tirol): Anzahl Vorschläge höher als in 0.7.1 (dort 58), jeder Filter verringert/ändert die Liste, Chips stimmen, Zurücksetzen. Alte gespeicherte Tour mit `fromRoute` eines inneren Wegs zeigt weiter ihre Spur (im Browser per `state.tours.push({...fromRoute:"way/<id aus osm_ways[1]>"})` prüfen). Standort verweigert: keine Konsolenfehler.
- [ ] **Step 6: Commit** `git commit -am "Tourensuche: mehr Touren, neue Filter, alpenvereinaktiv"`

### Task 7: Design „Bergkarte und Wegweiser“

**Files:**
- Modify: `index.html` (CSS-Variablen `:root` und Dunkelmodus, Font-Link, Komponenten-Styles: `.panel`, `.btn`, `.tour`, `.area-row`, `.sheet`, `nav.tabbar`, `.qchip`, Kartensteuerung)

**Interfaces:**
- Consumes: nur CSS; keine JS-Schnittstellen.

- [ ] **Step 1**: Farbtokens und Schriften laut Global Constraints; Schatten durch 1,5-px-Konturen ersetzen; Tab-Leiste dunkel mit orangem aktivem Tab; Überschriften Bitter.
- [ ] **Step 2: Prüfen**: alle vier Seiten und Blätter hell und dunkel (`resize_window colorScheme`), Warnfarben unverändert (Stichprobe `getComputedStyle` der Stufe-3-Fläche = `rgb(255, 153, 0)`), Kontrast Text/Hintergrund ≥ 4,5:1.
- [ ] **Step 3: Commit** `git commit -am "Design Bergkarte und Wegweiser"`

### Task 8: Wetter wie eine Wetter-App

**Files:**
- Modify: `index.html` (`forecastView`, `renderWeather`, `wxPlaces`, CSS `.wx*`)

**Interfaces:**
- Consumes: `forecastFor(p, date)`, `wxHints(w)`, `dayForecast(w, day)` (bestehend).
- Produces: `wxHero(w, date): Element`, `wxHours(w, date): Element`, `wxWeek(w): Element`, `wxTiles(w, day): Element`.

- [ ] **Step 1**: Große Karte (Ort, Emoji, Temperatur „aktuell“ = laufende Stunde bzw. 12 Uhr, Hoch/Tief, Kurztext), Hintergrundverlauf je Lage (klar, bewölkt, Schnee, Nacht); Lawinen-Hinweise direkt darunter; Stundenleiste 24 h zum Wischen ab jetzt bzw. 6 Uhr; 7 Tage mit Temperaturbalken über die Wochenspanne; Kacheln Neuschnee 24 h / 3 Tage, Wind, Nullgradgrenze, Sonnenstunden (`sunshine_duration` in `DAILY_FC` ergänzen), Bewölkung. Orte: je Gebiet die `points` aus `AREAS`, eigene Touren, „Mein Standort“.
- [ ] **Step 2: Prüfen**: heute, 18.02.2026, eine eigene Tour, Handybreite ohne seitliches Scrollen der Seite.
- [ ] **Step 3: Commit** `git commit -am "Wetter wie eine Wetter-App"`

### Task 9: Abschluss

**Files:**
- Modify: `index.html` (`VERSION = "0.8"`, Text „Version 0.8.“, Quellenhinweis EAWS-Spiegel), Obsidian-Notiz `Projekt - Lawinen-App.md`

- [ ] **Step 1**: Gesamtprüfung nach den Abnahmekriterien der Spec im Browser, Konsole ohne Fehler.
- [ ] **Step 2**: `git pull --ff-only`, Commit, `git push`; Live-Seite prüfen; Actions „OSM-Daten aktualisieren“ und „Unfalldaten aktualisieren“ starten über Push der Skripte, Ergebnis im Protokoll prüfen.
- [ ] **Step 3**: Abschnitt „Version 0.8“ in der Projektnotiz, offene Punkte (iPhone-Test).

# Lawinen-App 0.8: ganze Alpen, Design „Bergkarte“, mehr Touren, Wetter-App, bessere Karten

Stand: 2026-10-18. Grundlage: Version 0.7.1 (`index.html`, eine Datei, GitHub Pages), Projektnotiz in Obsidian.

## Warum

Nach dem iPhone-Test von 0.7.1: Die App funktioniert, wirkt aber nüchtern, die Tourenauswahl ist zu klein, die Lage-Karte lässt sich nicht zoomen, die Filterleiste auf der Karte nimmt dauerhaft Platz weg, und das Wetter sieht nicht aus wie in einer modernen Wetter-App. Ziel ist eine App, die der Nutzer gern öffnet, in der er schnell passende Touren findet und die Karte frei hat.

## Ziele

1. **Lage-Karte zoombar:** mit zwei Fingern zoomen, mit einem Finger verschieben, Antippen öffnet wie bisher den Lagebericht. Knopf „Gesamtansicht“ setzt zurück.
2. **Filter auf der Karte einklappbar:** Oben bleiben Regionsauswahl, 2D/3D und ein Knopf „Ebenen · n“ (n = Zahl der eingeschalteten Ebenen). Antippen klappt die Ebenen-Schalter auf, nochmal Antippen zu. Die bisherigen Inhalte von „Mehr“ (Grundkarte, Steilheit, Exposition, Höhe, Zeitraum der Unfälle) liegen im aufgeklappten Bereich unter „Weitere Einstellungen“.
3. **Design „Bergkarte und Wegweiser“ (Richtung C, vom Nutzer gewählt):** warme Papiertöne, kräftige dunkle Konturen statt weicher Schatten, Orange wie auf Bergwegweisern für Knöpfe und aktive Elemente, dunkle Tab-Leiste mit orangem Akzent.
4. **Mehr Touren:** OpenStreetMap-Teilstücke werden zu ganzen Touren zusammengesetzt, damit sie nicht mehr als „zu kurz“ wegfallen. Zu jeder Tour und jedem Gipfel ein Link „Bei alpenvereinaktiv ansehen“.
5. **Mehr Filter für die Tourensuche.**
6. **Wetter wie in einer modernen Wetter-App.**

7. **Gebiet auf die ganzen Alpen erweitern** (Nutzerwunsch 2026-10-18): Lageberichte, Karte, Gefahrenzonen, Touren, Wetter und Unfälle, soweit es Daten gibt, für den ganzen Alpenbogen von Frankreich bis Slowenien.

## Alpen: Datenlage (geprüft 2026-10-18)

- **Lageberichte:** Der EAWS-Spiegel `https://static.avalanche.report/eaws_bulletins/<Datum>/<Datum>-<Region>.de.json` (sonst `.json`) liefert CAAMLv6 im bisherigen Format, CORS erlaubt. Alpenregionen: `AT-02` Kärnten, `AT-03` Niederösterreich, `AT-04` Oberösterreich, `AT-05` Salzburg, `AT-06` Steiermark, `AT-07` Tirol, `AT-08` Vorarlberg, `DE-BY`, `CH`, `FR`, `IT-21` Piemont, `IT-23` Aostatal, `IT-25` Lombardei, `IT-32-BZ` Südtirol, `IT-32-TN` Trentino, `IT-34` Venetien, `IT-36` Friaul, `SI` Slowenien. Deutsch gibt es für alle außer Frankreich (nur Französisch).
- **Gebietsumrisse:** `regions.avalanches.org` für alle diese Regionen, CORS erlaubt.
- **Touren:** OpenStreetMap hat im Alpenraum rund 4300 Skitouren-Elemente, etwa doppelt so viele wie im bisherigen Gebiet.
- **Unfälle:** LAWIS deckt Österreich, Bayern und Südtirol ab, für die Schweiz nur Einzelfälle. Für Schweiz, Frankreich und Italien außerhalb Südtirols gibt es keine offene Quelle mit Koordinaten, die die App nutzen kann.
- **Messstationen:** Die bisherigen Netze decken Österreich, Bayern, Südtirol, Trentino und Slowenien ab. Die Schweizer SLF-Stationen haben eine offene API ohne CORS; sie bleiben vorerst draußen.
- **Wetter:** Open-Meteo gilt überall.

## Nicht-Ziele

- Keine Unfalldaten für Schweiz, Frankreich und Italien außerhalb Südtirols (keine offene Quelle). Die App sagt das in diesen Gebieten deutlich.
- Keine Schweizer Messstationen in diesem Schritt.
- Keine Übersetzung der französischen Lageberichte; sie werden im Original gezeigt, mit Hinweis.
- Keine Daten von alpenvereinaktiv/Outdooractive in der App (nur API mit Partnerschaft), nur Links.
- Keine Änderung an der Risikoberechnung, an den Unfalldaten oder am Lagebericht.
- Kein Framework, kein Build-Schritt: weiter eine `index.html`, Daten per GitHub Action.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Warnfarben verlieren ihre Bedeutung: EAWS-Stufenfarben und Auslöse-Farben (gelb, orange, rot) bleiben exakt, das neue Orange des Designs darf nie wie eine Warnstufe aussehen.
- Schlechtere Lesbarkeit bei Sonne auf dem Schnee (Kontrast mindestens wie bisher).
- Die Seite scrollt nicht mehr, weil die Lage-Karte Gesten schluckt.
- Zusammengesetzte Touren, die eigentlich verschiedene Routen sind („Spaghetti“ über mehrere Gipfel).
- Die App wird spürbar langsamer auf dem iPhone.

## Entscheidungen

### Vom Nutzer entschieden
- Designrichtung C „Bergkarte und Wegweiser“.
- Lage-Karte zoombar, Filter einklappbar.
- Mehr Touren genau nach Vorschlag: Teilstücke verbinden plus alpenvereinaktiv-Link.
- Gebiet: die ganzen Alpen.
- Wetter „wie in einer modernen Wetter-App“, Touren „durch mehr Filter durchsuchbar“.

### Claudes Entscheidungen (vom Nutzer zu prüfen)
- **Alpen-Gliederung:** Statt der fünf festen Gebiete gibt es Länder bzw. Lawinenwarndienste als Gebiete: Bayern, Vorarlberg, Tirol, Salzburg, Kärnten, Steiermark, Ober- und Niederösterreich, Südtirol, Trentino, Schweiz, Frankreich, Piemont, Aostatal, Lombardei, Venetien, Friaul, Slowenien. Auf der Seite „Lage“ zeigt die Liste zuerst **„Meine Gebiete“** (anfangs Bayern, Vorarlberg, Tirol, wie bisher), alle anderen klappen unter „Weitere Gebiete“ auf; ein Stern legt fest, was zu „Meine Gebiete“ gehört. Die bisherigen Unterteilungen Allgäu, Tannheimer Tal, Kleinwalsertal, Lechtal bleiben als Schnellauswahl innerhalb von Bayern, Tirol und Vorarlberg erhalten.
- **Laden der Lageberichte:** Alle Alpenregionen über den EAWS-Spiegel, auch Bayern, Vorarlberg und Tirol (eine Quelle statt drei). Die bisherigen Quellen bleiben als Rückfall, falls der Spiegel für einen Tag fehlt. Laden parallel, die Seite zeigt Regionen, sobald sie da sind.
- **Startansicht:** Lage-Karte und Karte zeigen beim Start den Ausschnitt von „Meine Gebiete“, nicht die ganzen Alpen; zoombar auf den ganzen Alpenbogen.
- **Datengebiet der Actions:** 43,7–48,4° N, 5,0–16,5° O für Touren, Wildschutz und Unfälle. Falls die Wildschutz-Datei dadurch über 3 MB wächst, wird sie in Kacheln nach Land geteilt und nur für sichtbare Länder geladen; Touren ebenso über 3 MB. Die Action darf dafür bis zu 60 Minuten laufen.
- **Tourenvorschläge und Wetter-Orte:** Region-Auswahl wird zur Gebietsauswahl der Alpen-Gliederung, Standard „Meine Gebiete“. Wetter-Orte: je Gebiet ein bis drei bekannte Tourenorte (Claudes Auswahl), dazu eigene Touren und „Mein Standort“.
- **Französische Berichte:** Original anzeigen, Hinweis „Lagebericht nur auf Französisch“, Link zum Original.
- **Lage-Karte:** Verschieben mit einem Finger innerhalb der Karte; die Seite scrollt außerhalb der Karte. Kein Drehen und Neigen. Zoom begrenzt auf das App-Gebiet (Zoom 6 bis 11), damit man sich nicht verliert.
- **Ebenen-Knopf:** zeigt Anzahl der aktiven Ebenen; der aufgeklappte Bereich ist ein Panel unter der oberen Leiste, nicht das Blatt von unten; Karte bleibt bedienbar, Tippen auf die Karte klappt zu.
- **Schriften:** Überschriften in einer Serifenschrift (Google Fonts „Bitter“, robust und gut lesbar), große Stufenziffern weiter Barlow Condensed, Fließtext weiter Atkinson Hyperlegible.
- **Farben Design C:** Hintergrund #f6f1e7, Flächen #fffaf0, Kontur und Schrift #2b2a26, Orange #e8892b (Knöpfe, aktiver Tab), Grün #3f6b4a für Wildschutz bleibt. Konturen 1,5 px. Dunkelmodus in Brauntönen (#1f1c18 / #2b2722, Orange #f0a04b).
- **Touren verbinden (in `tools/osm-daten.mjs`):** OSM-Wege mit `piste:type=skitour`, die nicht Teil einer Relation sind, werden verbunden, wenn sich Endpunkte berühren (≤ 25 m) und an diesem Punkt nur zwei Stücke zusammenkommen. An Kreuzungen mit drei oder mehr Stücken wird nicht verbunden. Gleicher Name, falls beide einen haben, ist Pflicht. `osm` bleibt eine einzelne ID (der erste Weg) und ist weiter der Schlüssel für Auswahl und gespeicherte Touren; die übrigen Wege stehen in `osm_ways`. Gespeicherte Touren, deren `fromRoute` nach dem Verbinden nicht mehr Schlüssel ist, werden über `osm_ways` gefunden. Kennzahlen werden für die ganze Tour neu berechnet. Ergebnis im Protokoll: Zahl der Touren vorher und nachher.
- **Untergrenze für Vorschläge bleibt** 200 Hm und 1 km.
- **alpenvereinaktiv-Link:** `https://www.alpenvereinaktiv.com/de/suche/?q=<Gipfelname>&category=skitour` bzw. mit Koordinaten der Kartenausschnitt, wenn kein Gipfelname bekannt ist. Genauen Link-Aufbau beim Bauen prüfen; wenn kein Filter per URL möglich ist, reicht die Suche nach dem Gipfelnamen.
- **Filter der Tourensuche** (in einem aufklappbaren Bereich, Zusammenfassung als Chips oben, „Zurücksetzen“):
  - Textsuche nach Name oder Gipfel
  - Region (wie bisher)
  - Höhenmeter von–bis
  - Steilste Stelle bis
  - Gipfelhöhe ab
  - Schwierigkeit laut OSM (Mehrfachauswahl)
  - Steile Expositionen meiden (Mehrfachauswahl der 8 Richtungen)
  - Auslöserisiko höchstens (gering, erhöht, hoch)
  - Neuschnee ab (cm in 3 Tagen). Dafür wird der Neuschnee für alle Touren geladen, die nach den übrigen Filtern übrig sind (bisher nur für 200), in Paketen zu 50 Punkten.
  - Entfernung von meinem Standort bis (km, nur wenn der Standort freigegeben wird)
  - Schalter wie bisher: Gefahrenstellen meiden, Stufe 3 einbeziehen
  - Sortierung: Neuschnee, Auslöserisiko, Höhenmeter, Entfernung, Name
- **Wetter wie eine Wetter-App:** oben eine große Karte mit Ort, Symbol, aktueller Temperatur, Tageshöchst/-tiefstwert und Kurztext; darunter Stundenleiste zum Wischen (24 h: Symbol, Temperatur, Neuschnee); dann 7-Tage-Liste mit Temperatur-Balken (Spanne min–max über die Woche, wie iOS Wetter); dann Kacheln: Neuschnee 24 h und 3 Tage, Wind mit Richtung, Nullgradgrenze, Sonnenstunden, Bewölkung; die Lawinen-Hinweise als eigene Karte direkt unter der großen Karte. Hintergrund der großen Karte als Farbverlauf nach Wetterlage (klar, bewölkt, Schnee, Nacht). Symbole als Emoji wie bisher. „Aktuell“ heißt für heute die laufende Stunde, für andere Tage 12 Uhr des gewählten Tages; die Stundenleiste beginnt entsprechend jetzt bzw. um 6 Uhr.
- **Tests:** Browser bei Handybreite (375 px) mit echten Taps, hell und dunkel; danach Upload, iPhone-Test macht der Nutzer.

## Was dem Bauenden überlassen bleibt

- Genaues Layout, Abstände, Icons innerhalb der Richtung C.
- Wie die Filterchips der Tourensuche angeordnet werden.
- Technik der Stundenleiste und der Temperaturbalken.
- Reihenfolge der Umsetzung; Datenänderung zuerst, damit die Action neue Daten erzeugt.

## Abnahme

- Lage-Karte: zoomen, verschieben, antippen öffnet Lagebericht, Seite scrollt weiterhin.
- Karte: Filterleiste standardmäßig zu, Ebenen-Knopf zeigt Anzahl, auf/zu funktioniert.
- Design C auf allen vier Seiten und in den Blättern, Warnfarben unverändert, Dunkelmodus ok.
- Tourendaten: deutlich mehr vorschlagbare Touren als 406 (Protokoll der Action), keine offensichtlich falsch verbundenen Touren in Stichproben (5 Touren im Allgäu und Tirol ansehen).
- Tourensuche: jeder Filter wirkt, Zusammenfassung stimmt, Zurücksetzen geht.
- Wetter: große Karte, Stundenleiste, 7-Tage-Balken, Kacheln, Hinweise; funktioniert für Gebiete und eigene Touren und für vergangene Testtage.
- Alpen: Lageberichte für alle 18 Regionen werden geladen und auf der Lage-Karte eingefärbt (Testtag 22.02.2026), Gefahrenzonen und Tourenrisiko funktionieren auch in der Schweiz und Frankreich, Unfallebene zeigt in Gebieten ohne Daten einen Hinweis.
- Ladezeit auf dem Handy nicht spürbar schlechter als 0.7.1 (Lage-Seite zeigt Meine Gebiete zuerst).
- Keine Fehler in der Konsole.

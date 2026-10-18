# Lawinen-App 0.8: Design „Bergkarte“, mehr Touren, Wetter-App, bessere Karten

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

## Nicht-Ziele

- Kein größeres Gebiet: es bleibt bei Allgäu, Tannheimer Tal, Kleinwalsertal, Lechtal, Tirol (Datenabfrage weiterhin 46,6–47,85° N, 9,5–13,1° O).
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
- Mehr Touren genau nach Vorschlag: Teilstücke verbinden plus alpenvereinaktiv-Link. Gebiet bleibt.
- Wetter „wie in einer modernen Wetter-App“, Touren „durch mehr Filter durchsuchbar“.

### Claudes Entscheidungen (vom Nutzer zu prüfen)
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
- Keine Fehler in der Konsole.

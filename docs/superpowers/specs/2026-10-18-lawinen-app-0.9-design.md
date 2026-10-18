# Lawinen-App 0.9: Design

Stand 2026-10-18. Baut auf 0.8 auf (live, Branch `main`). Einzeldatei-App `index.html`, kein Build-Schritt, GitHub Pages.

## Wozu

Der Nutzer plant seine Skitouren mit der App auf dem iPhone. Mit 0.9 soll er schneller dahin kommen, wo frischer Pulver liegt, und eine Tour auf der Karte prüfen können, ohne dass ein großes Blatt sie verdeckt. Lagebericht und Tourwetter sollen von der Tour aus mit einem Tipp erreichbar sein. Die App soll sich wie eine iPhone-App bedienen lassen: wischen zwischen den Seiten, suchen auf Karte und Wetter.

## Ziele (vom Nutzer so bestätigt)

1. **Powderalert im Zahnrad:** Schalter „Powderalert an/aus“ und die cm-Schwelle in den Einstellungen (Zahnrad oben rechts, gibt es schon).
2. **Powderalert in der App:** zeigt, wo in den Alpen Neuschnee über der Schwelle liegt oder fällt, damit der Nutzer dort eine Tour planen kann.
3. **Wischen** nach links oder rechts wechselt zwischen den Seiten Lage → Karte → Touren → Wetter.
4. **Kartensuche:** ein Suchfeld auf der Karte für Touren, Gipfel und Orte.
5. **Tour antippen → kleine Kurzinfo:** zuerst nur ein kleiner Streifen unten, die Tour bleibt auf der Karte sichtbar. Inhalt: Lawinenstufe, Länge, Höhenmeter, Dauer. Erst auf Wunsch (hochziehen oder antippen) das volle Blatt.
6. **Höhenlinien auf der 2D-Karte.**
7. **Wetter-Suche nach Ort**, zusätzlich zu „Mein Standort“.
8. **„Lage prüfen“ bei einer Tour** öffnet den vollständigen Lawinenlagebericht.
9. **Wetter-Knopf bei der Tour:** Vorhersage an der Tour und die vergangenen Tage.

## Nicht-Ziele

- **Keine Push-Nachrichten in 0.9.** Der Nutzer hat sie besprochen und zurückgestellt („lassen wir das erst mal“). Zwei Wege für später: GitHub Action mit von Hand eingetragenem Empfänger (nur für ihn) oder kleiner Dienst wie Cloudflare (auch für Freunde). Nichts davon jetzt vorbereiten.
- Die 13 zurückgestellten Review-Kleinigkeiten aus 0.8 sind nicht Teil von 0.9 (stehen in der Projektnotiz). Wo der Builder ohnehin an der Stelle arbeitet, darf er sie mitnehmen.
- Kein neues Design. Design C aus 0.8 bleibt, neue Teile passen sich an (Tokens in `:root`, Dunkelmodus).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Die Kurzinfo verdeckt die Tour doch wieder.
- Wischen kollidiert mit Karte verschieben, Schiebereglern oder waagrecht scrollenden Leisten (Wetter-Stundenleiste, Filter-Chips).
- Der Powderalert suggeriert „hin da“, ohne die Lawinenstufe zu zeigen. Neuschnee erhöht die Gefahr; die Stufe steht immer daneben.
- Die App wird spürbar langsamer beim Start (z. B. weil für den Powderalert hunderte Wetterabfragen sofort laufen).

## Einschränkungen

- Nur freie Dienste ohne Schlüssel, CORS-fähig, aus dem Browser abrufbar. Externe Skripte nur von unpkg/jsDelivr/cdnjs mit fester Version.
- Muss auf dem iPhone als Home-Bildschirm-Web-App laufen (Safari, Touch).
- Bestehende Daten bleiben gültig: gespeicherte Touren, Favoriten, Finder-Einstellungen (`localStorage`-Schlüssel nicht brechen, bei Änderung migrieren).
- Open-Meteo: nicht-kommerziell, Abfragen bündeln (mehrere Koordinaten pro Abfrage), nicht ungebremst feuern.

## Wie (entschieden)

### 1. Einstellungen und Powderalert

- Im Zahnrad-Blatt (`#settings`) oben: Schalter **Powderalert an/aus** (Standard: an), darunter **Schwelle in cm** (gibt es schon als `s-thr`, Standard 20) und **Zeitraum**: „letzte 24 h“, „letzte 3 Tage“, „nächste 24 h“ (Standard: letzte 24 h). *Zeitraum: meine Ergänzung, vom Nutzer im Vorschlag gesehen und mit „stimmt so“ bestätigt.*
- **Lage-Seite:** Ist der Powderalert an, steht oben ein Kasten „Powderalert“ mit den Gebieten (alle Alpen, nicht nur Sterngebiete), in denen der Neuschnee im gewählten Zeitraum über der Schwelle liegt, sortiert nach Neuschnee. Pro Zeile: Gebiet, cm, Lawinenstufe des Tages, Knopf zu den Touren dort. Liegt nirgends genug, ein kurzer Satz („Nirgends über 20 cm in den letzten 24 h“) statt Verstecken, damit der Nutzer sieht, dass es läuft. Ist er aus, kein Kasten.
- **Karte:** Ist der Powderalert an, gibt es eine Ebene „Neuschnee“ (im Ebenen-Panel), die die Gebiete mit Neuschnee über der Schwelle einfärbt, und Touren in solchen Gebieten werden hervorgehoben.
- Die bestehende `renderPowder`-Logik (nur Sterngebiete, ein Punkt pro Gebiet) wird dadurch ersetzt.

### 2. Wischen zwischen Seiten

- Waagrechter Wisch (deutlich waagrecht, Mindestweg) auf einer Seite wechselt zur Nachbarseite in der Reihenfolge der Tab-Leiste. Am Rand passiert nichts (kein Ringlauf).
- Kein Seitenwechsel per Wisch: auf der Karte selbst, in Eingabefeldern, Schiebereglern, waagrecht scrollbaren Elementen und in offenen Blättern.
- Weil die Karten-Seite fast nur aus Karte besteht, wirkt ein Wisch **auf der Tab-Leiste** auf allen Seiten als Seitenwechsel. So kommt man auch von der Karte per Wisch weiter, ohne dass Karte verschieben gestört wird. *Meine Wahl nach Rückfrage des Prüfers.*

### 3. Kartensuche

- Suchfeld oben auf der Karte (klein, als Lupe einklappbar, passend zum eingeklappten Ebenen-Panel aus 0.8).
- Treffer in drei Gruppen: **Touren** (Name, Gipfel), **Gipfel**, **Orte**.
- Touren aus dem Gesamtbestand, nicht nur aus dem gerade geladenen Kartenausschnitt.
- Treffer antippen: Karte fliegt hin; bei einer Tour öffnet sich gleich die Kurzinfo (Punkt 4).

### 4. Kurzinfo beim Antippen einer Tour

- Gilt für OSM-Routen und eigene Touren auf der Karte.
- Unten ein niedriger Streifen (Richtwert höchstens ein Viertel der Bildschirmhöhe), die Karte rückt die Tour in den freien Bereich darüber.
- Inhalt: Name, **Lawinenstufe** des gewählten Tages in der Region der Tour, **Länge** (km), **Höhenmeter**, **Dauer** (Aufstieg).
- Hochziehen oder Antippen öffnet das volle Blatt wie bisher (`routePanel`). Wegwischen nach unten oder Tipp auf leere Karte schließt.
- Im Streifen zwei kleine Knöpfe: **Lage** (Punkt 6) und **Wetter** (Punkt 7). Im vollen Blatt dieselben beiden.

### 5. Höhenlinien

- Höhenlinien auf der 2D-Karte sichtbar, auch über den Grundkarten ohne eigene Linien (Relief, Satellit). Als eigene Ebene im Ebenen-Panel, Standard an. In 3D aus (wie bisher wegen Unruhe).

### 6. „Lage prüfen“ öffnet den vollen Lagebericht

- Überall, wo bei einer Tour „Lage prüfen“ steht (Tourenkarten, Kurzinfo, volles Blatt, Tour-Detail), ist es ein Knopf, der den vollständigen Lagebericht der Region der Tour für den gewählten Tag öffnet (bestehendes `bulletinDetail` / `regionContent`).

### 7. Tourwetter mit vergangenen Tagen

- Öffnet als **Blatt über der aktuellen Seite** (auf der Karte bleibt die Tour dahinter, Schließen führt zurück zur Kurzinfo), nicht als Wechsel auf die Wetter-Seite. Die Rückschau auf 7 Tage gibt es in 0.9 nur beim Tourwetter. *Meine Wahl nach Rückfrage des Prüfers.*
- Knopf „Wetter“ bei der Tour öffnet das Wetter am Gipfelpunkt (oder Mitte der Tour) mit Gipfelhöhe: Vorhersage im Stil der Wetter-Seite aus 0.8 und die **letzten 7 Tage** mit Neuschnee, Temperatur (min/max), Wind. *7 Tage und die drei Größen: mein Vorschlag, vom Nutzer bestätigt.*

### 8. Wetter-Suche nach Ort

- Auf der Wetter-Seite ein Suchfeld: Ort eingeben, Treffer wählen, Wetter dort. Gesuchte Orte bleiben in der Ortsauswahl (zuletzt gesucht, wenige). „Mein Standort“ bleibt.

### Version

`VERSION = "0.9"`, Abschnitt in der Obsidian-Projektnotiz nach Abschluss.

## Dem Builder überlassen

Wo nicht anders vermerkt, sind die folgenden Punkte meine Vorschläge und dürfen mit Begründung anders gelöst werden:

- **Ortssuche** (Karte und Wetter): Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`, CORS, ohne Schlüssel, liefert auch Höhe) als gemeinsame Quelle. *Meine Wahl.*
- **Tourensuche über den Gesamtbestand:** kleiner Suchindex, den die OSM-Action mit erzeugt (z. B. `data/skitouren/search.json` mit Name, Gipfel, Mittelpunkt, Band, OSM-Kennung), statt alle Bänder zu laden. *Meine Wahl.* Gipfel aus den Tourengipfeln dieses Index.
- **Höhenlinien:** aus den schon genutzten Terrain Tiles (terrarium) im Browser erzeugt, z. B. mit `maplibre-contour` (feste Version). Linienabstand nach Zoom, beschriftete Hauptlinien. *Meine Wahl.*
- **Dauer:** Alpenvereins-Faustregel für den Aufstieg: 300 Hm/h und 4 km/h waagrecht, größerer Wert plus halber kleinerer. Als „ca.“ anzeigen. *Meine Wahl.*
- **Lawinenstufe in der Kurzinfo:** höchste Stufe des Tages in der Region der Tour; wenn höhenabhängig, die Stufe für die Gipfelhöhe. *Meine Wahl.*
- **Auflösung des Powderalerts:** ein Messpunkt pro Mikroregion (Mittelpunkt, typische Tourenhöhe, z. B. 2000 m oder Gipfelhöhe der Touren dort), gebündelt abgefragt (mehrere Koordinaten pro Abfrage, wenige Abfragen), pro Tag und Datum zwischengespeichert. Die Liste fasst Mikroregionen zu den App-Gebieten zusammen. *Meine Wahl.*
- **Ladezeitpunkt des Powderalerts:** Lage ist die Startseite und der Alert ist standardmäßig an. Deshalb lädt er **nach** dem ersten Aufbau der Seite (Lageberichte und Karte zuerst), der Kasten zeigt bis dahin „Neuschnee wird geladen …“. Aus dem Tagescache sofort. *Meine Wahl nach Rückfrage des Prüfers.*
- Wisch-Erkennung, Schwellen, Animation des Seitenwechsels.
- Genaues Aussehen von Suchfeld, Kurzinfo und Powderalert-Kasten im Design C.

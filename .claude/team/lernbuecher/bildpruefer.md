# Lernbuch bildpruefer

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 5 / Testrunde 1 — Bündigkeit mit Zahlen: senkrechte Strahlen (Mitte + 4 Ecken des Sockels) gegen
  Rumpfdreiecke; Spalt > 0 = schwebt. Hüllquader in Turm-Koordinaten zeigen, ob Turmteile anschließen. Bei verdecktem
  Pane ist kein Screenshot verlässlich.
- 2026-11-15 Runde 6 — Startkamera immer mit Vordergrund-Objekt prüfen, reiner Himmel wirkt maßstablos. Zielmarker
  (rotes Auge) per Pixelzählung prüfen (0 Treffer = nicht lesbar → Mindestgröße in Pixeln, jetzt 78 rote Px). Verdecktes Pane:
  Screenshot zeigt nur ein Viertel, rAF läuft nicht → spiel.bilder(n) nutzen, Canvas-Größe per JS gegenprüfen.
- 2026-11-15 Runde 7 — Pixelstatistik nur im selben JS-Aufruf direkt nach spiel.bilder() lesen (sonst Puffer leer).
  Heller Fleck: Ausschnitt-Helligkeit gegen Gesamtbild (112 vs 72 → nach Fix 59 vs 57). Spuren-Auslauf ~1,5 s ist kein Fehler.
- 2026-11-15 Runde 8 — Streuung über labor.flak.ereignisse.detonationen je bilder(1) gegen labor.drohnen.ziele[].pos
  messen (Perzentile statt Augenmaß). Spurbreite schnell gerechnet: px = Breite·(H/2)/tan(fov/2)/Abstand. Leuchtspuren
  laufen erst im Nahbereich, vorher etwa 30 bilder laufen lassen. Überdeckung von HUD-Feldern per getBoundingClientRect.

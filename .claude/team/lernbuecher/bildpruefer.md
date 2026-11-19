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
- 2026-11-15 Runde 9 — Abstand der Detonationen längs/quer zur Drohnengeschwindigkeit zerlegen (negativ längs = Vorhalt
  fehlt). Nach Kamerawechsel bildzeit zweimal messen (erstes Bild = Kompilierzeit). FEHLER: Zielfeuer-Kugel während des
  Nahbereichs gemessen (dort bewusst klein) → falsches Muss. Messungen nach Lage trennen (ki.lage.nahbereich).
- 2026-11-16 Runde 10 — Sperrfeuer-Sättigung: Abstand zur nächsten Drohne plus Längsanteil getrennt nach
  ki.lage.nahbereich messen (fern: p50 163 m, 73 % vor der Drohne). Befehlsparameter (labor.ki.befehle[].streuKugel/
  streuTiefe) direkt lesen statt Modus aus dem HUD ableiten. Nicht unbekannte Felder als Funktion aufrufen (bricht die Messung ab).
- 2026-11-16 Runde 11 — Regler einzeln testen (standard() → setze() → bilder(300)), Pixel per gl.readPixels direkt nach
  bilder(1). Bei Umschalt-Tasten den Zustand VORHER lesen (Taste R „öffnete nicht“ = Feld war schon offen).
- 2026-11-19 Runde 12 — computer.type erzeugt im verdeckten Pane keine keydown-Ereignisse → Tastensperre in Feldern per
  dispatchEvent(KeyboardEvent, bubbles) mit Gegenprobe auf body. Streuung je Regler nur nach labor.zuruecksetzen()
  vergleichen. Testdateien, die man anlegt, im Bericht nennen (oder selbst löschen). Konsolenfehler vor dem Melden im
  Netzprotokoll zuordnen (der 400 war ein absichtlicher Test).

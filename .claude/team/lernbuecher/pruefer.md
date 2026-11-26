# Lernbuch pruefer

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 5 Zwischenstand — Einmal-Befehle nicht nur auf „einmal verbraucht“ prüfen, sondern ob die Meldung zum
  Sim-Ergebnis passt (Wrack). Kollision mit Grobtest: gilt die Lage nach dem Herausschieben auch für übersprungene Felsen?
  Stille Abbrüche (return statt throw) lassen Grafik und Sim auseinanderlaufen.
- 2026-11-15 Runde 6 — Test „verbotene APIs“ immer auf ALLE Ordner unter src/sim richten (jetzt in tests/schiffe.mjs).
  Bei Zählern prüfen, was ein „Ereignis“ ist: Splitter-Ticks je Schritt sind keine Treffer (HUD zeigt jetzt Schaden in HP).
  Ein Modul, das eine Ereignisliste leert, muss NACH dem lesenden Modul laufen.
- 2026-11-15 Runde 7 — Bei Betriebsart-Schaltern BEIDE Richtungen prüfen (übernimmt der Wechsel Richtung UND Abstand?);
  ein Sprung ist im Test unsichtbar, solange der Test den Schalter nie mitten im Lauf umlegt.
- 2026-11-15 Runde 8 — Bei Umschaltern prüfen, ob zuruecksetzen() den umgeschalteten Wert mit zurücksetzt (sonst gibt es
  nur Gleichlauf, solange der Aufrufer ihn jeden Takt neu setzt). Mindestmaße (toleranzMin) gegen Deckel (0,05·d) bei
  kleinem d gegenrechnen. Beide Befunde in derselben Runde behoben.
- 2026-11-15 Runde 9 — Kein Sprung der Kastenmitte heißt nicht kein Sprung der Rohre: Neuverteilung der Türme gesondert
  messen. Wächter, die nach einer Balance gelockert werden, an die Zahlentabelle koppeln statt an eine feste Zahl nahe null.
- 2026-11-16 Runde 10 — Neue Zustandsfelder in einem Vorrat (schirmVorrat) brauchen den Reset in zuruecksetzen(), nicht
  nur in einem „bereit“-Startblock: setzt ein anderer Pfad (feste Wand) das Flag, bleiben alte Werte stehen. Gleichlauf
  auch als Reset → Modus A → Modus B gegen eine frische Instanz prüfen. Gegenprobe: alten Stand per git archive ins Scratchpad.
- 2026-11-16 Runde 11 — Wird ein Deckel zum Regler, alle Leser des Deckels suchen: die Waffe nutzte den Reglerwert, die
  KI-Toleranz noch die Konstante. Gefährlich ist die Richtung, in der der Regler UNTER der Konstante steht.
  Bitgleichheit „ohne Regler“ gegen den alten Stand per git archive prüfen, nicht nur gegen Standardwerte im neuen Code.
- 2026-11-19 Runde 12 — Server-Middleware ohne Browser prüfen: vite.config.js ins Scratchpad kopieren (defineConfig durch
  x=>x ersetzen), Handler mit Readable-req/Fake-res aufrufen. Prüfen: Status bei kaputtem JSON/URI (400 statt 500),
  Spread-Reihenfolge (überschreibt der Body Kopf-Felder?). Schutzbedingungen mit Vorzeichen-Abkürzung (kN < 0) gegen alle
  Achsen gegenrechnen, die das Ergebnis verschieben (kG). Eigene Reset-Vergleiche: nach dem Reset denselben Plan.
- 2026-11-21 Runde 14 — Schaden über zwei Module (Angreifer meldet, Gefecht-Welt zieht ab): drei Summen vergleichen
  (Rückgabe je Takt, Zähler der Welt, Statistik des Melders) plus HP-Differenz. Wrack-Test: hp = 0 von außen, 30 s laufen.
  Im Wrack-/Halt-Zweig nach Spread-Objekten je Takt suchen — Gleichlauf-Tests sehen sie nicht.
- 2026-11-22 Runde 15 (Werft) — Eigener Test-Katalog im Test → Prüfung parallel zum Bau. Fand: Startteil hing an der
  Listenreihenfolge (nur im Fall mit zwei Wurzeln sichtbar), Rumpf mit Turmpunkt auf Turmpunkt (→ Buchse/Stecker). Lehren:
  „ungeordnete Liste“ mit allen Fehlerfällen und allen Verschiebungen prüfen; Gegenproben so wählen, dass die Prüfung
  anschlagen kann; Andock-Drehungen brauchen eine Bezugsachse. 55 Zeilen, 0,4 s.
- 2026-11-22 Runde 16 (Form-Werkstatt) — Nahtpunkte zwischen Profil-Ecken auf doppelte Punkte prüfen; Spiegelung (det −1)
  dreht die Wicklung. Sollwerte aus der exakten Formel (Prismatoid), nicht aus dem aktuellen Verhalten (Kegel-Zeile hielt
  +7 % Trapezfehler fest und wurde beim Beheben rot). 63 Zeilen, 1,2 s.
- 2026-11-26 Runde 18 (tests/ziehen.mjs) — Test gegen eine eigene Ersatz-Umsetzung im Scratchpad vorab laufen lassen →
  zeigt, dass die Prüfungen anschlagen. Bei Klemmung immer gegen das ZURÜCKGEGEBENE d prüfen, nicht gegen das gewünschte
  (eine Zeile war deshalb rot). Durchsicht: Einfang-Phase + stopPropagation gegen OrbitControls' document-Pointerup prüfen.
- 2026-11-26 Runde 19 (tests/bauteile.mjs) — Bei unbekannten Schwellen „Code vorhanden + zeigt aufs Teil“ prüfen; nach dem
  Merge zwei Fälle angepasst (Klickpunkt im Rumpf wird bewusst auf die Fläche gelegt; Schräge muss über der Schwelle liegen).
  Kopien gegen ALLE Kopien auf gleiche Lage prüfen (Befund bauteilListe).

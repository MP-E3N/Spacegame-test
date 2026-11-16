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

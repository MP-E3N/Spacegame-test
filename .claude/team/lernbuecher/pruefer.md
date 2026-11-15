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

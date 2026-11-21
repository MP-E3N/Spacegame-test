# Lernbuch spieltester

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 4 / Testrunde 1 — Verdecktes Fenster: Screenshot zweimal versuchen, Bild kann gekachelt sein (kein
  Grafikfehler). Messung über spiel.takt + Quaternion (Bug- gegen Bahnrichtung) ergibt Driftwinkel/Drehrate schnell.
  `hebel` im Befehl ist eine Hebel-BEWEGUNG. Vorsicht: Nachbrenner-Rest verfälscht spätere Tempo-Messungen (Projektleitung).
- 2026-11-21 Runde 14 — Gefecht: Live-Turmwinkel in spiel.gefecht.flak.tuerme[i], zugehöriges Modell über
  spiel.gefecht.lafetten[i].id (NICHT gleicher Index — Modell 2 ist ein schwerer Turm; falscher „dreht nicht“-Befund).
  Feuer halt: Schusszähler UND grafik.zaehler.fuellGesetzt messen, 1 s Nachlauf ist normal. bilder(6450) ≈ 2 min in ~1 s.

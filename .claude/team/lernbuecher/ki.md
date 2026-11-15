# Lernbuch ki

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 4 (Bestandsaufnahme) — Türme nur als THREE-Gruppen, Zufall nur in grafik/. Lehre: Erst Daten in die
  Sim (Montage, Feuerbereich, Zonen), dann Verhalten; Grafik liest die Montage aus der Sim, nie umgekehrt.
  Budget: dt-Deckel 0,1 s → bis 6 Takte/Bild → KI ≤ 1 ms/Takt.
- 2026-11-15 Runde 6 (Flak-Labor) — Beobachtung: Engstabstand der Drohnen 0,7 m, 8,4 Zielwechsel/Turm/min, 0 Angriffsläufe
  durch den Schirm. Ursache: reine Abstandskraft reagiert bei 250 m/s Schließtempo zu spät; Angriffsbonus kippt Ziele; Angreifer im
  Gleichtakt. Änderung: Trennung mit 3-s-Vorausschau, Wechsel erst bei 1,3× und nach 2 s, Warteschleife vor dem Anlauf.
  Messung: 79 m, 5,0/min, 41 Läufe in 5 min, 4,6 µs/Takt, Gleichlauf gleich. Lehre: Schwarm-Werte im Langlauf mit mehreren
  Startwerten messen; Lissajous-Muster brauchen ungekoppelte Phasen je Turm, sonst Linie statt Fläche.

# Lernbuch flugsystem

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 2 — Nutzer: „Bewegungstempo viel zu schnell“ (vMax 140, aVor 16). Änderung: ~40 % (vMax 60, aVor 5,
  Gieren 10°/s). Lehre: Großschiff-Tempo eher zu langsam beginnen; Raumstaub-Striche verstärken den Tempoeindruck.
- 2026-11-15 — Kamera absolut geglättet fiel bei Fahrt um v·dt·(1−k)/k zurück → Versätze relativ zum Schiff glätten.
- 2026-11-15 Runde 4 (Bestandsaufnahme) — Beobachtung: T/X gehen bei > 60 Hz verloren (Bilder ohne Sim-Schritt,
  einmal.clear). Ursache: Einmal-Befehle hängen am Bild, nicht am Sim-Takt. Lehre: Ereignisse an den Sim-Schritt binden,
  Meldungen erst nach dem Verbrauch; Kollisionsdaten (Größen, Asteroiden) gehören in src/sim/.

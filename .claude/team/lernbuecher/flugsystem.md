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
- 2026-11-15 Runde 5 — aDaempfer 6/9 verfehlte das Driftziel (21,9/70 m/s). Ursache: in voller Kurve wächst Seitendrift
  um vMax·gierMax. Änderung: 9/28. Messung: Spitze 11,7/10,7 m/s, Abbau 3,0/1,8 s. Lehre: Dämpfer-Querbeschleunigung
  ≥ vMax·Drehrate; Nachhüpf-Testfenster an den ersten Treffer binden, nicht an feste Zeiten.

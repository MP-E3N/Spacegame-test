# Lernbuch waffentechniker

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 4 (Bestandsaufnahme) — turm() fügt Rohre und Gehäuse zu einem Mesh; Turmpositionen nur in der Grafik.
  Lehre: Bei 650 m/s ≈ 11 m pro Schritt → immer Strecke gegen Kugel testen, nie Punkt. Unten montierte Türme
  (rotation.z = π) spiegeln das Vorzeichen der Seitenrichtung.
- 2026-11-15 Runde 6 (Flak-Labor) — Beobachtung: Ereignisse je Schritt gehen bei 0..6 Schritten pro Bild verloren.
  Ursache: Grafik liest nur einmal pro Bild. Änderung: grafik.nachSchritt(flak) nach jedem Sim-Schritt. Messung: 60 Schuss/s,
  0,006 ms/Schritt, Gleichlauf ok. Lehre: Ereignisse immer pro Schritt abholen; Zünder in ganzen Schritten; Annäherungszünder
  als Strecke in Relativbewegung; parallele Nachbarrohre schneiden sich bei flachem Nick. GLSL: smoothstep nie mit edge0 > edge1,
  in Shader-Kommentaren nur ASCII.
- 2026-11-15 Runde 6 (Nachauftrag) — Beobachtung: Sperrfeuer 0 Abschüsse/70 s, Zielfeuer 37. Ursache: Detonation wirkt nur
  1 Schritt, Wand in 0,4 s gequert. Änderung: Sperrgranate mit Splitterwolke (40 m, 0,7 s, 350/s), Zielgranate nur Sofortschaden 11,
  Treffer je Ziel/Schritt zusammengefasst, Nachbar-Sperre. Messung: Sperrfeuer 800 m 7, Zielfeuer 21 Abschüsse/70 s.
  Lehre: Balance nur im echten Labor (KI + Drohnen) messen; ein Hebel pro Modus statt eines globalen Werts.

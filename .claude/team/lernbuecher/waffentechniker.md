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
- 2026-11-15 Runde 7 — Leuchtspur auf Befehl: Anteil per Zähler statt Zufall → Prüfsumme mit/ohne Spur gleich. Lehre:
  Darstellungs-Schalter nie aus dem Sim-Zufall ziehen.
- 2026-11-15 Runde 7 (Testrunde) — Weiße Glut vor der Batterie-Kamera: Blitz 4 m in 30 m ≈ 136 px bei HDR 14 → Bloom.
  Änderung: Glühen je Art in px gedeckelt (Blitz 18, Kern 300), unter 80 m gedämpft, Mündungsrauch ohne Glut. Lehre: jeder
  Effekt braucht eine Nahgrenze; Größe in Bildschirm-Pixeln denken. Wattewurst → Größe 0,6–1,3 + Zünder ±8 % (Sperr).
- 2026-11-15 Runde 8 — Beobachtung: Ohne Annäherungszünder fiel der Schirm-Durchflug von 75 auf 21 HP. Ursache: Die
  Sperr-Werte waren mit Annäherungszünder gemessen, der war der eigentliche Treffer. Änderung: Streukugel je Granate,
  Zündort mit Bruchteil des letzten Schritts, v0 je Turm, Sperr-Splitter 45 m / 0,9 s / 500 HP/s. Messung: Kugel-Median
  15,92 m (Soll 15,9), R = 0 → 0,8 m bei jeder v0-Stufe, Durchflug 46 HP. Lehre: Abgeschaltete Mechaniken auf ihren
  Balance-Anteil prüfen. Ganze Schritte reichen für den Zähler, für den Ort nicht. Umschaltwerte in zuruecksetzen() mitnehmen.
- 2026-11-15 Runde 9 — Effekt-Ring mit gemischten Lebensdauern (kurz/lang) ersetzt schon bei halb vollem Vorrat lebende
  Wolken → nächster freier Platz ab dem Zeiger + Zähler ueberschrieben (277 → 0 in 120 s). Verzögerte Effekte über
  negatives Alter, alle Schleifen müssen a < 0 überspringen.

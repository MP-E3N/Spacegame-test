# Entscheidungen

## E-001 Technik wie Probefahrt: Three.js + Vite, alles aus Code (2026-11-15)
- **Gewählt:** Three.js r187 (WebGL) + Vite 8, Grafik komplett aus Code (Geometrie, Canvas-Texturen, Shader).
- **Warum:** in Probefahrt bewährt (Fahrdemo, Fotolook), läuft im Browser per Link — wichtig für 4 Spieler ohne
  Installation. KI kann alles lesen und ändern, weil alles Text ist.
- **Keine Physik-Bibliothek (Rapier) fürs Erste:** ein Raumschiff braucht nur Trägheit und Drehung (eigene ~100 Zeilen
  in `src/sim/schiff.js`). Kollisionen/Treffer kommen später; dann neu entscheiden (eigene Kugel-Tests reichen vermutlich).
- **Alternativen:** Unity/Unreal (schöner, aber groß, Editor-lastig, schwer für KI, kein Browser-Koop per Link),
  Godot (später möglich).

## E-002 Simulation getrennt, deterministisch (2026-11-15)
- `src/sim/` kennt keine Grafik, kein DOM, kein `Math.random`; fester Schritt 1/60 s.
- **Warum:** Koop — die Simulation soll später auf einem Host/Server laufen; Stationen schicken nur Befehle.
  `npm test` prüft Gleichlauf (gleiche Befehle → bitgleicher Zustand).

## E-003 Flugmodell „schweres Kriegsschiff“ (2026-11-15)
- Schubhebel (bleibt stehen, wenn man loslässt) statt Gaspedal — passt zu einer Steuer-Station.
- Trägheitsdämpfer (T) nur für die Fahrt: an = Schiff fliegt in Bugrichtung, aus = treibt (Newton).
  Drehung ist immer gedämpft — **warum:** mit Tastatur sonst unbeherrschbar.
- Werte in `src/sim/werte.js` (vMax 140 m/s, Nachbrenner ×1,6, Gieren ~17°/s).

## E-004 Weltraum „unendlich weit“ (2026-11-15)
- Nebel, Sterne, Sonne und Planet hängen in einer Gruppe, die der Kamera folgt → keine Parallaxe, nie erreichbar.
- Raumstaub (Würfel um die Kamera, Modulo im Shader, Versatz in JS berechnet) zeigt Fahrt und Richtung.
- Asteroidenfeld vor dem Start als Bezugspunkt (noch ohne Kollision).

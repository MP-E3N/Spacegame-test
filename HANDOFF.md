# HANDOFF — Schwarmfront

> **Einstieg für die nächste Sitzung:** Diese Datei lesen, dann `CLAUDE.md` (Regeln), `PROJEKT.md` (Aufbau),
> `docs/IDEE.md` (Spielidee des Nutzers). Start: Vorschau „schwarmfront“ bzw. `npm run dev` → http://localhost:5180.

## Stand (2026-11-15, Runde 1)
Erster Prototyp aus dem Wunsch „fang an wie bei der Demo: Raum darstellen, Raumschiff mit Bewegungs-Inputs“:
- **Weltraum:** Nebel + Milchstraßenband (Shader), 14 000 Sterne, Sonne mit Bloom, Gasriese mit Tag-Nacht-Grenze,
  Raumstaub (Striche bei Fahrt), Asteroidenfeld (~180 Brocken, ohne Kollision).
- **Schiff „FK-07 Ambos“** (~150 m, eigener Entwurf, industriell, keine Fenster): Rückgrat, Bugpanzer, zwei
  Seitenrümpfe mit Kühlrippen, Kommandoblock mit Mast + Schüssel, Rohrleitungen, zufällige Aufbauten (Kisten, Lüfterblöcke), 4 Geschütztürme
  (eigene Gruppen für die spätere Waffen-Station), 4 Triebwerke mit Glut/Flamme, 12 Steuerdüsen, Positions- und
  Arbeitslichter, Beschriftung. Rumpftextur (Platten, Fugen, Nieten, Ruß, Warnstreifen) aus Canvas.
- **Steuerung:** Schubhebel, Nachbrenner, gieren/nicken/rollen, seitlich/hoch, Trägheitsdämpfer, 3 Kameras.
- **Messwerte:** 1,6 ms/Bild bei 1024×768, 95 Draw-Calls, 0,4 Mio Dreiecke (RTX 4050). `npm test`: alles ok.
- Kein Git-Commit bisher.

## Offen / nicht geprüft
- **Echtes Fluggefühl nur vom Nutzer beurteilbar** (verdecktes App-Fenster drosselt die Bildrate; geprüft wurden
  Standbilder + Messflüge).
- Name „AMBOS“ an der Rumpfseite ist aus der Verfolgersicht klein — ggf. größer/zusätzlich auf dem Bugpanzer.
- Schiff wirkt von der Seite flach und lang; Silhouette könnte mehr Höhenstufen vertragen.
- Asteroiden: Kollision fehlt (Schiff fliegt durch).

## Nächste Schritte (Vorschlag, Nutzer entscheidet)
1. Nutzer-Spieltest: Fluggefühl, Look, Werte (`src/sim/werte.js`).
2. Erster Gegner: kleines Alien-Schiff (Form + einfache Angriffs-KI), Treffer/Schaden.
3. Waffen-Station: Türme richten und feuern (Flak-Leuchtspur).
4. Zentrale/Stationen-Bildschirme und danach Koop übers Netz (Weg in `docs/IDEE.md`).

## Hinweise für die Arbeit
- Screenshots: `spiel.ansicht('heck')` friert ein; bei verdecktem Fenster Screenshot zweimal versuchen.
- `spiel.takt(n, befehl)` rechnet ohne Bild (z. B. `spiel.takt(150, {hebel:1, nachbrenner:true})`, dann `ansicht`).
- Glut/Flammen werden in `darstellen` geglättet; `ansicht` nutzt dt = 1, damit sie im Standbild sofort stimmen.

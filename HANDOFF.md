# HANDOFF — Schwarmfront

> **Einstieg für die nächste Sitzung:** Diese Datei lesen, dann `CLAUDE.md` (Regeln), `PROJEKT.md` (Aufbau),
> `docs/IDEE.md` (Spielidee des Nutzers). Repo: https://github.com/MP-E3N/Spacegame-test (Branch `main`). Start: Vorschau „schwarmfront“ bzw. `npm run dev` → http://localhost:5180.

## Stand (2026-11-15, Runde 3)
Nutzerwunsch zum Bollwerk umgesetzt: **runde Tanks hinten entfernt** (statt dessen kantige, zweistufige Rückenpanzerung
mit Turm obendrauf, Lüftergitter an den Heckflanken) und **Hangars direkt an der Hülle** (keine Ausleger mehr; Hangar-
Rümpfe liegen am Hals an, laufen hinten in die Heck-Verjüngung, Nahtleiste oben). Wirkt jetzt wie ein geschlossener Rumpf.

## Stand davor (Runde 2)
Spieltest Runde 1 → umgesetzt:
- Sterne/Sonne lagen über dem Schiff (wurden als „transparent“ nach dem Schiff ohne Tiefentest gezeichnet) → behoben.
- Raumstaub 60 % weniger (1200 statt 3000), Flugtempo auf ~40 % (vMax 60 m/s, Nachbrenner 90), Glut gedämpft.
- **Ambos-Design gesichert** (Nutzer: „hat was von einem U-Boot“): eigene Datei `src/grafik/schiff/ambos.js`,
  Git-Commit b6c7b23 (lokal, kein GitHub). Form nicht ohne Rückfrage ändern.
- **Neues Hauptschiff „BT-12 Bollwerk“** (~255 m, `src/grafik/schiff/bollwerk.js`): eigener Entwurf nach dem Muster der vom Nutzer
  gezeigten Pegasus-Blueprints (ArtStation, Robert Bonchune), bewusst abgewandelt — Meißelbug mit Stufenpanzer und
  Seitenwangen, gerippter Hals, Startdecks mit Startschächten vorn und Landedeck unten, Heckblock (Tanks in Runde 3 entfernt) und
  6 achteckigen Triebwerken im 3×2-Raster (Vorbild: 8 im Ring). Taste **V** wechselt zwischen Bollwerk und Ambos.
- Gemeinsame Bausteine jetzt in `src/grafik/schiff/bauteile.js` (loft, Aufbauten, Düsen, Türme, Effekte).
- Messwerte Bollwerk: ~2,9 ms/Bild bei 971×845, 123 Draw-Calls, 0,3 Mio Dreiecke.

## Stand davor (Runde 1)
Erster Prototyp aus dem Wunsch „fang an wie bei der Demo: Raum darstellen, Raumschiff mit Bewegungs-Inputs“:
- **Weltraum:** Nebel + Milchstraßenband (Shader), 14 000 Sterne, Sonne mit Bloom, Gasriese mit Tag-Nacht-Grenze,
  Raumstaub (Striche bei Fahrt), Asteroidenfeld (~180 Brocken, ohne Kollision).
- **Schiff „FK-07 Ambos“** (~150 m, eigener Entwurf, industriell, keine Fenster): Rückgrat, Bugpanzer, zwei
  Seitenrümpfe mit Kühlrippen, Kommandoblock mit Mast + Schüssel, Rohrleitungen, zufällige Aufbauten (Kisten, Lüfterblöcke), 4 Geschütztürme
  (eigene Gruppen für die spätere Waffen-Station), 4 Triebwerke mit Glut/Flamme, 12 Steuerdüsen, Positions- und
  Arbeitslichter, Beschriftung. Rumpftextur (Platten, Fugen, Nieten, Ruß, Warnstreifen) aus Canvas.
- **Steuerung:** Schubhebel, Nachbrenner, gieren/nicken/rollen, seitlich/hoch, Trägheitsdämpfer, 3 Kameras.
- **Messwerte:** 1,6 ms/Bild bei 1024×768, 95 Draw-Calls, 0,4 Mio Dreiecke (RTX 4050). `npm test`: alles ok.

## Offen / nicht geprüft
- **Echtes Fluggefühl nur vom Nutzer beurteilbar** (verdecktes App-Fenster drosselt die Bildrate; geprüft wurden
  Standbilder + Messflüge).
- Beim Schiffswechsel (V) ändert sich kurz die Lichtanzahl (Punktlicht im ausgeblendeten Schiff) → evtl. ein kleiner Ruckler.
- Bollwerk: Kopf wirkt in der Draufsicht etwas kurz; Feinschliff nach Nutzer-Urteil.
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

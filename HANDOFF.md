# HANDOFF — Schwarmfront

> **Einstieg für die nächste Sitzung:** Diese Datei lesen, dann `CLAUDE.md` (Regeln), `PROJEKT.md` (Aufbau +
> Schnittstellen), `docs/IDEE.md` (Spielidee), `.claude/team/TEAM.md` (Team + Testrunden-Regel).
> **Jede Runde läuft mit dem Team** nach `.claude/skills/schwarmfront-team/SKILL.md` (Nutzer hat nachgefragt, als ohne
> Team gebaut wurde). Repo: https://github.com/MP-E3N/Spacegame-test (Branch `main`, Stand gepusht).
> Start: Vorschau „schwarmfront“ bzw. `npm run dev` → http://localhost:5180 · Tests: `npm test`.

## Worum es geht
Koop-Weltraumspiel im Browser (Three.js + Vite, alles aus Code): bis zu 4 Spieler bedienen gemeinsam ein Kriegsschiff
(Stationen Steuer · Waffen · Maschine · Taktik) und halten gegen einen **Drohnenschwarm** stand. Stil industriell,
militärisch, abgenutzt, keine Fenster (angelehnt an das Gefühl von Battlestar Galactica, eigene Entwürfe).

## Neu in Runde 6 (2026-11-15): Flak-Labor — Demo ohne Schiff
Nutzerwunsch: „Flak-System wie bei Battlestar Galactica, kleine Demo ohne Schiff, nur die Kanonen und ein paar Objekte am
Himmel“. **http://localhost:5180/flak.html** (Spiel bleibt unter `/`).
- 6 Zwillings-Flaktürme auf einem Stahl-Prüfstand, 10 Zieldrohnen (Platzhalter, rotes Sensorauge) kreisen, fliegen
  Schlangenlinien und Angriffsläufe, weichen Detonationen aus, kommen 4 s nach dem Abschuss neu.
- **Sperrfeuer (1)**: Türme streichen einen Sektor ab, Zeitzünder → Wand aus Flak-Wolken in einstellbarer Entfernung
  (+/− 400–2000 m, Start 800), Splitterwolke wirkt 0,7 s nach. **Zielfeuer (2)**: KI wählt Ziele (≤ 2 Türme je Ziel), Vorhalt,
  Zünder auf den Abfangpunkt. F Schirm folgt/fest, Leertaste Feuer frei/halt, N neue Drohnen, P Pause, C Kamera Prüfstand/Übersicht, Maus/Rad.
- Sim (alle Gleichlauf-getestet): `src/sim/flaklabor.js` (Drohnen → Turm-KI → Waffen), `src/sim/waffen/{lafetten,flak}.js`,
  `src/sim/ki/{turmziel,zieldrohnen}.js`. Grafik: `src/grafik/waffen/{flakgrafik,shader}.js` (Leuchtspur, Mündungsblitz,
  Kern, Rauch mit Fake-Licht; 3 Draw-Calls). Seite: `flak.html`, `src/labor/*` (Prüfstand, Drohnen-Platzhalter, Kamera, HUD).
- Messwerte: 60 Schuss/s; Abschüsse in 70 s: Sperrfeuer 600/800/1200 m → 1/7/15, Zielfeuer 21. CPU-Bildzeit ~1 ms.
- Testhilfen (verdecktes Pane!): `spiel.bilder(n)` rechnet ganze Bilder, `spiel.kamera('batterie'|'uebersicht')`,
  `spiel.befehl`, `spiel.bildzeit(n)`, `spiel.takt(n)`.
- **Runde 7 (Nutzer-Rückmeldung zur Demo, umgesetzt):** (1) Wolken größer (42 m, Größe streut 0,6–1,3, Sperr-Zünder ±8 %
  → lockere, ~120 m tiefe Wand); (2) **Schirm folgt den Drohnen** (Taste F an/aus, Standard an): 1–2 Schirme aus der
  vorausgesagten Lage, 120 m vor der Bedrohung, Nachführen 20°/s; +/− = fester Abstand (Wand bleibt, wo sie ist);
  (3) **Leuchtspur nur im Nahbereich** (Killzone < 500 m / aus > 600 m + 0,5 s): sonst 0 Spuren, mit Eindringling alle Türme
  Spur, 2–3 nächste Türme Direktbeschuss; HUD blinkt „NAHBEREICH“; Mündungsblitz klein/orangerot, nahe der Kamera gedämpft;
  (4) **Vorstöße**: alle ~20 s fliegt eine Drohne bis ~250 m heran und zieht sich auf 1600–1900 m zurück (gepanzert im
  Vorstoß → ~50 % überleben); Kreiser „atmen“ 900 ↔ 1500 m. Labor 5 min: 61 Abschüsse, 7/14 Vorstöße überlebt,
  Nahbereich 30 % der Zeit. Protokoll `…/2026-11-15-runde7.md`.
- **Nutzer-Urteil zu Runde 7 offen.** Stellschrauben: weniger Leuchtspur → Vorstoß-Takt 25–35 s (`DROHNEN.vorstoss.takt`);
  Wand-Dichte → `FLAK.zuenderStreuSperr`, Wolkengröße in `flakgrafik.js`. Offen (Kann): Turmteile 30 Draw-Calls, Schirm
  1200 m sehr tödlich, volle HP beim Vorstoß-Start sichtbar.
- **Weg ins Spiel (nicht beauftragt):** Lafetten aus `SCHIFFSDATEN.<typ>.tuerme` ableiten (Turm-Rahmen ≠ Welt-Rahmen
  am fahrenden Schiff), Flak + Turm-KI in `welt.schritt`, Drohnen-Modell (Schiffbauer) statt Platzhalter, Schwarm-KI v1.

## Stand (2026-11-15, nach Runde 5)
- **Spielbar:** Einzelspieler-Steuer-Station. Bollwerk (Hauptschiff, ~255 m) und Ambos (~150 m, Taste V) fliegen durch
  ein Asteroidenfeld vor einem Gasriesen. Schubhebel, Nachbrenner, Trägheitsdämpfer, 3 Kameras.
- **Simulation** (`src/sim/`, grafikfrei, fester 60-Hz-Schritt, Gleichlauf getestet): Welt (Schiff → Kollision),
  Flugwerte je Schiff, Kollision mit Abprall + Rumpfschaden, Wrack bei 0 %, Schiffsdaten (Rumpf, 11 Türme mit Typ
  flak/schwer, Mündungen, Drehgrenzen, Kollisionskugeln), Asteroidenfeld, Zufall mit Startwert.
- **Grafik:** Weltraum (Nebel, 14 000 Sterne, Sonne, Gasriese, Raumstaub), zwei Schiffe aus Code mit Rumpftexturen,
  Triebwerksglut, Steuerdüsen, Positionslichtern; Türme gegliedert (Sockel → Drehkranz → Wiege → Rohre → Mündungen),
  bündig gemessen. ~2,9 ms/Bild (RTX 4050).
- **HUD:** Fahrt, Schubhebel, Dämpfer, Nachbrenner, Drift, Rumpf %; Meldungen bei Kollision/Wrack; Hilfe klappt nach 10 s ein.
- `npm test`: alles grün (Messflüge je Schiff, Kollision, Gleichlauf, Turm-Spaltmaß, Feld, Import-Regel).

## Nutzerregeln und Vorlieben
- **Mit Team arbeiten**; Testrunden max. 3 Minuten, max. 3 pro Runde, Nutzer vor/nach jeder Testrunde informieren.
- Commit lokal ok, **Push nur auf Wunsch**.
- **Ambos-Design gesichert** („hat was von einem U-Boot“): Form nicht ohne Rückfrage ändern.
- Vorbilder (z. B. Pegasus-Blueprints) **nur als Stil, nie nachbauen** — „abgewandelt, damit keine Lizenzen verletzt werden“.
- Mag kompakte, kantige, geschlossene Rümpfe; runde Anbauten (Tanks) und Ausleger mochte er nicht.
- Tempo eher langsam (Runde 1 „viel zu schnell“), Raumstaub dezent, Triebwerksglut nicht grell.

## Nutzer-Entscheidungen (Runde 4, gelten)
Türme v1 schießen **automatisch** (KI) · **Flak + schwere Geschütze** · Gegner **Robot-/Drohnenschwarm** (keine Aliens;
unbemannt, mechanisch, rotes Sensorauge) · Schaden erst nur **Gesamt-HP** · weniger Drift + Tempolimit (✅ R5) ·
Asteroiden abprallen + Schaden (✅ R5) · Ambos nur Turm-/Nummernhöhe korrigieren (✅ R5).

## Nächste Runde (Vorschlag, noch nicht beauftragt): Runde 6 — Waffen v1
- **Waffentechniker:** `src/sim/waffen/` (Turmwerte Flak/schwer, Drehen mit Grenzen, Geschoss-Pool, Treffertest Strecke
  gegen Kugel, Schaden, Feuersperre gegen eigenen Rumpf, **Zieldrohne** zum Messen), `src/grafik/waffen/` (Rohre drehen,
  Leuchtspur, Mündungsblitz, Flak-Wolke).
- **KI-Beauftragter:** `src/sim/ki/` Turm-Zielsuche (Gewichte, Verteilung höchstens 2 Türme pro Ziel, Vorhalt über
  Abfang-Gleichung, Feuerfreigabe).
- Schnittstelle (R4 abgestimmt): KI → je Turm `{ turmId, zielId, punkt (Welt, mit Vorhalt), feuer, toleranz }`;
  Waffen → `{ id, imBereich, ausgerichtet, bereit, gesperrt, v0, reichweite }` + Treffer-Ereignisse.
  Reihenfolge in `welt.schritt`: Schiff → Kollision → (Drohnen-KI) → Turm-KI → Waffen → Treffer.
- Lichtsetzer-Budget: Effekte als Vorrat + Instanzen, `depthTest` an, keine Lichter pro Treffer, ≤ +10 Draw-Calls.
- Danach **Runde 7:** Drohnen-Modell (Schiffbauer) + Schwarm-KI v1 (6 Drohnen, 2 Ketten, angekündigte Angriffe).
- Später: Stationen-Bildschirme, Koop übers Netz (Netz-Architekt), Maschinen-Station mit Teilschaden.

## Offen / nicht geprüft
- **Fluggefühl, Kollision und Türme vom Nutzer noch nicht selbst getestet** (Pane meist verdeckt → keine verlässlichen
  Sichtbilder; geprüft per Messflug und Strahltest).
- Ambos „07“ wurde zusätzlich ~3 m zur Mitte verschoben (hing über der Kante) — Nutzer informiert, keine Rückmeldung.
- Kann: Kollisions-Grobtest nutzt Lage vor dem Herausschieben (1 Schritt Überlappung möglich); Stoß ohne Drehimpuls;
  Schatten-Einrasten im Welt- statt Licht-Raum (Kantenflimmern im Flug möglich); Sonne HDR 40 > Regel 30;
  Bugturm-Sockel Bollwerk hinten 1,56 m versenkt; 404 in der Konsole (vermutlich favicon).
- Bollwerk-Kopf wirkt in der Draufsicht etwas kurz (Feinschliff nach Nutzer-Urteil).

## Hinweise für die Arbeit
- Testhilfen: `spiel.ansicht(name)` (heck, seite, oben, unten, bug, weit — friert ein), `spiel.standbildWeg()`,
  `spiel.takt(n, befehl)` (rechnet die ganze Sim-Welt), `spiel.kamera.setzeFrei(gier, nick, abstand)`,
  `spiel.waehleSchiff(i)`, `spiel.welt`, `spiel.bildzeit(n)`, `spiel.befehlErsatz = {hebel: 1, …}`.
- Verdecktes Fenster: Screenshots zweimal versuchen, Bild kann veraltet/gekachelt sein → lieber mit Zahlen prüfen.
- Doku mit Backticks **nur mit Write/Edit** schreiben (Shell-Heredoc/`node -e` verschluckt sie).
- Experten in Worktrees `../Schwarmfront-wt/<rolle>` (Branch `runde<N>/<rolle>`); Frühwarnung und Bauauftrag per
  SendMessage an denselben Agenten (Kontext bleibt).

## Verlauf
- **Runde 7** (Nutzer-Rückmeldung Flak-Labor, mit Team): große Wolken, Schirm folgt, Leuchtspur nur im Nahbereich,
  Vorstöße. Gepusht 75b6470.
- **Runde 6** (Flak-Labor, mit Team): Demo-Seite `flak.html` mit Sperr- und Zielfeuer, Zieldrohnen, Splitterwolke,
  Nachbar-Sperre. Protokoll `.claude/team/protokolle/2026-11-15-runde6.md`. Gepusht 75b6470.
- **Runde 5** (Fundament, mit Team): Sim-Welt, Schiffsdaten/Türme/Feld in der Sim, Kollision + HP, Drift/Tempo, Ambos wendiger,
  Türme gegliedert und bündig. Protokoll `.claude/team/protokolle/2026-11-15-runde5.md`. Gepusht.
- **Runde 4:** Team eingerichtet (9 Rollen, neu Waffentechniker + KI-Beauftragter), Bestandsaufnahme, Nutzer-Entscheidungen.
  Protokoll `…/2026-11-15-runde4.md`.
- **Runde 3:** Bollwerk ohne runde Hecktanks, Hangars direkt an der Hülle.
- **Runde 2:** Sterne schienen durchs Schiff (behoben), −60 % Staub, Tempo auf ~40 %; Ambos gesichert; Bollwerk nach
  Pegasus-Muster abgewandelt; V wechselt Schiff.
- **Runde 1:** Weltraum, Fregatte Ambos, Schubhebel-Flugmodell (ohne Team gebaut).

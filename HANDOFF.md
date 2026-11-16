# HANDOFF — Schwarmfront

> **Einstieg für die nächste Sitzung:** Diese Datei lesen, dann `CLAUDE.md` (Regeln), `PROJEKT.md` (Aufbau +
> Schnittstellen), `docs/IDEE.md` (Spielidee), `.claude/team/TEAM.md` (Team + Testrunden-Regel).
> **Jede Runde läuft mit dem Team** nach `.claude/skills/schwarmfront-team/SKILL.md` (Nutzer hat nachgefragt, als ohne
> Team gebaut wurde). Repo: https://github.com/MP-E3N/Spacegame-test (Branch `main`; Runde 8–10 nur lokal committet).
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
- Nutzer zu R7: „schon besser, aber …“ → **Runde 8 (umgesetzt, lokal committet, nicht gepusht):**
  (1) **Streukugel + Flächenschaden:** kein Annäherungszünder mehr (`FLAK.annaeherung = false`), jede Zielgranate fliegt
  auf einen eigenen Punkt in einer unsichtbaren Kugel um den Vorhaltepunkt (Zielfeuer 20 m, Nahbereich min(12, 0,05·d),
  `befehle[i].streuKugel`, KI entscheidet), Zeitzünder dorthin; Schaden nur als Fläche an allen Drohnen im Radius.
  Zielfeuer: Detonationen im Median 27 m von der nächsten Drohne. (2) **Mündungsgeschwindigkeit umschaltbar**
  (Taste V / Knöpfe): 620 „Film“ · 820 schwere Flak · **1000 40-mm-Flak (Standard)** · 1100 Nahbereichsabwehr — reale
  Flak 760–1150 m/s, im All ohne Abbremsen; gilt für neue Granaten (`befehl.v0` → `turm.v0`). (3) **Bedienfeld** rechts
  oben, dauerhaft, klickbar, aktive Schalter hervorgehoben (H blendet aus). (4) Leuchtspur 0,35 m / 25 m. (5) Mündungsrauch
  nur jeder 3. Schuss, klein und kurz. Labor 5 min bei 1000 m/s: Sperrfeuer 58 Abschüsse / 8 von 14 Vorstößen überlebt,
  Zielfeuer 71 / 3 von 14 (620: 41, 1100: 76). Protokoll `…/2026-11-15-runde8.md`.
- Nutzer zu R8 → **Runde 9 (umgesetzt, lokal committet, nicht gepusht):** (1) **Streukugel 60 m** im Zielfeuer
  (Waffen-Deckel 0,10·d, Nahbereich bewusst min(20, 0,06·d), damit die Leuchtspur gerade aus dem Rohr kommt) → Median
  50 m um das Ziel; **3 Zusatz-Explosionen je Detonation** (nur Grafik, versetzt 15–30 m, verzögert 0,06–0,27 s);
  (2) **Standard 1100 m/s**; (3) **Sperrkästen:** Sperrfeuer legt bis zu 3 Kästen direkt auf die Drohnengruppen
  (Größe aus der Gruppenstreuung) statt einer Wand auf festem Radius → Median 260 → 100 m. Balance 1100 m/s, 5 min:
  Sperr 60 Abschüsse / 5 von 14 Vorstößen überlebt, Ziel 44 / 5 von 14. Protokoll `…/2026-11-15-runde9.md`.
- Nutzer zu R9 („noch viel weiter streuen; in Richtung der Gefahr den Raum sättigen, wenig gezieltes Feuer“) →
  **Runde 10 (2026-11-16, umgesetzt, lokal committet, nicht gepusht):** Recherche im Protokoll (Kasten-/Tiefensperrfeuer,
  Manöverraum füllen). **Sättigungsräume:** je Drohnengruppe ein Raum in Flugrichtungs-Achsen mit **3 Tiefenlagen**
  vor / auf / hinter der Gruppe (Abstand ≥ 120 m, Vorlauf gegen Nachhinken), Lagen fest je Turm. **Streu-Ellipsoid:**
  `streuKugel` quer + neu `streuTiefe` längs über den Zünder (Deckel in `FLAK`: quer 0,10·d mit / 0,18·d ohne
  Leuchtspur, längs 0,35·d). Zielfeuer 140 m. **4 Zusatz-Explosionen** (20–60 m, mit der Streuung wachsend), Glut
  gedämpft + `KERN_BUDGET` (kein weißer Ballen). Sperrfeuer: Median 163 m, **73 % der Detonationen vor der Drohne**
  (vorher 9 %); Zielfeuer Median 110 m. Balance 1100, 3 Startwerte: Sperr 46–54 Abschüsse / 36–50 % Vorstöße überlebt,
  Ziel 31–32 / 33–43 %. Protokoll `…/2026-11-16-runde10.md`.
- **Nutzer-Urteil zu Runde 10 offen.** Offene Frage: Für eine wirklich dichte Sättigung um JEDE Drohne reichen 60 Schuss/s
  nicht (Drohnen in 7–9 Grüppchen) — Hebel wäre die Feuerrate (mehr Türme/Rohre). Station unten links verdeckt die
  linken Türme. Stellschrauben: `FLAK.sorte` (Ziel 3 HP / 42 m · 15 HP/s, Sperr 1,5 HP / 45 HP/s), `DROHNEN.vorstoss.panzer`
  0,18 (steil!), Räume in `TURMKI`. Offen (Kann): Schadensskala neu ordnen, Turmteile 30 Draw-Calls.
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
- **Runde 10** (2026-11-16, mit Team): Sättigungsfeuer — Räume mit 3 Tiefenlagen, Streu-Ellipsoid, 4 Zusatz-Explosionen,
  Glut-Budget, Balance mit 3 Startwerten. Lokal committet.
- **Runde 9** (Nutzer-Rückmeldung zu R8, mit Team): Streukugel 60 m, Zusatz-Explosionen, Standard 1100 m/s, Sperrkästen
  auf den Drohnengruppen, Balance bei 1100. Lokal committet.
- **Runde 8** (Nutzer-Rückmeldung zu R7, mit Team): Streukugel + Flächenschaden statt Annäherungszünder, v0-Stufen
  620–1100 umschaltbar, Bedienfeld mit Tastenknöpfen, kleinere Leuchtspur, weniger Mündungsrauch. Lokal committet.
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

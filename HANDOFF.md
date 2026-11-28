# HANDOFF — Schwarmfront

> **Einstieg für die nächste Sitzung:** Diese Datei lesen, dann `CLAUDE.md` (Regeln), `PROJEKT.md` (Aufbau +
> Schnittstellen), `docs/IDEE.md` (Spielidee), `.claude/team/TEAM.md` (Team + Testrunden-Regel).
> **Jede Runde läuft mit dem Team** nach `.claude/skills/schwarmfront-team/SKILL.md` (Nutzer hat nachgefragt, als ohne
> Team gebaut wurde). Repo: https://github.com/MP-E3N/Spacegame-test (Branch `main`; **bis Runde 22 gepusht**, 2026-11-28).
> Start: Vorschau „schwarmfront“ bzw. `npm run dev` → http://localhost:5180 (Startmenü) · Tests: `npm test` (12 Dateien, ~80 s).

## Kurzfassung für einen frischen Chat (2026-11-28, nach Runde 22) — hier einsteigen
- **Letzter Stand:** Runden 20–22 fertig und gepusht. Kein nächster Schritt beauftragt; der Nutzer testet nach jeder
  Runde selbst und schickt dann eine **nummerierte Befundliste**. Nutzer-Urteile zu R19–R22 stehen noch aus.
- **Ideen für die nächste größere Runde (nicht beauftragt):** echtes Kanonenboot-/Drohnen-Modell + Spielziel im Gefecht
  (Wellen-Ende, Sieg/Niederlage, Punkte) · erste weitere Station fürs Koop (Waffen/Maschine/Taktik) · Geschütze an
  Seitenflächen · Gefecht-Balance für kleine eigene Schiffe (Korvetten mit 1–2 Türmen).
- **Form-Werkstatt (Menü 5) heute:**
  - **Bedienung:** Körper/Bauteil ziehen = verschieben (Körper auf der Ebene der angefassten Fläche, Raster 0,5 m, Strg
    frei; Bauteile = umsetzen, Symmetrie-Schalter gilt). Fläche länger/kürzer nur am **blauen Pfeil-Griff** in der
    Flächenmitte; in gerader Ansicht (Würfel-Fläche) Pfeile an allen von der Kante gesehenen Seiten. Zahl + Enter = genau.
  - **Kanten wie Inventor:** Leiste „◢ Fase“ (R) / „◜ Rundung“ (T) → Kanten anklicken (Umschalt = mehrere) → Maß in m →
    Enter. IDs: Längskanten `L0–L3` (Spant-Feld `ecken`), Stirnkanten `K0o…K1r` (Normprofil) bzw. `K<e>P<j>` (eigener
    Umriss), Umriss-Ecken `P<j>`; Stirnkanten über echte Spanten + Marker `kf`. Rechnung `src/sim/form/kanten.js`,
    UI `src/werkstatt/kanten.js` (Schiffbauer).
  - **Schiffsgenerator** (links oben 🎲): Klasse, Seed + Würfeln (G), Regler, ★ Favoriten — Ergebnis ist eine normale,
    flugtaugliche Form. `src/sim/form/generator.js`, GENERATOR_VERSION 2. Beispiel-Seeds: Korvette 24757/8919/40595 ·
    Fregatte 24757/16838/72271 · Träger 24757/32676/8919.
  - **🗋 Neu anfangen**, **◐ Hintergrund Weltall/Studio** (auch in der Werft; `src/menue/stimmung.js`,
    `bild.setzeStimmung`), **✈ Probeflug**, **⚔ Gefecht** (speichert und öffnet `gefecht.html?form=<Name>`).
  - Verschweißen (`src/grafik/form/schweissen.js`): bei offenen Kanten bis 3 Versuche mit anderer Zugaben-Reihenfolge
    (`spiel.info.versuche`) — Generator-Formen sind dicht (`tests/dicht.mjs`).
- **Gefechtstest (Menü 1):** oben „Schiff“-Auswahl (Bollwerk oder gespeicherte Form). Sim
  `erstelleGefecht({ typ, daten, werte })`, Rumpfsperre aus Höhenfeld (`formHoehenfeld`), Türme mit Zapfen im Material
  = `gefecht.stumm`. Neustart (N) = frische Instanz im ganzen Zustand (Koop-Grundlage).
- **Offen (Kann):** Stirnkanten-Fase nach Punkt einfügen/löschen nicht mehr als Kante bearbeitbar; Rundung als
  4-Stufen-Näherung (bis ~10 % mehr Abtrag); Verschweißen-Ausreißer bis ~270 ms (3–6 % der Formen); offen aus R18/R19:
  Geist zeigt künftige Spiegelkopie nicht, L-Düse ragt an schmalen Hecks über, Turm-Spiegelkopie kann zu dicht stehen.
- **Arbeitsweise mit dem Nutzer:** Jede Runde mit Team-Routine (`schwarmfront-team`), AUSSER er sagt „ohne Team“/„Schnellfix“.
  Testrunden ≤ 3 Min., ≤ 3 je Runde, ihm vorher/nachher einen Satz sagen. UI vor jeder Testrunde selbst mit echter Maus
  bedienen (Lehre R21/R22). Commit lokal ok, **Push nur auf ausdrücklichen Wunsch**. `konfig/formen/` und
  `konfig/schiffe/` sind ungetrackt und enthalten SEINE Entwürfe (Test1.json, Triebwerksgondel.json, Beispiel1.json) —
  nicht löschen, nicht committen; eigene Testdateien dort nach dem Test wieder entfernen. Eigene Browsertests ändern
  seinen localStorage → vorher in sessionStorage sichern, danach zurückschreiben.
- **Verdeckter Browser:** Ist der Browser-Bereich ausgeblendet, läuft requestAnimationFrame nicht → `resize_window` 1280×720,
  Kamerafahrten mit `spiel.wuerfel.schritt(performance.now() + 5000)` abschließen, `spiel.bedienung.jedesBild()` legt
  Griffe neu; Screenshots 800×450 (Faktor 0,625). Debug: `spiel.generator`, `spiel.stimmung`, `spiel.bild`, `spiel.bedienung`.
- Protokolle der letzten Runden: `.claude/team/protokolle/2026-11-26-runde20.md`, `2026-11-28-runde21.md`, `2026-11-28-runde22.md`.

## Worum es geht
Koop-Weltraumspiel im Browser (Three.js + Vite, alles aus Code): bis zu 4 Spieler bedienen gemeinsam ein Kriegsschiff
(Stationen Steuer · Waffen · Maschine · Taktik) und halten gegen einen **Drohnenschwarm** stand. Stil industriell,
militärisch, abgenutzt, keine Fenster (angelehnt an das Gefühl von Battlestar Galactica, eigene Entwürfe).

## Ansichten im Detail (gewachsen bis Runde 21 — Kurzfassung oben ist aktueller)
**Startmenü** `http://localhost:5180/` (`index.html`, `src/menue/*`): Tasten 1–5 / Pfeile + Enter / Klick; aus jeder
Ansicht Esc oder Knopf „Menü“ zurück (`src/menue/zurueck.js`).
1. **Gefechtstest** (`gefecht.html`, `src/gefecht/gefecht.js`, Sim `src/sim/gefecht.js`) — das Bollwerk fliegen
   (Steuerung wie Freiflug) und gegen Wellen von Kanonenbooten bestehen (4 → 6 → 8, Rotten zu zweit, Autokanone mit
   grüner Spur, Schaden am Rumpf). **14 Flak-Türme** (4 alte + 10 neue PDC, oben/unten; `rumpfSperre()` verhindert
   Schüsse in den eigenen Rumpf). Flak am fliegenden Schiff über `flak.setzeRahmen()`, Turm-KI im Schiffsrahmen
   (Momentaufnahme `inSchiffsrahmen`, Killzone 900/1000 m). Tasten: Leertaste Flak frei/halt · 1 Sperrfeuer · 2 Zielfeuer
   · L Leuchtspur dauerhaft · N Neustart · C Kamera · H Hilfe. Balance: ~12 Abschüsse/min, Schiff −6 … −9 % Rumpf/min.
2. **Flak-Labor** (`flak.html`, `src/labor/*`, Sim `src/sim/flaklabor.js`) — Prüfstand ohne Schiff: Bedienfeld rechts,
   **Reglerfeld** links (Taste R; Streuung, Waffen-Grenzen, Optik inkl. Füll-Flak, Explosion-Helligkeit), **Konfig unter
   Namen speichern/laden** → Datei `konfig/flak/<name>.json` (Dev-Server, `vite.config.js`). **Konfig T1 = Standard.**
3. **Freiflug** (`freiflug.html`, `src/main.js`) — Bollwerk oder Ambos (V) frei durch das Asteroidenfeld.
4. **Werft** (`werft.html`, `src/werft/werft.js`, Runde 15) — Schiffs-Baukasten mit Andockpunkten (Nutzer: „Shipbuilding-
   Editor“, nach Web-Recherche Variante „Baukasten“ gewählt). Modul links wählen → passende Punkte leuchten (blau Rumpf,
   grün Anbau, gelb Turm, durch den Rumpf sichtbar) → darüberfahren zeigt Geist (grün passt / rot Fehler) → Klick setzt.
   R drehen, T andere Seite, Klick aufs Schiff wählt, Entf löscht mit Anbauten, Strg+Z/Y, P Punkte, F Kamera. Rechts Werte,
   FLUGFÄHIG/NICHT FLUGFÄHIG, Meldungen (Klick springt zum Teil), Speichern/Laden → `konfig/schiffe/<name>.json`
   (`server/ablage.js`), Zwischenstand im localStorage. Start = Beispielschiff WS-01 (25 Module, flugfähig).
   Rechnung `src/sim/werft/zusammenbau.js` (rein), Katalog `src/sim/werft/module.js` (15 Module), Grafik
   `src/grafik/schiff/module.js` (12 Draw-Calls). Regeln E1–E9 im Protokoll `.claude/team/protokolle/2026-11-22-runde15.md`.
   Debug: `spiel.bau`, `spiel.entwurf`, `spiel.setze(modul, {nr, punkt}, punkt, dreh)`, `spiel.bildpunkt(nr)`, `spiel.ansicht([x,y,z])`.
   R16: lädt beim Start alle Formen aus `konfig/formen/` → Palette ganz oben „Eigene Formen“.
5. **Form-Werkstatt** (`werkstatt.html`, `src/werkstatt/werkstatt.js`, Runde 16) — Nutzer: „wirklich eigene Formen machen —
   Rechtecke ziehen, Trapeze ansetzen, verschweißen, Übergänge eckig → rund“. Körper aus Vorlagen (Quader, Platte, Trapez,
   Keil, Zylinder, Kegel, Rumpf eckig → rund, Rumpf-Anschluss M/L = Werft-Norm) ansetzen; Griffe W schieben / E drehen /
   S Größe (Raster 0,5 m / 15°, Strg = frei); rechts je **Spant** (Querschnitt) Breite, Höhe, Rundung, Fase, Versatz, Lage
   (Regler + Zahlenfeld; Haken „auf alle Spanten“). Plus/Minus (Minus schneidet aus, roter Geist), „gespiegelt“ (Kopie an
   x = 0), Material, Andockpunkte (+), V verschweißt/Einzelteile, Strg+Z/Y, Speichern → `konfig/formen/<name>.json`,
   „In die Werft“. Beispiele: Brückenturm, Rumpfstück rund, Triebwerksgondel.
   Daten `src/sim/form/form.js` (rein; Regeln F1–F9 im Protokoll `…/2026-11-22-runde16.md`), Grafik `src/grafik/form/*`
   (Loft, CSG mit **three-bvh-csg**, E-006), Beispiele `src/sim/form/beispiele.js`.
   Debug: `spiel.form`, `spiel.info` (ms, offeneKanten), `spiel.setze(vorlage)`, `spiel.spant(feld, wert)`, `spiel.waehle(id)`.
   **Runde 17** (2026-11-22, Schnellrunde OHNE Team auf Nutzerwunsch „keine volle Sitzung mit dem Team“):
   - **Skizze** (Taste K, `src/werkstatt/skizze.js`): Fläche auf der Ebene der aktuellen Ansicht zeichnen (Linienzug /
     Rechteck / Kreis, Raster 0,5 m, Strg frei, schließen per Klick auf Punkt 1 / Doppelklick / Enter), dann **nach hinten
     ziehen** (Maus am grünen Pfeil oder Zahl, ⇄ Richtung, Plus/Minus) → Körper `typ: skizze` mit eigenem Umriss.
   - **Punkte an Kanten** (Taste P): gelbe Punkte des aktuellen Spants ziehen (Raster 0,25 m), grünes + an jeder Kante =
     neuer Punkt (gleich weiterziehen), Rechtsklick = Punkt löschen; Quader/Trapez/Zylinder werden dabei in 4/8/32 Punkte
     umgewandelt; „Umriss zurücksetzen“. Haken „auf alle Spanten“ an = ganze Form, aus = nur dieser Querschnitt.
   - **Spiegeln** an drei Ebenen: „Spiegeln“ (verbunden, formt sich mit; x/y/z kombinierbar, M = Seite) und „Kopie“
     (eigenständiger gespiegelter Körper, `spiegelKoerper`).
   - **Ansichtswürfel** oben rechts (`src/werkstatt/ansichtswuerfel.js`, wie Inventor): Fläche/Kante/Ecke anklicken →
     Kamera fährt hin; VORNE = Bug (+Z), LINKS = Backbord (+X), OBEN mit Bug unten. ⌂ = Startansicht.
   - Daten (`form.js`): Spant `p` = Umriss relativ zu b × h, `spiegel` = Achsenliste (altes `true` = `["x"]`), neue
     Warnung `umriss_kreuzt`. Tests `tests/form.mjs` Abschnitt 8. Werte-Feld zeigt „dicht“ nach Flächenschluss (T-Stöße
     an Fläche-an-Fläche-Fugen zählt die Kantenprüfung als „offen“, die Hülle ist trotzdem dicht).
   - **Runde 17b** (Schnellfix ohne Team, Nutzer-Spieltest): Punkte **aller Spanten** an Original **und Spiegelkopien**;
     ziehen nur in **gerader Ansicht** (Würfel-Fläche; schräg = stumpfe, gesperrte Punkte). Punkte, die entlang der
     Blickachse hintereinander liegen, ziehen zusammen (3D-Prüfung, nicht Bildabstand — Perspektive). Blick längs des
     Körpers: grünes + = neuer Punkt; Blick quer: blaues + = **neuer Spant**, Ziehen längs verschiebt den ganzen Spant;
     Rechtsklick löscht Punkt bzw. (quer) Spant. **Umklappen** (an der eigenen Mitte spiegeln), **Fixieren** (Taste L,
     Körper-Feld `fest`: Griffe, Punkte, Spanten, Lage, Löschen gesperrt). **Maße oben im Bild** (Werkstatt: Form +
     gewählter Körper; Werft: Schiff). `form.js`: verschiebePunkte, fuegeSpantEin, loescheSpant, klappeKoerper.
   - **Runde 18 „Anfassen statt Einstellen“** (mit Team, nach Recherche Tinkercad/SketchUp/Shapr3D/KSP/Starfield; Protokoll
     `.claude/team/protokolle/2026-11-26-runde18.md`): Körper anklicken → **Fläche leuchtet blau → linke Maus ziehen =
     Push/Pull** (Kappe/Seite/Umriss-Kante; Maß am Mauszeiger; Raster 0,5 m, Strg frei; rastet bündig an Flächen anderer
     Körper; **Zahl tippen + Enter = genaue Zugweite**, auch direkt nach dem Loslassen). **Vorlage links → Geist liegt bündig
     auf der Fläche unter der Maus → Klick setzt** (ohne Fläche auf dem Boden). **Symmetrie-Schalter** links (Standard an:
     neue Körper bekommen die Spiegelkopie, außer sie liegen über der Mitte). **Leiste fest unten**: Ziehen (Q), Schieben (W),
     Drehen (E), Kopie, Ausschneiden, Spiegeln, Fixieren, Löschen, Mehr (Details rechts: Spanten, Punkte, Lage).
     **Rechte Maus = Kamera drehen** (links im Leeren auch). **Würfel-Fläche → Tele-Ansicht** (3° Bildwinkel, wirkt wie
     ohne Perspektive; beim Wegdrehen zurück). Rechnung `src/sim/form/ziehen.js` (Schiffbauer; Tests `tests/ziehen.mjs`,
     Prüfer), Maus/Anzeige `src/werkstatt/bedienung.js`. Debug: `spiel.bedienung`, `spiel.modus(m)`, `spiel.kamera`.
   - **Runde 19 Bauteile + Probeflug** (Team, Protokoll `…/2026-11-26-runde19.md`): links **GESCHÜTZE** (PDC 12 t, Flak-Turm
     35 t, Schwerer Turm 90 t — nur Ober-/Unterseite) und **ANTRIEBE** (Haupttriebwerk S 3,5 / M 8 / L 12,7 MN — nur Heck;
     Manöverdüsen-Block — überall). Knopf → Geist + Ring (grün/rot) → Klick setzt (bleibt im Modus, Esc beendet); rastet
     auf die Schwerpunkt-Achse (Triebwerke) bzw. x = 0 (nahe der Mitte, dann ohne Spiegelkopie). Klick auf ein Bauteil wählt
     es (Entf löscht, M spiegelt). **Marker:** gelb = Schwerpunkt, blau = Schubpunkt + Pfeil. Rechts **FLUGTAUGLICH / NICHT
     FLUGTAUGLICH**, Masse, Schub, Beschleunigung, Höchstfahrt, Wendigkeit, Prüfliste (Klick zeigt aufs Teil). **✈ Probeflug**
     speichert und öffnet `freiflug.html?form=<Name>` (nur wenn flugtauglich): eigenes Schiff mit Flugwerten, Türmen,
     Düsen-Glut, Kollisionskugeln; V wechselt zu Bollwerk/Ambos. Module: `src/sim/form/geschuetze.js` (Waffentechniker),
     `flug.js` (Flugsystem, geeicht an Bollwerk/Ambos-Bezugsformen), `kugeln.js` + `src/grafik/form/schiff.js` (Schiffbauer),
     `bauteile.js` (formZuSchiff, Projektleitung); Tests `tests/bauteile.mjs`. Debug: `spiel.pruefung`, `spiel.setzeBauteil(typ, p, n)`.
   - **Runde 20 Schiffsgenerator** (Team, Protokoll `…/2026-11-26-runde20.md`): `src/sim/form/generator.js` (Schiffbauer,
     rein: `generiere(einst)` → normalisierte Form, `KLASSEN`, `GENERATOR_REGLER` mit `text(v, einst)`, `standardEinstellung`,
     `grundmuster`, `GENERATOR_VERSION` 2; je Stufe eigener Zufallsstrom, Selbsttest, Triebwerke auf Schwerpunkt-Höhe im
     eingezogenen Antriebsblock), Seite `src/werkstatt/generator-tafel.js` (Projektleitung), Tests `tests/generator.mjs`
     (Prüfer, ~360 Formen, `GENERATOR_MODUL=<pfad>` prüft einen anderen Generator). `schweissen.js`: Spiegelkopie ohne
     Berührung = gleiche Zugabe wie Original. Werkstatt: `fokus(true)` passt die ganze Form ein, Spiegelebenen wachsen mit
     der Form. Debug: `spiel.generator.wuerfeln()`, `spiel.generator.einstellung()`.
   - Debug: `spiel.skizze` (start, zeichneDirekt(punkte, tiefe), erstellen, zustand), `spiel.wuerfel.drehNach(r)`,
     `spiel.punkte(an)`, `spiel.spantNr`, `spiel.punktBild(art, j)`, `spiel.spiegeln(achse)`, `spiel.spiegelKopie(achse)`.

**Wichtige Sim-Module:** `src/sim/waffen/flak.js` (Granaten, Streu-Ellipsoid, Flächenschaden, Montage-Rahmen, Sperren),
`src/sim/waffen/lafetten.js` (Prüfstand + `schiffsLafetten()`), `src/sim/ki/turmziel.js` (Sperrfeuer = Sättigungsräume mit
3 Tiefenlagen, Zielfeuer, Nahbereich), `src/sim/ki/angreifer.js`, `src/sim/ki/zieldrohnen.js` (Labor),
`src/sim/schiffe/*` (Schiffsdaten, Türme, `sperre.js`). Grafik: `src/grafik/waffen/flakgrafik.js`,
`angreifergeschosse.js`. Regler-Tabellen (je Besitzer, eine Quelle): `STREU_REGLER`, `WAFFEN_REGLER`, `GRAFIK_REGLER`.

**Offen / nächste Schritte (Vorschlag, nicht beauftragt):**
- **Plan nach Recherche (Nutzer 2026-11-26):** R18 Bedienung (fertig) → R19 Bauteile + Probeflug im Freiflug (fertig) →
  R20 Schiffsgenerator (fertig, Nutzer-Urteil offen). Danach kein beauftragter Schritt — Nutzer fragen.
  Offen aus R18: Geist zeigt die künftige Spiegelkopie nicht; bündig an die eigene Spiegelkopie rasten geht nicht;
  Setzen am Trefferpunkt (nicht Flächenmitte); Kamera nach dem Setzen nicht nachgeführt; Kanten-Zug im Grenzfall 0,56 ms.
- **Offen aus R19:** Gefechtstest mit eigenem Schiff (Flak braucht rumpfSperre für Formen); Geschütze an Seitenflächen
  (Sim-Turmrahmen nur oben/unten); Bauteile verschieben (heute: löschen + neu setzen); L-Düse ragt an schmalen Hecks seitlich
  über; Turm-Spiegelkopie kann zu dicht stehen (Warnung rohre_kreuzen); Fehlerfall beim Laden lässt evtl. Reste in der Szene.
- **Form-Werkstatt:** Nutzer-Urteil zu Runde 18 + 19 einholen (Push/Pull-Gefühl, Bauteile, Probeflug). Per Maus geprüft: Skizze
  zeichnen + schließen + erstellen, Punkt ziehen, + herausziehen, Rechtsklick löschen, Würfel OBEN. Ideen R17: Skizze auf
  einer Körperfläche starten (Inventor), Bögen/Kreisbogen im Linienzug, Punkte im Spant-Feld als Zahlen. Nicht per Maus
  geprüft: W schieben, S Größe ziehen.
  Ideen: Spant direkt im Bild ziehen (Griffe an den Ecken), Kantenrundung zwischen Körpern, Web Worker bei > 100 ms,
  **Funktionen** der Formen (Turm, Triebwerk, Hangar) — vom Nutzer für „später“ genannt. Konsole: three-bvh-csg meldet
  `BVH: "maxLeafSize" deprecated` je Schritt (harmlos). Gondel (28,5 m) passt an WS-01 nur anstelle der Panzerplatten.
  `konfig/schiffe/Beispiel1.json` (13:32) stammt vermutlich vom Nutzer — nicht löschen.
- **Werft:** Nutzer-Urteil einholen. Nächster Schritt wäre der **Probeflug**: gebautes Schiff im Freiflug/Gefecht fliegen
  (Flugwerte aus Masse/Schub, Kollision aus `kugeln`, Türme aus `tuerme[].lage` — Flak-Sperre `rumpfSperre` kann
  gedrehte Module noch nicht, braucht vollen Turm-Rahmen). Nicht im Bild geprüft: Neu → Kommando → Rumpf per Maus,
  Drehen per R. Andock-Marken = 2 Netze je Punkt (bei vielen freien Punkten → InstancedMesh). Mehr Module/Farben später.
- Aufräumen: alte Ordner `../Schwarmfront-wt/r14-schatten` und `r14-schiffbauer` liegen noch (Löschen im Auto-Modus
  abgelehnt — Nutzer fragen oder von Hand löschen).
- Nutzer-Urteil zum Gefechtstest einholen (Spieltester R14: „Zahlen erzählen ein Gefecht, aber man sieht noch kaum, wer
  wen beschießt“) → **Kanonenboot-Modell** (Schiffbauer) statt Drohnen-Platzhalter, ggf. Zielmarkierungen im HUD.
- Schwierigkeit/Spielziel im Gefecht (Wellen-Ende, Sieg/Niederlage, Punktestand), Angreifer als Wrack-Verhalten.
- Flak-Labor: Feuerrate als Hebel für dichtere Sättigung; Zielfeuer-Balance (getrennte Splitter fern/nah wäre Code);
  Schadensskala ordnen (1,5–5,5 HP je Granate). Station unten links verdeckt im Labor die linken Türme.
- Später: Stationen (Waffen/Maschine/Taktik), Koop übers Netz (Netz-Architekt).

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
- Nutzer zu R7: „schon besser, aber …“ → **Runde 8 (umgesetzt, gepusht e22a475):**
  (1) **Streukugel + Flächenschaden:** kein Annäherungszünder mehr (`FLAK.annaeherung = false`), jede Zielgranate fliegt
  auf einen eigenen Punkt in einer unsichtbaren Kugel um den Vorhaltepunkt (Zielfeuer 20 m, Nahbereich min(12, 0,05·d),
  `befehle[i].streuKugel`, KI entscheidet), Zeitzünder dorthin; Schaden nur als Fläche an allen Drohnen im Radius.
  Zielfeuer: Detonationen im Median 27 m von der nächsten Drohne. (2) **Mündungsgeschwindigkeit umschaltbar**
  (Taste V / Knöpfe): 620 „Film“ · 820 schwere Flak · **1000 40-mm-Flak (Standard)** · 1100 Nahbereichsabwehr — reale
  Flak 760–1150 m/s, im All ohne Abbremsen; gilt für neue Granaten (`befehl.v0` → `turm.v0`). (3) **Bedienfeld** rechts
  oben, dauerhaft, klickbar, aktive Schalter hervorgehoben (H blendet aus). (4) Leuchtspur 0,35 m / 25 m. (5) Mündungsrauch
  nur jeder 3. Schuss, klein und kurz. Labor 5 min bei 1000 m/s: Sperrfeuer 58 Abschüsse / 8 von 14 Vorstößen überlebt,
  Zielfeuer 71 / 3 von 14 (620: 41, 1100: 76). Protokoll `…/2026-11-15-runde8.md`.
- Nutzer zu R8 → **Runde 9 (umgesetzt, gepusht e22a475):** (1) **Streukugel 60 m** im Zielfeuer
  (Waffen-Deckel 0,10·d, Nahbereich bewusst min(20, 0,06·d), damit die Leuchtspur gerade aus dem Rohr kommt) → Median
  50 m um das Ziel; **3 Zusatz-Explosionen je Detonation** (nur Grafik, versetzt 15–30 m, verzögert 0,06–0,27 s);
  (2) **Standard 1100 m/s**; (3) **Sperrkästen:** Sperrfeuer legt bis zu 3 Kästen direkt auf die Drohnengruppen
  (Größe aus der Gruppenstreuung) statt einer Wand auf festem Radius → Median 260 → 100 m. Balance 1100 m/s, 5 min:
  Sperr 60 Abschüsse / 5 von 14 Vorstößen überlebt, Ziel 44 / 5 von 14. Protokoll `…/2026-11-15-runde9.md`.
- Nutzer zu R9 („noch viel weiter streuen; in Richtung der Gefahr den Raum sättigen, wenig gezieltes Feuer“) →
  **Runde 10 (2026-11-16, umgesetzt, gepusht e22a475):** Recherche im Protokoll (Kasten-/Tiefensperrfeuer,
  Manöverraum füllen). **Sättigungsräume:** je Drohnengruppe ein Raum in Flugrichtungs-Achsen mit **3 Tiefenlagen**
  vor / auf / hinter der Gruppe (Abstand ≥ 120 m, Vorlauf gegen Nachhinken), Lagen fest je Turm. **Streu-Ellipsoid:**
  `streuKugel` quer + neu `streuTiefe` längs über den Zünder (Deckel in `FLAK`: quer 0,10·d mit / 0,18·d ohne
  Leuchtspur, längs 0,35·d). Zielfeuer 140 m. **4 Zusatz-Explosionen** (20–60 m, mit der Streuung wachsend), Glut
  gedämpft + `KERN_BUDGET` (kein weißer Ballen). Sperrfeuer: Median 163 m, **73 % der Detonationen vor der Drohne**
  (vorher 9 %); Zielfeuer Median 110 m. Balance 1100, 3 Startwerte: Sperr 46–54 Abschüsse / 36–50 % Vorstöße überlebt,
  Ziel 31–32 / 33–43 %. Protokoll `…/2026-11-16-runde10.md`.
- Nutzer zu R10: „nach dem Test viel besser“ → **Runde 11 (2026-11-16, gepusht 2026-11-22): Reglerfeld**
  links oben (Taste R) mit 15 Schiebereglern zum Abstimmen + Konfig: **Streuung (Sim)** `befehl.streu` (sperrQuer,
  sperrTiefe, raumZuschlag, lagenAnteil, ziel, nahMax — Tabelle `STREU_REGLER` in turmziel.js), **Grenzen der Waffe
  (Sim)** `befehl.waffe` (deckelQuer, deckelTiefe — `WAFFEN_REGLER` in flak.js; KI-Toleranz liest dieselben Werte),
  **Optik (nur Grafik)** `grafik.regler` (fuellen = Füll-Flak, lebenFaktor, explosionDauer, rauchDeckkraft,
  rauchGroesse, zusatzAnzahl, zusatzWeite — `GRAFIK_REGLER` in flakgrafik.js; Vorrat 3072, 1024 Reserve für echte Wolken).
  Knöpfe Standard / Konfig kopieren (JSON), Werte im Browser gemerkt (`localStorage` „schwarmfront.flaklabor.konfig“).
  Ohne Regler bitgleich zu R10. Seite: `src/labor/regler.js`. Protokoll `…/2026-11-16-runde11.md`.
- Nutzer zu R11 („auf einem guten Weg“) → **Runde 12 (2026-11-19, gepusht 2026-11-22):**
  (1) **Konfig speichern unter Namen** oben im Reglerfeld → Datei **`konfig/flak/<name>.json`** über den Dev-Server
  (`vite.config.js`, `/api/flak-konfig`), Liste + Laden (inkl. v0). **Die KI liest Nutzer-Konfigs direkt aus diesem Ordner.**
  (2) **Viel weitere Streuung:** Gesamtregler **„Streuung gesamt ×“** (`faktor` 0,5–3) skaliert alle Sim-Streuungen und
  Räume; neue Standards Sperr 120/80, Zuschlag 340, Ziel 320; Waffen-Deckel 0,6/0,8 (bis 1,0/0,9), Sperr-Schutz für
  versetzte Granaten, Zenit-Bremse, Leuchtspur-Kugel ≤ 0,10·d; Zusatz-Explosionen bis 120 m (zusatzWeite 0,5–6).
  Median fern: Sperr 269 m (vorher 164), Ziel 227 m (vorher 103); faktor 3 → Sperr ~410–550 m. Balance (3 Startwerte):
  Sperr 44–45 Abschüsse / 50–64 % Vorstöße, Ziel 22–26 / 36–57 % (knapp unter Ziel, gemeinsamer Panzer 0,13).
  Protokoll `…/2026-11-19-runde12.md`.
- **Runde 13 (2026-11-21, Schnellrunde ohne Besprechung auf Nutzerwunsch, lokal committet):** „Explosionen mehr zu sehen,
  viel weniger Rauch“ → Grafik-Standards Rauch-Deckkraft 0,7 → 0,3 (Regler ab 0,05), Rauch-Lebensdauer 1 → 0,6, Glutdauer
  1 → 1,6, neuer Regler **„Explosion: Helligkeit“** (explosionHell 0,5–3, Standard 1,8; Kern-Budget 16 → 28 × hell);
  **Taste T / Knopf „Leuchtspur dauerhaft“** (grafik.regler.spurImmer, nur Optik, wird in der Konfig mitgespeichert).
  Browser: weiße Pixel 0,15 ‰, Bildzeit 0,4 ms, 68 Spuren mit T. Keine Sim-Änderung.
- **Runde 14 (2026-11-21, mit Team, gepusht 2026-11-22): Startmenü + Gefechtstest.** `index.html` = Startmenü
  (Gefechtstest · Flak-Labor · Freiflug; Freiflug jetzt `freiflug.html`; Esc = zurück). **Gefechtstest** `gefecht.html`:
  Bollwerk fliegen (Steuerung wie Freiflug), 14 Flak-Türme (10 neue PDC, ids 7–16, oben/unten; `rumpfSperre()`), Turm-KI
  im Schiffsrahmen (Killzone 900/1000), Angreifer-KI `src/sim/ki/angreifer.js` (Kanonenboote in Rotten, Wellen 4/6/8,
  Autokanone mit grüner Spur, Schaden am Rumpf). Sim-Welt `src/sim/gefecht.js` (Schiff → Angreifer → Rahmen → KI → Flak),
  Flak am Schiff über `flak.setzeRahmen()`. Konfig **T1 = Standard**, Füll-Flak nur bis 0,5 s nach dem letzten Schuss
  (kein Rauch bei Feuer halt). Tasten im Gefecht: Leertaste Flak frei/halt, 1/2 Modus, L Leuchtspur, N Neustart.
  Balance: ~12 Abschüsse/min, Schiff −6 … −9 % Rumpf/min (3 min Kurvenflug: 35 Abschüsse, −19 %). Protokoll `…/2026-11-21-runde14.md`.
  Aufräumen offen: alte Ordner `Schwarmfront-wt/r14-schiffbauer` und `r14-schatten` (gesperrt von Vite-Servern 5191–5193 eines Agenten).
- **Nächster Schritt:** Nutzer speichert seine Lieblings-Konfig → aus `konfig/flak/` lesen, als neue Standardwerte in die
  Tabellen übernehmen (STREU_REGLER, WAFFEN_REGLER, GRAFIK_REGLER), Balance nachmessen (labor8.mjs-Muster, 3 Startwerte).
  Offen: Feuerrate als Hebel für dichtere Sättigung; Station unten links verdeckt die linken Türme; Zielfeuer-Balance
  (getrennte Splitter fern/nah wäre Code); Rauch-Größe 2 = weiße Flächen. Stellschrauben: `FLAK.sorte`,
  `DROHNEN.vorstoss.panzer` 0,13 (steil!). Offen (Kann): Schadensskala, Turmteile 30 Draw-Calls.
- **Weg ins Spiel (nicht beauftragt):** Lafetten aus `SCHIFFSDATEN.<typ>.tuerme` ableiten (Turm-Rahmen ≠ Welt-Rahmen
  am fahrenden Schiff), Flak + Turm-KI in `welt.schritt`, Drohnen-Modell (Schiffbauer) statt Platzhalter, Schwarm-KI v1.

## Stand (2026-11-15, nach Runde 5) — historisch, Freiflug-Grundlage
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

## Plan aus Runde 5 (historisch — Waffen v1 ist mit Runde 6–14 umgesetzt)
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
- Testhilfen Gefecht/Labor (verdecktes Pane: requestAnimationFrame läuft nicht): `spiel.bilder(n, befehl)` rechnet ganze
  Bilder, `spiel.taste(code)`, `spiel.gefecht.zaehler`, `spiel.angreifer.welle`, `spiel.flak.tuerme[i]` (Modell dazu:
  `spiel.gefecht.lafetten[i].id`), `spiel.regler.setze/konfig/standard()` (Labor), `spiel.bildzeit(n)`.
- Bauaufträge: Skripte nur ins Scratchpad, **keine Dev-Server starten bzw. eigene Prozesse am Ende beenden**.
- Testhilfen Freiflug: `spiel.ansicht(name)` (heck, seite, oben, unten, bug, weit — friert ein), `spiel.standbildWeg()`,
  `spiel.takt(n, befehl)` (rechnet die ganze Sim-Welt), `spiel.kamera.setzeFrei(gier, nick, abstand)`,
  `spiel.waehleSchiff(i)`, `spiel.welt`, `spiel.bildzeit(n)`, `spiel.befehlErsatz = {hebel: 1, …}`.
- Verdecktes Fenster: Screenshots zweimal versuchen, Bild kann veraltet/gekachelt sein → lieber mit Zahlen prüfen.
- Doku mit Backticks **nur mit Write/Edit** schreiben (Shell-Heredoc/`node -e` verschluckt sie).
- Experten in Worktrees `../Schwarmfront-wt/<rolle>` (Branch `runde<N>/<rolle>`); Frühwarnung und Bauauftrag per
  SendMessage an denselben Agenten (Kontext bleibt).

## Verlauf
- **Runde 22** (2026-11-28, mit Team, Pflege): Stirnkanten am Umriss, dichte Träger, Neustart = frisch, Maus-Prüfung R21.
- **Runde 21** (2026-11-28, mit Team): 6 Nutzerpunkte — Punkt in Ansichten klein, Neu anfangen, Form im Gefecht, Fase/Rundung
  an Kanten + Seitenpfeile in gerader Ansicht, Verschieben per Ziehen (Push/Pull am Pfeil), Hintergrund Weltall/Studio.
- **Runde 20** (2026-11-26, mit Team): Schiffsgenerator in der Form-Werkstatt (Seed, Würfeln, 6 Regler, 3 Klassen,
  Favoriten), v2 nach Spieltest mit Klassencharakter und Seed-Grundmustern; Kamera einpassen, Spiegelebenen mitwachsend.
- **Runde 19** (2026-11-26, mit Team): Geschütze + Antriebe in der Werkstatt, Flugtauglichkeit, Probeflug im Freiflug.
- **Runde 18** (2026-11-26, mit Team): Bedienung „Anfassen statt Einstellen“ (Push/Pull, Setzen auf Flächen, Leiste).
- **Runde 15–17** (2026-11-22): Werft-Baukasten, Form-Werkstatt (CSG), Skizze/Punkte/Spiegeln/Ansichtswürfel.
- **Runde 14** (2026-11-21, mit Team): Startmenü, Gefechtstest (Bollwerk + 14 Flak-Türme gegen Angreifer-KI, Flak am
  Schiff), Konfig T1 als Standard, kein Rauch bei Feuer halt. Protokoll `…/2026-11-21-runde14.md`.
- **Runde 13** (2026-11-21, Schnellrunde ohne Team auf Nutzerwunsch): mehr Glut, weniger Rauch, Taste T Leuchtspur dauerhaft.
- **Runde 12** (2026-11-19, mit Team): Konfig speichern unter Namen (konfig/flak/), Gesamtregler Streuung ×, große
  Standards, Sperr-Schutz, Zenit-Bremse, Balance.
- **Runde 11** (2026-11-16, mit Team): Reglerfeld mit 15 Schiebereglern (Streuung, Waffen-Grenzen, Optik inkl. Füll-Flak),
  Konfig kopieren/merken. — Runde 11–14 gepusht 2026-11-22.
- **Runde 10** (2026-11-16, mit Team): Sättigungsfeuer — Räume mit 3 Tiefenlagen, Streu-Ellipsoid, 4 Zusatz-Explosionen,
  Glut-Budget, Balance mit 3 Startwerten. Gepusht e22a475 (mit R8+R9).
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

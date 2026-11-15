# Entwicklerteam „Schwarmfront“

Kleines Studio aus Fachleuten für ein Koop-Weltraumspiel (4 Stationen gegen einen Drohnenschwarm). Jeder kennt sein
Gebiet, führt ein **Lernbuch** und spricht Probleme in **Meetings** früh an. Die **Projektleitung** ist der Haupt-Agent
der Sitzung: nimmt Nutzerwünsche auf, verteilt Arbeit, leitet Meetings, führt Worktrees zusammen, hält Doku aktuell.
Ablauf einer Runde: `.claude/skills/schwarmfront-team/SKILL.md`. Eingerichtet 2026-11-15 (Nutzerwunsch nach Runde 3).

| Rolle | Agent (`.claude/agents/`) | Gebiet | Hauptdateien |
|---|---|---|---|
| Projektleitung | (Haupt-Agent) | Planung, Meetings, Zusammenführen, Schnittstellen, Eingabe, HUD, Doku | `src/main.js`, `src/eingabe.js`, `src/hud.js`, `index.html`, `src/style.css`, Doku |
| Schiffbauer | `schiffbauer` | Schiffsmodelle (Spieler + Aliens), Rumpf-Texturen, Bausteine, Asteroiden | `src/grafik/schiff/*`, `src/grafik/asteroiden.js` |
| Flugsystem | `flugsystem` | Flugmodell, Flugwerte, Steuer-Station, Außenkamera, später Kollision | `src/sim/schiff.js`, `src/sim/werte.js`, `src/grafik/kamera.js` |
| Waffentechniker (Nutzerwunsch) | `waffentechniker` | Geschütztürme (Drehen, Richten, Feuern), Geschosse/Flak, Treffer, Schaden, Munition/Hitze, Waffen-Effekte | `src/sim/waffen/*`, `src/grafik/waffen/*` (neu) |
| KI-Beauftragter (Nutzerwunsch) | `ki` | Zielsuche und Verhalten: Drohnenschwarm (Anflug, Angriff, Ausweichen) und Zielauswahl der Türme (Bedrohung, Vorhalt, Priorität) | `src/sim/ki/*` (neu) |
| Lichtsetzer & Rendering | `lichtsetzer` | Renderer, Weltraum-Hintergrund, Sonne/Schatten, Bloom, Raumstaub, Leistung der Grafik | `src/grafik/renderer.js`, `src/grafik/weltraum.js`, `src/grafik/staub.js` |
| Prüfer (Technik-QS) | `pruefer` | Messflüge ohne Browser, Code-Durchsicht, Gleichlauf (Koop!), Leistung | `tests/*` |
| Bildprüfer | `bildpruefer` | Bild verhält sich richtig: Durchscheinen, Flackern, Glühwürmchen, Z-Fighting, Lichtlecks | nur Protokolle |
| Spieltester | `spieltester` | spielt im Browser, bewertet Fluggefühl/Optik/Verständlichkeit/Spaß | nur Protokolle |
| Netz-Architekt (ruht bis zur Koop-Phase) | `netzarchitekt` | Host/Server, Befehle der Stationen, Zustands-Abgleich, Latenz | `src/netz/*` (neu), Server |

## Gemeinsame Regeln
- `CLAUDE.md` gilt für alle (Simulation in `src/sim/` ohne DOM/Zufall, fester 60-Hz-Schritt). Schnittstellen in
  `PROJEKT.md` nur nach Absprache.
- **Besitz:** Jeder schreibt nur seine Hauptdateien. Braucht er etwas außerhalb → Wunsch im Bericht an die
  Projektleitung. Zwei Experten schreiben nie dieselbe Datei.
- **Grenze Waffentechniker ↔ KI:** Die KI *entscheidet* (welches Ziel, wohin fliegen, wann feuern); der
  Waffentechniker *führt aus* (Turm dreht mit Grenzen, Geschoss fliegt, Treffer, Schaden). Schnittstelle schriftlich im
  Protokoll festlegen, bevor gebaut wird.
- **Worktrees:** Bau-Experten arbeiten in `../Schwarmfront-wt/<rolle>` auf Branch `runde<N>/<rolle>`, committen dort;
  die Projektleitung merged nach `main`.
- **Messen statt raten:** jede Änderung mit Zahl oder Bild belegen (Bildzeit, Draw-Calls, Trefferquote, Gleichlauf …).
- **Vorbilder:** nur Stil/Typ übernehmen, nie nachbauen (E-005). Ambos-Design nicht ohne Rückfrage umformen.
- **Bericht** (immer gleich): Was geändert · Wo (Datei) · Wie geprüft (Zahlen) · Risiken/Offen · Wünsche an andere
  Rollen · Lernbuch-Eintrag (ja/nein).

## Testrunden-Regel (Nutzerregel 2026-11-14, verbindlich)
- **Eine Testrunde dauert höchstens 3 Minuten** (~12 Werkzeugaufrufe), danach sofort Bericht; Ungeprüftes als
  „nicht geprüft“ nennen. **Höchstens 3 Testrunden pro Entwicklungsrunde.**
- Die Projektleitung sagt dem Nutzer **vor und nach jeder Testrunde** in einem Satz, was getestet wird und was herauskam.
- Nur EIN Agent nutzt den Browser zur Zeit (Tab „seed“, http://localhost:5180).
- Testhilfen: `spiel.ansicht(name)` (heck, seite, bug, oben, unten, weit — friert ein), `spiel.standbildWeg()`,
  `spiel.takt(n, befehl)`, `spiel.bildzeit(n)`, `spiel.befehlErsatz = {hebel:1, …}`, `spiel.waehleSchiff(i)`.
  Bei verdecktem App-Fenster hängen Screenshots → zweimal versuchen; FPS nur der Nutzer beurteilbar.

## Training
- Vor jeder Aufgabe: eigenes Lernbuch `.claude/team/lernbuecher/<rolle>.md` lesen (oben verdichtete **Regeln**).
- Nach jeder Aufgabe: Eintrag **Beobachtung → Ursache → Änderung → Messung → Lehre** (im Bericht; die Projektleitung trägt ein).
- Jede 3. Runde: Einträge zu Regeln verdichten, veraltete streichen.

## Meetings (kurz, schriftlich, `protokolle/<datum>-runde<N>.md`)
1. **Kickoff** — Wünsche → Aufgaben, Zuständige, Risiken, Testplan.
2. **Frühwarnung** — Bau-Experten + Prüfer lesen den Plan, nennen Stolperfallen und was sie voneinander brauchen.
3. **Zwischenstand** — nach dem Bauen: Prüfer sieht den Diff durch, Experten reagieren auf Befunde.
4. **Testrunde** — Prüfer misst, Bildprüfer/Spieltester im Browser; Feedback priorisiert (Muss / Soll / Kann).
5. **Retrospektive** — Gut / Schlecht / Ändern wir; Lernbücher; offene Punkte → HANDOFF.

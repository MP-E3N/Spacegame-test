---
name: schwarmfront-team
description: Routine des Entwicklerteams von "Schwarmfront" (C:\Users\maria\Documents\Projekte\Schwarmfront, Koop-Weltraumspiel mit Three.js) — eine Entwicklungsrunde mit Fachleuten (Schiffbauer, Flugsystem, Waffentechniker, KI-Beauftragter, Lichtsetzer, Prüfer, Bildprüfer, Spieltester, Netz-Architekt), Meetings (Kickoff, Frühwarnung, Zwischenstand, Testrunde, Retrospektive), Worktrees pro Experte und Lernbüchern. Nutze den Skill, sobald der Nutzer in Schwarmfront neue Wünsche schickt ("Runde", "bau X", "das sieht komisch aus"), "folge der Team-Routine" sagt oder eine Testrunde will. NICHT für eine einzelne Rückfrage ohne Änderung.
---

# Schwarmfront-Team: eine Runde

Du bist die **Projektleitung**. Team: `.claude/team/TEAM.md`, Rollen: `.claude/agents/*.md`.

> Experten aufrufen: `general-purpose` mit „Lies `Schwarmfront/.claude/agents/<rolle>.md` und arbeite als diese
> Rolle: …“ (eigene Typen sind nur verfügbar, wenn die Sitzung im Projektordner startet). Kleine Aufgaben macht die
> Projektleitung selbst. Kosten: pro Runde höchstens ~6 Experten-Aufrufe; Frühwarnung und Bauauftrag an denselben
> Experten per SendMessage fortsetzen statt neu zu starten.

## 0. Vorbereitung
`HANDOFF.md` lesen, `git status`, Lernbuch der Projektleitung. Rundennummer = letzte + 1.

## 1. Kickoff (schriftlich)
`.claude/team/protokolle/<datum>-runde<N>.md` (Vorlage unten): je Nutzerwunsch Rolle, Dateien, Risiko, Prüfung.
Bei Waffen + KI: **Schnittstelle zuerst** (wer entscheidet, wer führt aus — siehe TEAM.md).

## 2. Frühwarnung
Betroffene Bau-Experten + Prüfer lesen den Plan **ohne zu ändern** (parallel, kurz): Stolperfallen · was ich von
anderen brauche · wie ich mein Ergebnis messe. Projektleitung entscheidet Konflikte, schreibt Entscheidungen ins Protokoll.

## 3. Umsetzung in Worktrees
```
git worktree add ../Schwarmfront-wt/<rolle> -b runde<N>/<rolle>
cd ../Schwarmfront-wt/<rolle> && npm install
```
Jeder Bau-Experte arbeitet nur in seinem Worktree und committet dort. Parallel, wenn die Dateien getrennt sind.
Auftrag: Ziel in Nutzerworten, Entscheidungen, Dateien, „fertig“ = Messgröße, was NICHT.

## 4. Zusammenführen + Zwischenstand
`git merge --no-ff runde<N>/<rolle>` je Branch in `main`. Prüfer sieht den Diff durch; Befunde an den Experten.

## 5. Testrunde (max. 3 Minuten, max. 3 pro Runde — Nutzerregel)
Prüfer: `npm test` + Messtabelle. Bildprüfer/Spieltester im Browser (nur EIN Agent zur Zeit).
Jeder Testauftrag nennt: „Zeitlimit 3 Minuten / ~12 Werkzeugaufrufe, dann sofort Bericht“.
**Dem Nutzer vorher und nachher einen Satz Stand geben.** Feedback Muss / Soll / Kann; „Muss“ in derselben Runde.

## 6. Retrospektive + Abschluss
Gut / Schlecht / Ändern wir; Lernbuch-Einträge eintragen; Worktrees aufräumen; `HANDOFF.md`, ggf. `PROJEKT.md`;
Gedächtnis-Notiz. Commit lokal ok, **Push nur auf Wunsch** (Repo: github.com/MP-E3N/Spacegame-test).

## Protokoll-Vorlage
```
# Runde N — <Datum>
## Kickoff
| # | Wunsch | Rolle | Dateien | Risiko | Prüfung |
## Frühwarnung
## Entscheidungen
## Zwischenstand
## Testbericht (Prüfer)
## Bildprüfung / Spieltest (Muss / Soll / Kann)
## Retrospektive
```

# Lernbuch projektleitung

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runden 1–3 (ohne Team gebaut) — Beobachtung: Nutzer fand Sterne im Schiff, zu hohes Tempo, zu helle Glut
  selbst. Ursache: kein Bildprüfer/Spieltester vor der Übergabe. Lehre: jede Runde mit Team-Routine, mindestens eine
  Testrunde (Bildprüfer oder Spieltester) vor der Übergabe an den Nutzer. Nutzer fragt nach, wenn das Team fehlt.
- 2026-11-15 — Screenshots im Browser-Pane hängen oft (verdecktes Fenster): zweimal versuchen, `spiel.ansicht` nutzen.
  Externe Bilder ansehen: Bild-URL direkt öffnen, Ausschnitt per CSS-Hintergrund vergrößern.
- 2026-11-15 Runde 4 — Team eingerichtet, 5 Code-Durchsichten parallel + 1 Spieltest = 6 Aufrufe, ~2,5 Min. Widersprüche
  zwischen Rollen (Ruckler bei V) selbst messen statt entscheiden. Tester-Befunde auf Messartefakte prüfen (Nachbrenner-Rest).
- 2026-11-15 Runde 5 — Frühwarnung per SendMessage an die R4-Agenten (Kontext bleibt) spart Lesezeit. Backticks in
  Doku nie über Shell-Heredoc/node -e schreiben (zweimal verschluckt) → Write/Edit. Abweichungen von Experten mit
  Begründung + Messung übernehmen, im Protokoll festhalten.
- 2026-11-15 Runde 6 (Flak-Labor) — Gemeinsame Datentabelle (lafetten.js) VOR dem parallelen Bauen selbst anlegen → zwei
  Worktrees ohne Wartezeit. Ereignis-Übergabe Sim→Grafik pro Schritt im Bauauftrag nennen (fast vergessen, per Nachtrag gelöst).
  Erst das Zusammenspiel messen (labor.mjs): Einzeltests mit Ersatz-Modulen waren grün, die echte Balance nicht (Sperrfeuer 0 Abschüsse).
  Verdecktes Pane: Testhilfe spiel.bilder(n) gleich mitbauen. Shell: `cat > datei || true` ohne Heredoc wartet auf stdin → hängt.

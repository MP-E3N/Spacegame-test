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
- 2026-11-15 Runde 7 — Verhaltens-Wünsche des Nutzers („nähern UND entfernen“) als Messgröße in den Auftrag schreiben,
  sonst merkt es erst die Labor-Messung (0 Überlebende). Testhilfe spiel.bilder muss auch Tasten verarbeiten (bedienen()),
  sonst sind Tastentests im verdeckten Pane wirkungslos. Alle Aufrufe per SendMessage an bestehende Agenten: billig und schnell.
- 2026-11-15 Runde 8 — Frühwarnung fand den Kern selbst: der „Direkttreffer“ war der Annäherungszünder, nicht der
  Schaden. Erst das Zusammenspiel im Labor zeigte die Balance (Zielfeuer 240 Abschüsse) → ein Experte als Besitzer der
  ganzen Balance-Schleife mit eng begrenzter Freigabe (nur Zahlen der Zielgranate) war schnell und sauber. Hilfen, die sich
  selbst ausblenden (setTimeout), findet der Nutzer nicht → Bedienung dauerhaft sichtbar und klickbar.
- 2026-11-15 Runde 9 — Ganze Runde ohne neue Agenten (nur SendMessage) — Kontext aus R8 trägt. Befunde der Testrunde
  vor dem Weitergeben selbst nachmessen (Bildprüfer-Muss war Artefakt). Messziele vorher auf Verträglichkeit prüfen.
- 2026-11-16 Runde 10 — Nutzer bat um Recherche („schau dir an, wie Flakfelder aufgebaut sind“): kurze Textrecherche
  vor dem Kickoff ins Protokoll → beide Experten bauten darauf. Videos kann ich nicht ansehen — das offen sagen. Messziele
  vorher überschlagen (Detonationen/s × Volumen), sonst Widerspruch wie „≥ 8 Wolken je Drohne“ vs. „weit streuen“.
  Nach einem Sitzungswechsel sind die alten Agenten weg → neue Frühwarnung, die Lernbücher tragen den Kontext.
- 2026-11-16 Runde 11 — Regler-Wünsche: jeder Besitzer exportiert eine Tabelle { min, max, standard }, die Seite baut
  daraus generisch (regler.js) → keine doppelten Zahlen. Ein stiller Deckel macht Regler wirkungslos → als eigenen Regler
  anbieten und den Anteil „gedeckelt“ anzeigen. Testwerte im localStorage nach eigenen Browsertests wieder löschen.
- 2026-11-19 Runde 12 — „Damit du sie direkt abrufen kannst“ → Ablage als Datei im Projekt über eine Vite-Middleware
  (nicht localStorage: fremder Browser). Vor jedem git add -A den Status lesen (ein Agenten-Messskript rutschte in den
  Commit). Im Bauauftrag: Skripte nur ins Scratchpad. Neue Agenten nach Sitzungswechsel — Lernbücher tragen den Kontext.

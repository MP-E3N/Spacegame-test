# Lernbuch spieltester

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 4 / Testrunde 1 — Verdecktes Fenster: Screenshot zweimal versuchen, Bild kann gekachelt sein (kein
  Grafikfehler). Messung über spiel.takt + Quaternion (Bug- gegen Bahnrichtung) ergibt Driftwinkel/Drehrate schnell.
  `hebel` im Befehl ist eine Hebel-BEWEGUNG. Vorsicht: Nachbrenner-Rest verfälscht spätere Tempo-Messungen (Projektleitung).
- 2026-11-21 Runde 14 — Gefecht: Live-Turmwinkel in spiel.gefecht.flak.tuerme[i], zugehöriges Modell über
  spiel.gefecht.lafetten[i].id (NICHT gleicher Index — Modell 2 ist ein schwerer Turm; falscher „dreht nicht“-Befund).
  Feuer halt: Schusszähler UND grafik.zaehler.fuellGesetzt messen, 1 s Nachlauf ist normal. bilder(6450) ≈ 2 min in ~1 s.
- 2026-11-22 Runde 15 (Werft) — Befund „Anwählen + Entf löscht nicht“ war ein Fehlklick: Screenshot 800×600, Leinwand
  1024×768. Für Klicks auf kleine Teile `spiel.bildpunkt(nr)` nutzen (CSS-Pixel) und vor/nach jedem Schritt
  `spiel.bau.teile.length` messen. Budget reichte für 2 von 5 Punkten → Speichern/Laden in eine eigene Runde legen.
- 2026-11-22 Runde 16 (Werkstatt) — Regler ohne Namen: per left_click_drag ziehen, Werte über spiel.form prüfen. Nach
  Zahlenfeld-Eingabe liegt der Fokus noch im Feld → vor Tastentests auf die Bühne klicken. spiel.info (csg, offeneKanten)
  belegt einen Schnitt besser als ein Screenshot.
- 2026-11-26 Runde 18 (Werkstatt-Bedienung) — Vor/nach jedem Schritt spiel.form messen (ein „verschwundener“ Körper fiel nur
  an der Körperzahl auf). left_click_drag drückt ohne Mausbewegung davor → Hover-Zustände sind veraltet; Befund trotzdem
  melden (trifft auch schnelle Nutzer). Verdeckter Browser: Kamerafahrten per spiel.wuerfel.schritt(...) abschließen.
- 2026-11-26 Runde 19 — Neuling-Pfad zuerst: erstes Triebwerk per Maus setzen → scheiterte an Schubversatz. Werte auf
  Plausibilität lesen (2,5 m/s² ohne Schub fiel auf). Probeflug-Sperre ist ein Befund, wenn der Weg dorthin unklar ist.
- 2026-11-26 Runde 20 (Generator) — spiel.fokus() rahmte das Schiff zu klein → zoom-Region aufs Schiff; erst fokus, dann
  ansicht. Je Wurf Seed + g-info + spiel.info.offeneKanten + Maße lesen (so fiel ein undichter Träger trotz FLUGTAUGLICH
  auf). Seitenansicht zeigt die Silhouette am deutlichsten; zwei Seeds derselben Klasse nebeneinander vergleichen.
- 2026-11-28 Runde 21 — Würfel-Flächen per echtem Klick (OBEN ≈ 555,30 / SEITE ≈ 568,58 im 800×450-Frame bei 1280×720).
  Kanten-Werkzeuge über spanten[].ecken bzw. kf messen (nicht fase/rundung). Gefecht: spiel.gefecht.istForm/lafetten,
  Schüsse über spiel.bilder(n).schuesse. Fehlklick-Verdacht trotzdem als Muss melden — die Projektleitung stellt nach.

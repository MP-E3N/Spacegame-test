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

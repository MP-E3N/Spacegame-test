# Lernbuch ki

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 4 (Bestandsaufnahme) — Türme nur als THREE-Gruppen, Zufall nur in grafik/. Lehre: Erst Daten in die
  Sim (Montage, Feuerbereich, Zonen), dann Verhalten; Grafik liest die Montage aus der Sim, nie umgekehrt.
  Budget: dt-Deckel 0,1 s → bis 6 Takte/Bild → KI ≤ 1 ms/Takt.
- 2026-11-15 Runde 6 (Flak-Labor) — Beobachtung: Engstabstand der Drohnen 0,7 m, 8,4 Zielwechsel/Turm/min, 0 Angriffsläufe
  durch den Schirm. Ursache: reine Abstandskraft reagiert bei 250 m/s Schließtempo zu spät; Angriffsbonus kippt Ziele; Angreifer im
  Gleichtakt. Änderung: Trennung mit 3-s-Vorausschau, Wechsel erst bei 1,3× und nach 2 s, Warteschleife vor dem Anlauf.
  Messung: 79 m, 5,0/min, 41 Läufe in 5 min, 4,6 µs/Takt, Gleichlauf gleich. Lehre: Schwarm-Werte im Langlauf mit mehreren
  Startwerten messen; Lissajous-Muster brauchen ungekoppelte Phasen je Turm, sonst Linie statt Fläche.
- 2026-11-15 Runde 7 — Sperr-Befehle sprangen bis 5900°/s (Musterphase hing am Platz im Schirm). Lehre: zustandsabhängige
  Indizes nie als Musterphase; Bahngeometrie ohne Waffen messen.
- 2026-11-15 Runde 7 Nachauftrag — 0 von 15 Vorstößen überlebt. Lehre: Rohschaden-Verteilung messen, Faktor daraus rechnen
  (Panzer 0,065 → 50 %); Verweildauer in der Killzone ist Geometrie (Tangente 250 m ≈ 5 s), nicht Tempo.
- 2026-11-15 Runde 7 Prüfer-Befund — Moduswechsel fest ↔ Folgen setzte auf Vorgaben zurück. Lehre: jeden Moduswechsel mit
  Umschalt-Test messen (Sprung im Umschalt-Takt ≤ normaler Schritt).
- 2026-11-15 Runde 8 — Streukugel 20 m, Detonationen trotzdem Median 70 m von der nächsten Drohne: kam von Granaten auf
  schon abgeschossene Ziele, nicht vom Ausweichen (mit unverwundbaren Drohnen 19 m). Lehre: Abstand mit unverwundbaren
  Drohnen messen; Rohschaden je Vorstoß ebenfalls ohne Tod messen (sonst bei 100/Panzer gedeckelt). Ersatz-Flak mit
  exaktem Vorhalt ist zu tödlich für Balance-Aussagen. Mindestmaße (8 m) unter denselben Deckel wie die Waffe (0,05·d) legen.
- 2026-11-15 Runde 9 — Sperrfeuer-Abstand 260 m kam von EINER Kugelschale über radial 830–1800 m verteilte Drohnen und
  einem Muster, das den ganzen Sektor streicht. Sperrkästen auf dem dichten Kern je Gruppe (Lücken in Metern, Drohnen
  bleiben ihrem Kasten zugeordnet) → 100 m. Neuverteilen jedes Takts ließ Kästen 125 m danebenhängen. Zenit: Nachführen
  je Achse statt Großkreis (sonst 181°/s Gier). Richttempo-Messung immer mit Winkel-Umbruch.
- 2026-11-16 Runde 10 — Sättigungsräume (3 Tiefenlagen längs der Flugrichtung, Ellipsoid 70/40, Ziel 140): Abstand
  101 → 163 m, „vor der Drohne“ 9 → 35 %, Abdeckung (≥ 8 Det./150 m/2 s) blieb 19 %. Ursache: Drohnen in 7–9 getrennten
  Grüppchen, 3 Räume fassen ~50 %; 60 Det./s reichen nicht für „weit streuen“ UND „8 je Drohne“ (14 Varianten 11–22 %).
  Lehre: Messziele vor dem Bau gegeneinander überschlagen (Detonationen/s × Kugelvolumen), Gruppenstruktur messen.
  Glättung τ hinkt um v·τ → Lagen brauchen Vorlauf. Lagen-Schwenk + Nachführen + Muster summieren sich → Dauer-Tempobremse
  am Befehl statt Einzeldeckel.
- 2026-11-16 Runde 10 Balance — Sättigungsräume verteilen dieselbe Feuerrate auf ~10× Volumen: Schaden ×1,8–2 nötig.
  Splitterradius (bis zur sichtbaren Wolke 42 m) ist der Hebel für weit gestreutes Zielfeuer. Panzer = getrennter Hebel für
  das Überleben der Vorstöße, nach jeder Änderung an der Zielgranate neu suchen (steil: 0,14 → 80 %, 0,22 → 15 %).
  Methode: 2 Startwerte × 2 Betriebsarten parallel, dritter Startwert zur Bestätigung (Läufe streuen ±10 Abschüsse).
- 2026-11-16 Runde 11 — Streu-Regler über befehl.streu/befehl.waffe mit Tabelle (STREU_REGLER) und Klemm-Hilfe
  (streuWert/waffeWert, NaN → Standard): ohne Regler bitgleich. Feste Klammern (Raum 120–250, Lagenabstand) verschlucken
  Regler → an den Regler koppeln. Fremde Deckel nie als Konstante lesen, sondern über dieselbe Klemmregel wie der Besitzer.
- 2026-11-19 Runde 12 — Gesamtregler faktor (0,5–3) skaliert alle Sim-Streuungen + Raum-Obergrenzen; Raum nur
  geometrisch (0,8/0,45 rad), Periode = Grund · max(1, halb/Bezug), Phase je Raum aufintegriert. Sperr-Median 164 → 269 m,
  Ziel 103 → 227 m. Ausreißer 552°/s = Nah-Ziel bei 88° Nick (Gier-Singularität) → Zenit-Bremse, auch im Zielfeuer.
  Lehre: TURMKI-Patches wirken nicht auf Regler-Standards (beim Laden gebildet) → über befehl.streu messen; fremde
  Deckel selbst einhalten (Leuchtspur-Kugel ≤ 0,98·0,10·d), sonst kürzt die Waffe stumm (21 % → 4 %).
- 2026-11-21 Runde 14 — Turm-KI im Schiffsrahmen, Angreifer-KI. Parameter `killzone` wurde von der inneren
  function killzone() verdeckt (Hoisting) → Prüfstand still anders. Lehre: Optionen nie wie innere Funktionen benennen;
  Bitgleichheit mit Prüfsummen-Anker VOR dem Umbau messen. Grenzen im Turm-Rahmen über Vorzeichen s (oben 1, unten −1).
  Killzone 900/1000 statt 500/600: Abschüsse vor dem Feuern. Scheinfahrt aus Lagedifferenzen im mitdrehenden Rahmen:
  −15 statt −9 %/min Schiffsschaden. Flak ohne setzeRahmen emulierbar (zwei Instanzen, unten gespiegelt).
- 2026-11-28 Runde 23 — Hauptbatterie, Handsteuerung-Feld, CIC-Vorgabe, Panzerboote. Beobachtung: Gefecht-Anker brachen,
  obwohl Panzerboote erst ab Takt 3676 kommen. Ursache: Fingerabdruck hasht auch LEERE Plätze (Vorrat 8 → 10). Änderung:
  neue Zweige nur an neuen Feldern, Anker über die alten 8 Plätze als bitgleich belegt, dann erneuert. Messung: Gatlings
  + 2 schwere = 4 Gatlings allein (Hash gleich); KI 12 µs je Takt. Lehre: Vorrat vergrößern ändert jeden Fingerabdruck über
  feste Plätze — vorher über den alten Ausschnitt messen; Sprungprüfungen mit Gegenlauf ohne die Änderung.
  Offen: Zielvorgabe auf dem Bollwerk nur 71 % der Takte bedient (Prüfer), schwere Türme alle oben.

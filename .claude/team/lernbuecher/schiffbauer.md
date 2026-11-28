# Lernbuch schiffbauer

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runden 1–3 — Nutzer mag Ambos („hat was von einem U-Boot“, gesichert, nicht umformen). Bollwerk nach
  Pegasus-Blueprints abgewandelt; Nutzer wollte dann: keine runden Tanks hinten, Hangars direkt an der Hülle statt an
  Auslegern. Lehre: Nutzer bevorzugt geschlossene, kompakte, kantige Rümpfe; runde Anbauten wirken für ihn fremd.
- Triebwerksglut zu hell (weiße Scheinwerfer) → Glut ≤ ~3 HDR, Halo klein. Name-Abziehbild nicht dort, wo Anbauten verdecken.
- 2026-11-15 Runde 4 (Bestandsaufnahme) — Beobachtung: Türme schweben (Ambos 0,27/0,6 m) oder schneiden in Panzer/Bug
  (Bollwerk z 22, z 62), Nummer „07“ schwebt 0,5 m. Ursache: Höhen von Hand, nicht aus masse(); Schussfeld nie bedacht.
  Änderung: vorgeschlagen (Höhe = masse(ab, z).y + h; Turm in Sockel/Drehkranz/Wiege/Mündung). Lehre: Anbauteile immer
  vom Querschnitt ableiten; bei Türmen zuerst Schussfeld prüfen.
- 2026-11-15 Runde 5 — Fußpunkt = höchste Oberkante über der Standfläche + Schürze, Daten in der Sim. Messung: Spalt
  0,000 m (Strahltest), Feld bitgleich, Rumpfnetze bitgleich. Lehre: Anbauteile aus dem Querschnitt ableiten und gegen
  die echte Geometrie testen; Kugeln lieber zu groß als zu klein. Kisten unter Türmen überspringen, Zufallsfolge halten.
- 2026-11-21 Runde 14 — Bollwerk +10 Zwillings-PDC an den Außenkanten (ids 7–16), rumpfSperre() je Gier-Sektor.
  Grafik-Anbauten (Kühlrippen, Rohre, Mast, Triebwerke) standen nicht in TEILE → Fußpunkt und Sperre sahen sie nicht;
  unten montierte Türme brauchen gespiegelte gier-Mitte. TEILE.details als Quader, Sperre aus Ober-/Unterkanten (+0,5 m),
  Prüfung per Raycaster gegen die Lofts; Gegenprobe ohne Sperre muss rot werden. Rumpftreffer 0/33 825, Abdeckung 100 % ≥ 1
  / 99,9 % ≥ 2, Draw-Calls +100 (Schatten verdoppelt). Lehre: jedes Netz zählt doppelt (Schattendurchgang).
- 2026-11-22 Runde 15 (Werft-Module) — 15 Module mit Normquerschnitten je Größe (M w10/h8, L w18/h13, fase 0,3),
  Lafettenplatten aus fusspunkt(), Hüllquader mit Aufbau-Zone, Spiegelpaar Hangar, Stecker an Anbau-/Turmfüßen.
  Messung: Nähte 0, S-Spalt 0,000 m, 12 Draw-Calls für 25 Module, ≤ 6,4 ms je Modul, Bollwerk/Ambos bitgleich.
  Lehren: Was die Grafik zufällig anbaut, muss als Zone in den Daten stehen. Quader dünner als 2 × Schrumpf kippen um.
  „Nachbarn ausnehmen“ blendet den Turm im eigenen Elternmodul aus. Veränderliche Lofts → Quader in Scheiben ≤ 5 m.
- 2026-11-22 Runde 16 (Form-Werkstatt) — Lofts als Dreieckssuppe → toCreasedNormals 30° → mergeVertices (harte Kanten
  getrennt, Lage geschlossen). CSG in Sätzen nicht berührender Körper (30 Körper: 3 statt 39 Schritte, ~5× schneller).
  Schweißzugabe 1–3 mm nach Listenplatz (id % 3 versagte bei regelmäßiger Nummerierung). Offene Kanten nur mit T-Stoß-Teilung
  zählen. Lehre: Annahmen der Frühwarnung erst messen (Zugabe half bei deckungsgleichen Flächen, nicht bei bündigen).
- 2026-11-26 Runde 18 (ziehen.js) — Kappe nur am End-Spant erkennen (Flanken von Keil/Bug hätten sonst als Kappe gegolten);
  Dreieck-Index des rohen Netzes gibt Kante/Abschnitt sicher. Kanten gleiten entlang der Nachbarkanten, Klemmung gegen
  Länge < 6 cm, Selbstschnitt UND Kippen (Halbierungssuche). Strahl-Treffer runden (0,1 mm), sonst 5,9999999 in den Daten.
- 2026-11-26 Runde 19 (Form-Schiff) — Feste Bauteile mit der CSG-Hülle zu einem Netz je Material, nur Türme eigene Gruppen;
  Gehäuselänge aus der Materialtiefe; Kugeln je Zelle um die Oberflächenpunkte statt je Körper (r 103 → ≤ 15 m). Gegen
  Ersatz-Module messen, kennzeichnen und nach dem Merge mit den echten wiederholen.
- 2026-11-26 Runde 20 (Generator) — Flugtauglich per Bau: erst alles außer den Haupttriebwerken, dann Schwerpunkt
  rechnen, Triebwerke genau auf seine Höhe (Fixpunkt, Hebel 0). Antriebsblock als eigener Körper hält den Hauptrumpf
  unabhängig (Teilstrom bitgleich). Regler monoton: gierig über ALLE Kandidaten annehmen, dann Präfix k. Grenzfälle
  (alle Regler am Anschlag) zuerst messen. v2 nach Spieltest: Klassencharakter + Seed wählt Grundmuster (Bug, Profil,
  Brücke, Seiten, Rücken) — Technik-Zahlen allein sagen nichts übers Aussehen. Offene Kanten kamen von verschiedenen
  Schweißzugaben für Original und Spiegelkopie (0,25 mm versetzt → Splitter); kleine Teile (Antennen) auf großen Decks
  reißen beim Triangulieren.
- 2026-11-28 Runde 21 (Kanten) — Kanten-Maß in Metern je Ecke als optionales Spant-Feld (ecken), Kappenkanten als echte
  Spanten mit kf-Marker am End-Spant; PROFIL_N bleibt 32. Jede Funktion, die Spanten kopiert/spiegelt, muss neue Felder
  kennen. Im Browser: Pick-Zone 7 px wurde verfehlt → 12 px (Projektleitung); Bildraum-Picking vor Abgabe mit echter Maus.
- 2026-11-28 Runde 22 — Splitter-Risse hängen an der Kombination der Schweißzugaben, nicht an einem Körper; erneutes
  Verschweißen mit anderer Zugaben-Reihenfolge (bis 3 Versuche) machte 675/675 dicht, Generator-Tricks nur 17 → 12.
  Kern-Suche: entfernte Körper durch ferne Mini-Würfel ersetzen (Listenplätze bleiben). Regex mit Backslash nie im Heredoc.
- 2026-11-28 Runde 23 (Silberlanze, Gatling) — Beobachtung: PDC auf gerundeter Schulter `schraeg`, schwerer Zwilling bei
  x ±9 `rohre_kreuzen`. Ursache: Rundung 0,6 lässt auf dem Achterschiff nur ±5 m flache Fläche; Schwenkkreis zweier schwerer
  Türme braucht 23,8 m. Änderung: Rundung 0,45–0,5, schwere Türme x ±12, PDC x ±6,5, Höhen per punktInForm gemessen.
  Messung: 0 Fehler/Warnungen, 0 stumm, dicht im 2. Versuch; Gatling 1 Netz je Bündel → 0 Draw-Calls mehr. Lehre: erst
  Turmplätze/Abstände festlegen, dann Rundung; drehbare Teile mit Achse im Netz-Ursprung bauen.

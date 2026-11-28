# Schwarmfront — Koop-Weltraumspiel im Browser

Vier Spieler bedienen gemeinsam ein Kriegsschiff und halten gegen einen Alien-Schwarm stand (Idee: `docs/IDEE.md`).
Stand jetzt: Weltraum + Schiff + Steuerung (Steuer-Station) als Einzelspieler-Prototyp.

## Starten
```
cd Schwarmfront
npm install        # nur beim ersten Mal
npm run dev        # → http://localhost:5180
npm test           # Messflüge ohne Browser
```

## Steuerung (Steuer-Station)
| Taste | Wirkung |
|---|---|
| W / S | Schubhebel vor / zurück (bleibt stehen) · X = Hebel auf 0 |
| Umschalt | Nachbrenner |
| A / D | gieren · ↑ / ↓ Nase hoch / runter · Q / E rollen |
| ← / → | seitlich versetzen · R / F hoch / runter |
| T | Trägheitsdämpfer an/aus (aus = Schiff treibt) |
| C | Kamera: Verfolger → Übersicht → frei · Maus ziehen = umsehen, Rad = Zoom |
| V | Schiff wechseln (Bollwerk / Ambos) · N Neustart · H Hilfe |

## Aufbau
| Datei | Inhalt |
|---|---|
| `index.html`, `src/menue/*` | **Startmenü** (Runde 14): Gefechtstest / Flak-Labor / Freiflug / Werft (R15); `zurueck.js` = Esc-Rückweg (überspringt Esc, wenn die Seite `preventDefault` ruft) |
| `werft.html`, `src/werft/*` | **Werft** (Runde 15): Schiffs-Baukasten mit Andockpunkten — Palette, Geist, Drehen, Löschen, Rückgängig, Werte, Meldungen, Speichern/Laden |
| `src/sim/werft/zusammenbau.js` | Baukasten-Rechnung (rein): `baue(entwurf, katalog)`, `andockLage`, `kandidaten`, `erlaubteDreh`, `LAGEN`, `loesche`, `migriere` |
| `src/sim/werft/module.js`, `beispiel.js` | Modul-Katalog (15 Module, Normquerschnitte M/L, Andockpunkte, Hüllquader in Scheiben) · Beispielschiff WS-01 (25 Module) |
| `src/grafik/schiff/module.js` | `modulGeometrie(id)`, `schiffNetz(teile, mats, {effekte})` (je Material ein Netz, Türme eingeschmolzen), `lageMatrix` |
| `werkstatt.html`, `src/werkstatt/*` | **Form-Werkstatt** (Runde 16): Körper/Spanten modellieren, Plus/Minus, Spiegel, Verschweißen, Andockpunkte, Speichern |
| `src/sim/form/form.js`, `beispiele.js` | Form-Daten (rein): `profilPunkte` (eckig/gefast/rund), `VORLAGEN`, `normalisiere`, `pruefe`, `huelle`, `volumen`, `formZuModul` · 3 Beispielformen |
| `src/sim/form/generator.js`, `src/werkstatt/generator-tafel.js` | **Schiffsgenerator** (Runde 20, rein): `generiere(einst)` → normalisierte, flugtaugliche Form (Korvette/Fregatte/Träger), `KLASSEN`, `GENERATOR_REGLER`, `standardEinstellung`, `grundmuster`, `GENERATOR_VERSION` · Seite: Seed, Würfeln (G), Regler, Favoriten · Tests `tests/generator.mjs` |
| `src/sim/form/kanten.js`, `src/werkstatt/kanten.js` | **Kanten** (Runde 21): `kantenVon`, `fase`, `rundung` → `{ koerper, mass }` (Spant-Feld `ecken`, Kappen-Marker `kf`) · Werkzeug-UI (Fase R, Rundung T) |
| `src/menue/stimmung.js` | Knopf Hintergrund Weltall ↔ Studio (Werkstatt, Werft) über `bild.setzeStimmung` (renderer.js, `STIMMUNGEN`) |
| `src/grafik/form/koerper.js`, `schweissen.js` | `koerperGeometrie(k)` (Loft + Kappen, Knick-Normalen) · `formGeometrie(form, {schweissen})` (CSG three-bvh-csg, `.info`) |
| `server/ablage.js` | Datei-Ablage des Dev-Servers (Fabrik): `/api/flak-konfig` → `konfig/flak/`, `/api/schiffe` → `konfig/schiffe/`, `/api/formen` → `konfig/formen/` |
| `freiflug.html`, `src/main.js` | Freiflug: Start, Hauptschleife (feste Sim 60 Hz + interpolierte Darstellung), `window.spiel` |
| `gefecht.html`, `src/gefecht/*`, `src/sim/gefecht.js` | **Gefechtstest** (Runde 14): Bollwerk + 14 Flak-Türme gegen Angreifer-KI (`src/sim/ki/angreifer.js`) |
| `src/eingabe.js` | Tastatur/Maus → `befehl` (Form wie `sim.schritt` erwartet) |
| `src/hud.js` | Anzeige der Steuer-Station |
| `src/sim/welt.js` | Sim-Welt: fester Schritt Schiff → Kollision (später Drohnen, Türme, Geschosse) |
| `src/sim/werte.js`, `src/sim/schiff.js` | Flug-/Kollisionswerte je Schiff, Flugmodell mit HP/Wrack (rein, testbar) |
| `src/sim/schiffe/*` | Schiffsdaten: Rumpf-Querschnitte, `masse/oberkante`, Türme (Typ, Mündungen, Grenzen), Kollisionskugeln |
| `src/sim/feld.js`, `src/sim/kollision.js`, `src/sim/zufall.js` | Asteroidenfeld (Daten), Kugel-Kollision, Zufall mit Startwert |
| `src/grafik/renderer.js` | Renderer, Sonne + Schatten, Spiegel-Umgebung, Bloom, AgX |
| `src/grafik/weltraum.js` | Nebel/Milchstraße, Sterne, Sonne, Gasriese (folgen der Kamera) |
| `src/grafik/staub.js`, `asteroiden.js` | Raumstaub-Striche, Asteroidenfeld |
| `src/grafik/schiff/bollwerk.js` | Schlachtträger „BT-12 Bollwerk“ (Hauptschiff) |
| `src/grafik/schiff/ambos.js` | Fregatte „FK-07 Ambos“ (gesichertes erstes Design) |
| `src/grafik/schiff/bauteile.js`, `texturen.js` | gemeinsame Bausteine + Effekte, Rumpf-Texturen |
| `src/grafik/kamera.js` | Außenkamera |
| `tests/flug.mjs`, `tests/schiffe.mjs` | Messflüge je Schiff + Kollision + Gleichlauf · Turm-Spaltmaß, Feld, Import-/Sim-Regel (ganz src/sim) |
| `flak.html`, `src/labor/*` | **Flak-Labor** (Runde 6, Demo ohne Schiff): Seite, Prüfstand, Drohnen-Platzhalter, Kamera, HUD, Bedienfeld (R8), Reglerfeld `regler.js` (R11) |
| `src/sim/flaklabor.js` | Labor-Sim-Welt: Drohnen → Turm-KI → Waffen (Treffer aus Schritt n wirken in Schritt n+1) |
| `src/sim/waffen/lafetten.js`, `flak.js` | Turm-Montage (einzige Quelle) · Flak: Richten, Feuern, Geschoss-Pool, Zeit-/Annäherungszünder, Splitterwolke, Nachbar-Sperre |
| `src/sim/ki/turmziel.js`, `zieldrohnen.js` | Turm-KI (Sperrfeuer-Muster, Zielwahl, Vorhalt) · Zieldrohnen (Bahnen, Ausweichen, Neustart) |
| `src/grafik/waffen/flakgrafik.js`, `shader.js` | Türme, Leuchtspur, Mündungsblitz, Kern, Rauch (Fake-Licht) · `nachSchritt` je Sim-Schritt, `aktualisiere` je Bild |
| `tests/form.mjs` | Form-Werkstatt: Profil, Drehung, Hülle, Volumen, Meldungen, Andock-Einrasten, formZuModul → Werft, Lofts/CSG dicht, Zeiten, Gegenproben |
| `tests/werft.mjs` | Baukasten: Lagen, Andocken, alle Meldungs-Codes, Reihenfolge, Ring-Schluss, Ablage, echter Katalog + Beispiel, Draw-Calls |
| `tests/waffen.mjs`, `tests/ki.mjs` | Flak-Messungen (Richtzeit, Schuss/s, Durchflug, Gleichlauf) · KI-Messungen (Vorhalt, Abdeckung, Drohnen-Langlauf) |

## Schnittstellen
- **Form-Werkstatt (R16, Protokoll runde16 F1–F9):** Form `{ name, version: 1, art, koerper, andock }`; Körper `{ id, typ, op: 'plus'|'minus',
  mat, pos, dreh (Grad, XYZ), spiegel, spanten }`; Spant `{ z, b, h, x, y, rundung, fase }` (volle Maße). Eigene Module = `formZuModul(form)`
  + `registriereForm(modul, formGeometrie(form))`, Id `form_<name>`.
- **Werft (R15, Protokoll runde15 E1–E9):** Modul `{ id, name, art, teile, quader, kugeln, werte, duesen?, turm?, andock: [{ id, p, n, u, groesse: 'S'|'M'|'L', art: 'rumpf'|'anbau'|'turm', dreh: [..], stecker? }] }`.
  Entwurf `{ name, kennung, version: 1, teile: [{ nr, modul, an?: { nr, punkt }, punkt?, dreh? }] }` (Baum, Startteil = kleinste nr).
  Andocken: R·n_K = −n_E, R·u_K = u_E, dann `dreh` Vierteldrehungen um n_E; Lage `{ m (zeilenweise, ganzzahlig), t }`.
  Passt: gleiche Größe + Art, bei art ≠ rumpf Buchse (Eltern) an Stecker (Kind); Drehung = Schnittmenge beider Punkte.
  `baue()` → `{ teile[{nr, modul, lage}], freiePunkte, verbunden, kugeln, tuerme[{nr, typ, s, lage}], duesen, werte, laenge, breite, hoehe, meldungen[{code, stufe, text, nr?}], flugfaehig }`.
- `erstelleSimWelt(typ)` → `{ schiff, feld, typ, daten, werte, waehle(typ), schritt(dt, befehl) → kollision, zuruecksetzen() }`
- `erstelleSchiffSim(werte)` → `{ z, werte, schritt(dt, befehl), zuruecksetzen(), setzeWerte(w), lage(alpha, pos, rot) }`
  `befehl = { hebel, stopp, gieren, nicken, rollen, quer, hoch, nachbrenner, daempferUmschalten }`; `z.hp`, `z.zerstoert`
- `kollidiere(z, kugeln, feld, werte)` → `{ treffer, schaden, kontakte[{punkt, normale, tempo, feld, kugel}] }` (wiederverwendet)
- `SCHIFFSDATEN.<typ>.tuerme[i]` = `{ id, x, y, z, oben, typ: 'flak'|'schwer', s, sockel, zapfen, muendungen, gier:[mitte, halbweite], nick:[min,max] }`
  — Winkel im Turm-Rahmen (siehe `src/sim/schiffe/turm.js`)
- `erstelleBollwerk(scene)` / `erstelleAmbos(scene)` → `{ name, kennung, laenge, gruppe, tuerme[{gruppe, drehkranz, wiege, rohre, muendungen}], darstellen(pos, rot, z, zeit, dt) }`
- Debug: `spiel.ansicht(name)` (heck, seite, bug, oben, unten, weit) friert ein, `spiel.standbildWeg()`,
  `spiel.takt(n, befehl)` (rechnet die ganze Sim-Welt), `spiel.bildzeit(n)`, `spiel.befehlErsatz = {hebel: 1, …}`, `spiel.welt`.

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
| `src/main.js` | Start, Hauptschleife (feste Sim 60 Hz + interpolierte Darstellung), `window.spiel` |
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
| `tests/waffen.mjs`, `tests/ki.mjs` | Flak-Messungen (Richtzeit, Schuss/s, Durchflug, Gleichlauf) · KI-Messungen (Vorhalt, Abdeckung, Drohnen-Langlauf) |

## Schnittstellen
- `erstelleSimWelt(typ)` → `{ schiff, feld, typ, daten, werte, waehle(typ), schritt(dt, befehl) → kollision, zuruecksetzen() }`
- `erstelleSchiffSim(werte)` → `{ z, werte, schritt(dt, befehl), zuruecksetzen(), setzeWerte(w), lage(alpha, pos, rot) }`
  `befehl = { hebel, stopp, gieren, nicken, rollen, quer, hoch, nachbrenner, daempferUmschalten }`; `z.hp`, `z.zerstoert`
- `kollidiere(z, kugeln, feld, werte)` → `{ treffer, schaden, kontakte[{punkt, normale, tempo, feld, kugel}] }` (wiederverwendet)
- `SCHIFFSDATEN.<typ>.tuerme[i]` = `{ id, x, y, z, oben, typ: 'flak'|'schwer', s, sockel, zapfen, muendungen, gier:[mitte, halbweite], nick:[min,max] }`
  — Winkel im Turm-Rahmen (siehe `src/sim/schiffe/turm.js`)
- `erstelleBollwerk(scene)` / `erstelleAmbos(scene)` → `{ name, kennung, laenge, gruppe, tuerme[{gruppe, drehkranz, wiege, rohre, muendungen}], darstellen(pos, rot, z, zeit, dt) }`
- Debug: `spiel.ansicht(name)` (heck, seite, bug, oben, unten, weit) friert ein, `spiel.standbildWeg()`,
  `spiel.takt(n, befehl)` (rechnet die ganze Sim-Welt), `spiel.bildzeit(n)`, `spiel.befehlErsatz = {hebel: 1, …}`, `spiel.welt`.

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
| `src/sim/werte.js`, `src/sim/schiff.js` | Flugwerte, Flugmodell (rein, testbar) |
| `src/grafik/renderer.js` | Renderer, Sonne + Schatten, Spiegel-Umgebung, Bloom, AgX |
| `src/grafik/weltraum.js` | Nebel/Milchstraße, Sterne, Sonne, Gasriese (folgen der Kamera) |
| `src/grafik/staub.js`, `asteroiden.js` | Raumstaub-Striche, Asteroidenfeld |
| `src/grafik/schiff/bollwerk.js` | Schlachtträger „BT-12 Bollwerk“ (Hauptschiff) |
| `src/grafik/schiff/ambos.js` | Fregatte „FK-07 Ambos“ (gesichertes erstes Design) |
| `src/grafik/schiff/bauteile.js`, `texturen.js` | gemeinsame Bausteine + Effekte, Rumpf-Texturen |
| `src/grafik/kamera.js` | Außenkamera |
| `tests/flug.mjs` | Messflüge: Fahrt, Bremsen, Drehraten, Drift, Treiben, Gleichlauf |

## Schnittstellen
- `erstelleSchiffSim()` → `{ z, schritt(dt, befehl), zuruecksetzen(), lage(alpha, pos, rot) }`
  `befehl = { hebel, stopp, gieren, nicken, rollen, quer, hoch, nachbrenner, daempferUmschalten }`
- `erstelleBollwerk(scene)` / `erstelleAmbos(scene)` → `{ name, kennung, laenge, gruppe, tuerme, darstellen(pos, rot, z, zeit, dt) }`
- Debug: `spiel.ansicht(name)` (heck, seite, bug, oben, unten, weit) friert ein, `spiel.standbildWeg()`,
  `spiel.takt(n, befehl)`, `spiel.bildzeit(n)`, `spiel.befehlErsatz = {hebel: 1, …}`.

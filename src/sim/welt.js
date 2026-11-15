// ZWECK: Die Simulations-Welt — alles, was im festen Schritt gerechnet wird, an einer Stelle und in fester Reihenfolge.
// LIEFERT: erstelleSimWelt(typ = 'bollwerk') → { schiff, feld, typ, daten, werte, waehle(typ), schritt(dt, befehl),
//          zuruecksetzen(), letzteKollision }
// REIHENFOLGE je Schritt: Schiff fliegt → Kollision mit dem Feld. (Runde 6/7 kommen dazu: Drohnen-KI → Turm-KI →
//          Waffen/Geschosse → Treffer.) WARUM fest: Gleichlauf für Koop — jeder Rechner muss exakt gleich rechnen.
// REGEL: kein DOM, kein three-Renderer, kein Math.random; Grafik liest nur.
import { erstelleSchiffSim } from './schiff.js';
import { WERTE } from './werte.js';
import { SCHIFFSDATEN } from './schiffe/index.js';
import { erstelleFeld } from './feld.js';
import { kollidiere } from './kollision.js';

export function erstelleSimWelt(start = 'bollwerk') {
  let typ = start;
  const feld = erstelleFeld();
  const schiff = erstelleSchiffSim(WERTE[typ]);
  let letzteKollision = null;

  return {
    schiff, feld,
    get typ() { return typ; },
    get daten() { return SCHIFFSDATEN[typ]; },
    get werte() { return WERTE[typ]; },
    get letzteKollision() { return letzteKollision; },
    /** Schiffstyp wechseln (V): andere Flugwerte und Kollisionskugeln, Lage und HP-Anteil bleiben. */
    waehle(t) { if (!WERTE[t]) return; typ = t; schiff.setzeWerte(WERTE[t]); },
    schritt(dt, befehl) {
      schiff.schritt(dt, befehl);
      letzteKollision = kollidiere(schiff.z, SCHIFFSDATEN[typ].kugeln, feld, WERTE[typ]);
      return letzteKollision;
    },
    zuruecksetzen() { schiff.zuruecksetzen(); letzteKollision = null; },
  };
}

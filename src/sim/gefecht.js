// ZWECK: Sim-Welt des Gefechtstests (Runde 14, Nutzer: „das Schiff fliegen und von gegnerischen Schiffen angegriffen
//        werden“): Bollwerk (Flug + Kollision wie im Freiflug) mit 14 Flak-Türmen + Turm-KI im Schiffsrahmen gegen die
//        Angreifer-KI (Kanonenboote in Rotten, Autokanone).
// LIEFERT: erstelleGefecht() → { welt, schiff, flak, ki, angreifer, zieleLokal, daten, lafetten, zaehler, abschuesse,
//          schritt(dt, steuerBefehl, flakBefehl) → { kollision, treffer }, zuruecksetzen(), pruefsumme() }
// REIHENFOLGE je Schritt (Protokoll R14, Entscheidung 3):
//   1) Schiff fliegt + Kollision (welt.schritt)
//   2) Angreifer fliegen, verbuchen die Flak-Ereignisse des vorigen Schritts, schießen → Treffer am Schiff (hier verbucht)
//   3) Montage-Rahmen = Schiffslage NACH dem Schiffsschritt (flak.setzeRahmen)
//   4) Turm-KI bekommt die Ziele als Momentaufnahme im Schiffsrahmen (inSchiffsrahmen — nie Lagedifferenzen)
//   5) Flak führt aus (Welt-Ziele für den Schaden)
// REGEL: kein DOM, kein Math.random (jedes Modul hat einen Startwert), fester Schritt. Eigene Flak schadet dem eigenen
//        Schiff nicht (Entscheidung 5). Killzone am Schiff 900/1000 m (Entscheidung 6).
import { erstelleSimWelt } from './welt.js';
import { SCHIFFSDATEN, rumpfSperre } from './schiffe/index.js';
import { erstelleFlak } from './waffen/flak.js';
import { schiffsLafetten } from './waffen/lafetten.js';
import { erstelleTurmKi, TURMKI } from './ki/turmziel.js';
import { erstelleAngreifer } from './ki/angreifer.js';
import { inSchiffsrahmen } from './ki/schiffsrahmen.js';

const START = { flak: 303, ki: 202, angreifer: 101 };
const ABSCHUSS_VORRAT = 32;

export function erstelleGefecht() {
  const welt = erstelleSimWelt('bollwerk');
  const schiff = welt.schiff;
  const daten = SCHIFFSDATEN.bollwerk;
  const { lafetten, hindernisse } = schiffsLafetten(daten);
  const flak = erstelleFlak({ startwert: START.flak, lafetten, schiff: { hindernisse, rumpf: (l) => rumpfSperre(l, daten.teile) } });
  const ki = erstelleTurmKi({
    startwert: START.ki, lafetten, mitte: { x: 0, y: 0, z: 0 },
    killzone: { ...TURMKI.killzone, ein: 900, aus: 1000 }, erreichbar: flak.erreichbar,
  });
  const angreifer = erstelleAngreifer({ startwert: START.angreifer });
  let zieleLokal = [];
  const zaehler = { takt: 0, schuesse: 0, abschuesse: 0, trefferAmSchiff: 0, schadenAmSchiff: 0 };
  const abschuesse = Array.from({ length: ABSCHUSS_VORRAT }, () => ({ x: 0, y: 0, z: 0 }));
  const ergebnis = { kollision: null, treffer: 0 };

  function schritt(dt, steuerBefehl, flakBefehl) {
    // 1) Schiff + Kollision
    ergebnis.kollision = welt.schritt(dt, steuerBefehl);
    // 2) Angreifer (Flak-Ereignisse des vorigen Schritts), Treffer am Schiff verbuchen
    const a = angreifer.schritt(dt, flak.ereignisse, schiff.z, daten.kugeln);
    let schaden = 0;
    for (const t of a?.treffer ?? []) schaden += t.schaden;
    if (schaden > 0 && !schiff.z.zerstoert) {
      schiff.z.hp = Math.max(0, schiff.z.hp - schaden);
      if (schiff.z.hp <= 0) schiff.z.zerstoert = true;
      zaehler.trefferAmSchiff += a.treffer.length; zaehler.schadenAmSchiff += schaden;
    }
    ergebnis.treffer = schaden;
    for (const ab of a?.abschuesse ?? []) {
      const z = abschuesse[zaehler.abschuesse % ABSCHUSS_VORRAT];
      z.x = ab.pos.x; z.y = ab.pos.y; z.z = ab.pos.z;
      zaehler.abschuesse++;
    }
    // 3) Montage-Rahmen, 4) KI im Schiffsrahmen, 5) Flak
    flak.setzeRahmen(schiff.z);
    zieleLokal = inSchiffsrahmen(angreifer.ziele, schiff.z, zieleLokal);
    // WARUM kein Feuer als Wrack: ein zerstörtes Schiff hat keine Energie für die Türme
    const befehle = ki.schritt(dt, schiff.z.zerstoert ? { ...flakBefehl, feuerFrei: false } : flakBefehl, zieleLokal, flak.tuerme);
    flak.schritt(dt, befehle, angreifer.ziele);
    zaehler.schuesse += flak.ereignisse.schuesse.length;
    zaehler.takt++;
    return ergebnis;
  }

  function zuruecksetzen() {
    welt.zuruecksetzen(); flak.zuruecksetzen(); ki.zuruecksetzen?.(); angreifer.zuruecksetzen();
    for (const k of Object.keys(zaehler)) zaehler[k] = 0;
  }

  /** Gleichlauf: Schiffslage, Angreifer, Türme, Zähler. */
  function pruefsumme() {
    const z = schiff.z;
    let s = z.pos.x * 1.1 + z.pos.y * 1.3 + z.pos.z * 1.7 + z.hp + zaehler.schuesse * 7 + zaehler.abschuesse * 17;
    for (const g of angreifer.ziele) s += g.pos.x * 0.7 + g.pos.y * 0.9 + g.pos.z * 1.1 + g.hp;
    for (const t of flak.tuerme) s += t.gier * 3.1 + t.nick * 3.7;
    return s;
  }

  return {
    welt, schiff, flak, ki, angreifer, daten, lafetten, zaehler, abschuesse, schritt, zuruecksetzen, pruefsumme, START,
    get zieleLokal() { return zieleLokal; },
  };
}

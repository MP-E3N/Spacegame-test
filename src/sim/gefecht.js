// ZWECK: Sim-Welt des Gefechtstests (Runde 14, Nutzer: „das Schiff fliegen und von gegnerischen Schiffen angegriffen
//        werden“): Bollwerk (Flug + Kollision wie im Freiflug) mit 14 Flak-Türmen + Turm-KI im Schiffsrahmen gegen die
//        Angreifer-KI (Kanonenboote in Rotten, Autokanone).
// LIEFERT: erstelleGefecht({ typ?, daten?, werte? } = {}) → { welt, schiff, flak, ki, angreifer, zieleLokal, daten, lafetten,
//          zaehler, abschuesse, schritt(dt, steuerBefehl, flakBefehl) → { kollision, treffer }, zuruecksetzen(), pruefsumme(),
//          typ, istForm, stumm [{ index, id }], schussfeld [0..1 je Lafette], abstaende (Form) | null, hoehenfeld | null,
//          ueberzaehlig (Türme über 255, nicht bewaffnet) } · formAbstaende(daten) · GEFECHT_FORM
// REIHENFOLGE je Schritt (Protokoll R14, Entscheidung 3):
//   1) Schiff fliegt + Kollision (welt.schritt)
//   2) Angreifer fliegen, verbuchen die Flak-Ereignisse des vorigen Schritts, schießen → Treffer am Schiff (hier verbucht)
//   3) Montage-Rahmen = Schiffslage NACH dem Schiffsschritt (flak.setzeRahmen)
//   4) Turm-KI bekommt die Ziele als Momentaufnahme im Schiffsrahmen (inSchiffsrahmen — nie Lagedifferenzen)
//   5) Flak führt aus (Welt-Ziele für den Schaden)
// REGEL: kein DOM, kein Math.random (jedes Modul hat einen Startwert), fester Schritt. Eigene Flak schadet dem eigenen
//        Schiff nicht (Entscheidung 5). Killzone am Schiff 900/1000 m (Entscheidung 6).
// FORM-SCHIFF (R21, Nutzer: „ich kann gespeicherte Formen nicht im Gefecht testen“):
//   erstelleGefecht({ typ, daten, werte }) mit daten = formZuSchiff(form) (tuerme, kugeln, laenge, form, versatz; OHNE teile).
//   - Ohne Argument, mit {} oder { typ: 'bollwerk' }: exakt der alte Weg (bitgleich, Bezugswerte R21).
//   - typ = eindeutiger Name je Form (Aufrufer, z. B. formId(name)); fehlt er, gilt 'form:' + daten.name. erstelleGefecht
//     registriert selbst (registriereSchiff). WARUM eindeutig: welt.js liest SCHIFFSDATEN[typ] je Schritt — eine spätere
//     Registrierung unter demselben Namen verstellte ein laufendes Gefecht. 'bollwerk'/'ambos' mit daten → Fehler.
//   - Rumpf-Sperre aus dem Höhenfeld der Form (formHoehenfeld, geschuetze.js), in Schiffs-Koordinaten (um versatz).
//   - Abstände der Angreifer und Zünder-Mindestabstand aus der Schiffsgröße (formAbstaende), Vorräte mit der Turmzahl.
//   - stumm = Türme, die nirgends feuern können (Montagefehler bleiben drin und werden hier gemeldet; grund 'im_rumpf' =
//     Zapfen steckt im Material → Turm ganz gesperrt, sonst 'kein_schussfeld');
//     schussfeld[i] = Anteil erreichbarer Richtungen (Gier × Nick in den Turm-Grenzen) — für beide Wege berechnet.
import { erstelleSimWelt } from './welt.js';
import { SCHIFFSDATEN, rumpfSperre, registriereSchiff } from './schiffe/index.js';
import { erstelleFlak, FLAK } from './waffen/flak.js';
import { schiffsLafetten } from './waffen/lafetten.js';
import { erstelleTurmKi, TURMKI } from './ki/turmziel.js';
import { erstelleAngreifer, ANGREIFER } from './ki/angreifer.js';
import { inSchiffsrahmen } from './ki/schiffsrahmen.js';
import { formHoehenfeld } from './form/geschuetze.js';
import { punktInForm } from './form/kugeln.js';
import { koerperListe } from './form/form.js';

const START = { flak: 303, ki: 202, angreifer: 101 };
const ABSCHUSS_VORRAT = 32;
const FEST = new Set(['bollwerk', 'ambos']);

/** Werte des Form-Wegs. WARUM diese Zahlen: aus dem Bollwerk abgeleitet (Rumpf reicht R ≈ 133 m weit → mindest 170,
 *  Zünder 150, rumpfZiel 90 ≈ 0,35 · 255 m, Vorrat 640 / 14 Türme, Splitter 256 / 14). */
export const GEFECHT_FORM = {
  mindestRand: 37, zuenderRand: 17, rumpfZielAnteil: 0.35, rumpfZielMin: 5,
  geschosseJeTurm: 46, splitterJeTurm: 19, turmMax: 255, // flak.js merkt den Turm je Granate in einem Uint8Array
  schussfeldGier: 48, schussfeldNick: 8,
};

/** Reichweite des Rumpfs (m, Schiffsmitte) aus den Kollisionskugeln → Abstände der Angreifer und des Zünders. */
export function formAbstaende(daten) {
  const G = GEFECHT_FORM, A = ANGREIFER;
  let R = 0;
  for (const k of daten.kugeln ?? []) R = Math.max(R, Math.hypot(k.x, k.y, k.z) + k.r);
  const mindest = R + G.mindestRand;
  // WARUM nur nach oben verschieben: bei kleinen Schiffen bleiben Feuer-/Abdreh-Abstände wie beim Bollwerk (lesbare
  // Läufe); bei großen wächst alles um den Überschuss, sonst drehten die Boote erst im Rumpf ab
  const plus = Math.max(0, mindest - A.mindest);
  return {
    R, zuender: R + G.zuenderRand,
    angreifer: { mindest, rumpfZiel: Math.max(G.rumpfZielMin, G.rumpfZielAnteil * (daten.laenge ?? 2 * R)),
      feuerAb: A.feuerAb + plus, abdrehen: A.abdrehen + plus, ausholen: A.ausholen + plus, sammeln: A.sammeln + plus, start: A.start + plus },
  };
}

/** Steckt der Wiegen-Drehkreis des Turms (Zapfenhöhe, Kranzachse + Kreis mit Radius zapfen.z) im Material der Form? */
function zapfenImRumpf(form, t, versatz) {
  const sg = t.oben ? 1 : -1, y = t.y + sg * t.zapfen.y - versatz[1], liste = koerperListe(form);
  const punkte = [[0, 0]];
  for (let j = 0; j < 8; j++) punkte.push([Math.sin(j * Math.PI / 4) * t.zapfen.z, Math.cos(j * Math.PI / 4) * t.zapfen.z]);
  return punkte.some(([dx, dz]) => punktInForm(null, [t.x + dx - versatz[0], y, t.z + dz - versatz[2]], liste));
}

/** Anteil erreichbarer Richtungen je Turm (Gier-Raster × Nick-Raster innerhalb der Turm-Grenzen). */
function schussfelder(flak, lafetten) {
  const G = GEFECHT_FORM;
  return lafetten.map((l, i) => {
    const voll = l.gier[1] >= Math.PI - 1e-6;
    let frei = 0, alle = 0;
    for (let a = 0; a < G.schussfeldGier; a++) {
      const g = voll ? -Math.PI + (a + 0.5) * 2 * Math.PI / G.schussfeldGier : l.gier[0] - l.gier[1] + (a + 0.5) * 2 * l.gier[1] / G.schussfeldGier;
      for (let b = 0; b < G.schussfeldNick; b++) {
        const n = l.nick[0] + (b + 0.5) * (l.nick[1] - l.nick[0]) / G.schussfeldNick;
        alle++; if (flak.erreichbar(i, g, n)) frei++;
      }
    }
    return alle ? frei / alle : 0;
  });
}

export function erstelleGefecht({ typ, daten: formDaten, werte: formWerte } = {}) {
  const istForm = !!formDaten;
  const name = typ ?? (istForm ? 'form:' + formDaten.name : 'bollwerk');
  if (istForm) {
    if (FEST.has(name)) throw new Error(`erstelleGefecht: Form-Schiff darf nicht als „${name}“ registriert werden`);
    registriereSchiff(name, formDaten, formWerte ?? formDaten.werte);
  }
  const welt = erstelleSimWelt(name);
  const schiff = welt.schiff;
  const daten = SCHIFFSDATEN[name]; // beim Start festgehalten (Flak, Angreifer-Treffer)
  let { lafetten, hindernisse } = schiffsLafetten(daten);
  let flak, angreifer, abstaende = null, hoehenfeld = null, ueberzaehlig = 0, grundImRumpf = null;
  if (!istForm) {
    flak = erstelleFlak({ startwert: START.flak, lafetten, schiff: { hindernisse, rumpf: (l) => rumpfSperre(l, daten.teile) } });
  } else {
    const G = GEFECHT_FORM;
    if (lafetten.length > G.turmMax) { ueberzaehlig = lafetten.length - G.turmMax; lafetten = lafetten.slice(0, G.turmMax); }
    abstaende = formAbstaende(daten);
    hoehenfeld = daten.form ? formHoehenfeld(daten.form, daten.versatz ?? [0, 0, 0]) : null;
    const quelle = hoehenfeld;
    // WARUM gesperrt statt nur Sperre: steckt der Zapfen im Material (Montagefehler im_rumpf), beginnt jeder Strahl im
    // Rumpf — die Höhen-Sperre lässt dann noch steile Schüsse zu (Messung R21: 735 von 1470 Probestrahlen im Rumpf).
    const imRumpf = new Set(lafetten.filter((l) => daten.form && zapfenImRumpf(daten.form, l, daten.versatz ?? [0, 0, 0])));
    const rumpf = (l) => {
      if (imRumpf.has(l)) return new Float64Array(32).fill(Math.PI); // kein Nick erreicht π → nie feuern
      return quelle ? rumpfSperre(l, quelle) : null;
    };
    grundImRumpf = imRumpf;
    flak = erstelleFlak({ startwert: START.flak, lafetten, schiff: {
      hindernisse, rumpf, mindestAbstand: abstaende.zuender,
      poolGeschosse: Math.max(FLAK.poolGeschosseSchiff, G.geschosseJeTurm * lafetten.length),
      poolSplitter: Math.max(FLAK.poolSplitterSchiff, G.splitterJeTurm * lafetten.length),
    } });
  }
  const ki = erstelleTurmKi({
    startwert: START.ki, lafetten, mitte: { x: 0, y: 0, z: 0 },
    killzone: { ...TURMKI.killzone, ein: 900, aus: 1000 }, erreichbar: flak.erreichbar,
  });
  angreifer = istForm ? erstelleAngreifer({ startwert: START.angreifer, abstand: abstaende.angreifer })
    : erstelleAngreifer({ startwert: START.angreifer });
  const schussfeld = schussfelder(flak, lafetten);
  const stumm = [];
  schussfeld.forEach((f, i) => {
    if (f === 0) stumm.push({ index: i, id: lafetten[i].id, grund: grundImRumpf?.has(lafetten[i]) ? 'im_rumpf' : 'kein_schussfeld' });
  });
  let zieleLokal = [];
  const zaehler = { takt: 0, schuesse: 0, abschuesse: 0, trefferAmSchiff: 0, schadenAmSchiff: 0 };
  const abschuesse = Array.from({ length: ABSCHUSS_VORRAT }, () => ({ x: 0, y: 0, z: 0 }));
  const ergebnis = { kollision: null, treffer: 0 };
  const halt = {}; // Haltebefehl für das Wrack — WARUM fest angelegt: keine neuen Objekte im Schritt (Befund Prüfer R14)

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
    let fb = flakBefehl;
    if (schiff.z.zerstoert) { Object.assign(halt, flakBefehl); halt.feuerFrei = false; fb = halt; }
    const befehle = ki.schritt(dt, fb, zieleLokal, flak.tuerme);
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
    typ: name, istForm, stumm, schussfeld, abstaende, hoehenfeld, ueberzaehlig,
    get zieleLokal() { return zieleLokal; },
  };
}

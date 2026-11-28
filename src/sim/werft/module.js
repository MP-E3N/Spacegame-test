// ZWECK: Modul-Katalog des Schiffs-Baukastens (Runde 15): Rumpf-, Bug-, Heck-, Hangar-, Anbau- und Turm-Module mit
//        Querschnitten, Andockpunkten, Hüllquadern, Kugeln und Werten — reine Daten, ohne three.
// LIEFERT: NORM ({ M, L } Normquerschnitte) · MODULE (Liste) · KATALOG (id → Modul) · LAFETTE (Halbmaß der Turmplatte)
// REGEL (Entscheidungen E1–E5, Protokoll Runde 15):
//   - Modul-Koordinaten wie ein Schiff: Meter, +Z vorn, +X Backbord, +Y oben. Lofts nur entlang Z (rumpf.js/bauteile.js);
//     der Zusammenbau dreht ganze Module (90°-Schritte).
//   - Andockpunkt { id, p, n, u, groesse, art, dreh }: p auf dem 0,5-m-Raster AUF der Fläche, n = Achse nach außen,
//     u = Bezugsachse ⟂ n (Rumpfflächen und Seiten u = +Y, Punkte mit n = ±Y: u = +Z). Passt nur gleiche Größe + Art.
//   - Jede Rumpffläche (art 'rumpf') endet GENAU im Normquerschnitt NORM[groesse] mit Mitte x = y = 0 — WARUM: dann
//     passen zwei Module nahtlos; w ≠ h, darum dreh nur [0, 2].
//   - Turmpunkte (art 'turm', S) liegen auf einer Lafettenplatte, deren Oberkante aus fusspunkt() kommt (aufgerundet aufs
//     Raster) — WARUM Platte im Elternmodul: der Turm steht dann immer eben auf y = 0, seine Grafik hängt nicht vom
//     Elternpunkt ab (zwischenspeicherbar). Turm-Module: Ursprung = Fußpunkt, eigener Punkt n = −Y, u = +Z.
//   - quader = Hüllquader jedes Lofts/jeder Kiste/jeder Düse (Überschneidung, E5). Grafik darf höchstens 0,5 m darüber
//     hinausragen (dünne Luken, Leisten). teile[].mat und kisten[].mat sind Grafik-Hinweise (Material-Eimer).
//   - Spiegelpaare _bb/_sb (E4) entstehen aus gespiegelten Daten (x → −x), nie per Spiegelmatrix.
import { fusspunkt, masse } from '../schiffe/rumpf.js';
import { TURM, turmDaten } from '../schiffe/turm.js';

export const NORM = { M: { w: 10, h: 8, fase: 0.3 }, L: { w: 18, h: 13, fase: 0.3 } };
/** Halbmaß der quadratischen Lafettenplatte — trägt auch den schweren Turm (s 1,3: Fußradius 3,51 m). */
export const LAFETTE = 3.8;
const DICHTE = 0.06; // t je m³ Hüllquader — nur für die Anzeige im Editor
/** Aufbau-Zone (Kisten der Grafik): so weit dürfen Kisten über Ober-/Unterkante bzw. die Seitenwand ragen. WARUM in den
 *  Daten: die Hüllquader müssen sie enthalten (Überschneidung), und die Grafik hält sich genau an diese Grenzen. */
export const AUFBAU = { hoehe: 1.2, seite: 0.6 };

const raster = (v) => Math.round(v * 2) / 2;
const T = (name, ab, fase, mat = 'rumpf') => ({ name, ab, fase, mat });
const N = (g, z, mehr = {}) => ({ z, w: NORM[g].w, h: NORM[g].h, ...mehr });
const K = (b, h, t, x, y, z, mat = 'dunkel', zeichnen = true) => ({ b, h, t, x, y, z, mat, zeichnen });
const rumpfPunkt = (id, z, vorn, g) => ({ id, p: [0, 0, z], n: [0, 0, vorn ? 1 : -1], u: [0, 1, 0], groesse: g, art: 'rumpf', dreh: [0, 2] });
const seitenPunkt = (id, x, z) => ({ id, p: [x, 0, z], n: [Math.sign(x), 0, 0], u: [0, 1, 0], groesse: 'S', art: 'anbau', dreh: [0, 2] });

// ---------------- Rohdaten ----------------
// lafetten: [{ id, x, z, oben }] → Turmpunkt + Platte (fertig()).
// aufbau: { loftName: 'ous' } — wo die Grafik Kisten setzt (o = oben, u = unten, s = beide Seiten, p/m = nur Seite +X/−X);
//         vergrößert den Hüllquader um AUFBAU.

const ROH = [];

// Kommandomodul: gepanzerter Brückenblock ohne Fenster, zweistufig, mit Sensorblock und Antennen.
ROH.push({
  id: 'kommando_m', name: 'Kommando', art: 'kommando', grafik: 'kommando',
  teile: [
    T('rumpf', [N('M', -17), N('M', 17)], NORM.M.fase),
    T('bruecke', [{ z: -6, w: 6.5, h: 2.5, y: 9.5 }, { z: -3, w: 7.5, h: 3.5, y: 10.5 }, { z: 9, w: 7, h: 3.5, y: 10.5 },
      { z: 12, w: 5, h: 2.5, y: 9.5 }], 0.35),
    T('bruecke2', [{ z: -1, w: 4.5, h: 1.2, y: 14.5 }, { z: 6, w: 4, h: 1.2, y: 14.5 }], 0.4, 'dunkel'),
    T('kiel', [{ z: -14, w: 4, h: 0.8, y: -8.4 }, { z: 14, w: 4, h: 0.8, y: -8.4 }], 0.5, 'dunkel'),
  ],
  kisten: [K(2.4, 1.4, 3, 2.5, 16.3, 1, 'metall'), K(0.4, 5, 0.4, -2, 18.2, 4, 'metall'), K(5, 0.35, 0.35, -2, 20.2, 4),
    K(0.35, 3, 0.35, 1.5, 17, -0.5, 'metall')],
  punkte: [rumpfPunkt('vorn', 17, true, 'M'), rumpfPunkt('hinten', -17, false, 'M')],
  lafetten: [{ id: 'oben', x: 0, z: -11.5, oben: true }, { id: 'unten', x: 0, z: 2, oben: false }],
  werte: { besatzung: 90, panzer: 10 },
});

// Bug M: Meißelbug, Rückenpanzer, Flankenwangen, Rammsporn unten.
ROH.push({
  id: 'bug_m', name: 'Bug (M)', art: 'bug', grafik: 'bug',
  teile: [
    T('rumpf', [N('M', -20), { z: 0, w: 9.5, h: 7.5, y: -0.5 }, { z: 14, w: 6.5, h: 5, y: -1.5 }, { z: 20, w: 3, h: 2.2, y: -2.5 }], 0.3),
    T('panzer', [{ z: -18, w: 7, h: 1.2, y: 8.6 }, { z: 10, w: 5.5, h: 1, y: 5 }], 0.5),
    T('wange_bb', [{ z: -12, w: 1.2, h: 4, x: 9.9, y: -1 }, { z: 10, w: 1.2, h: 3, x: 7.6, y: -1.5 }], 0.5, 'dunkel'),
    T('wange_sb', [{ z: -12, w: 1.2, h: 4, x: -9.9, y: -1 }, { z: 10, w: 1.2, h: 3, x: -7.6, y: -1.5 }], 0.5, 'dunkel'),
    T('sporn', [{ z: 4, w: 3, h: 1.2, y: -8.2 }, { z: 18, w: 1.2, h: 0.8, y: -5.3 }], 0.4, 'dunkel'),
  ],
  punkte: [rumpfPunkt('hinten', -20, false, 'M')],
  lafetten: [{ id: 'oben', x: 0, z: -10, oben: true }, { id: 'unten', x: 0, z: -9, oben: false }],
  werte: { panzer: 25 },
});

// Bug L: breiter Meißelbug mit zwei Panzerstufen.
ROH.push({
  id: 'bug_l', name: 'Bug (L)', art: 'bug', grafik: 'bug',
  teile: [
    T('rumpf', [N('L', -27.5), { z: -5, w: 17, h: 12, y: -0.5 }, { z: 15, w: 12, h: 8.5, y: -2 }, { z: 27.5, w: 5, h: 3.5, y: -4 }], 0.3),
    T('panzer', [{ z: -25, w: 12, h: 1.6, y: 13.6 }, { z: 8, w: 10, h: 1.4, y: 8.9 }], 0.5),
    T('panzer2', [{ z: -20, w: 6, h: 1.2, y: 15.2 }, { z: -6, w: 5.5, h: 1.2, y: 13 }], 0.5, 'dunkel'),
    T('wange_bb', [{ z: -18, w: 1.4, h: 6, x: 18, y: -1 }, { z: 14, w: 1.4, h: 4.5, x: 12.6, y: -2 }], 0.5, 'dunkel'),
    T('wange_sb', [{ z: -18, w: 1.4, h: 6, x: -18, y: -1 }, { z: 14, w: 1.4, h: 4.5, x: -12.6, y: -2 }], 0.5, 'dunkel'),
    T('sporn', [{ z: 0, w: 4.5, h: 1.6, y: -13.3 }, { z: 25, w: 1.4, h: 0.9, y: -7.8 }], 0.4, 'dunkel'),
  ],
  punkte: [rumpfPunkt('hinten', -27.5, false, 'L')],
  lafetten: [{ id: 'oben_hinten', x: 0, z: -14, oben: true }, { id: 'oben_vorn', x: 0, z: 2, oben: true },
    { id: 'unten', x: 0, z: -17, oben: false }],
  werte: { panzer: 35 },
});

// Rumpf M kurz: Versorgungssegment (Lüfterblöcke), je Seite ein Anbaupunkt.
ROH.push({
  id: 'rumpf_m_kurz', name: 'Rumpf kurz (M)', art: 'rumpf', grafik: 'rumpf',
  teile: [T('rumpf', [N('M', -8), N('M', 8)], NORM.M.fase)],
  punkte: [rumpfPunkt('vorn', 8, true, 'M'), rumpfPunkt('hinten', -8, false, 'M'), seitenPunkt('bb', 10, 0), seitenPunkt('sb', -10, 0)],
  lafetten: [{ id: 'oben', x: 0, z: 0, oben: true }, { id: 'unten', x: 0, z: 0, oben: false }],
  werte: { besatzung: 10 },
});

// Rumpf M lang: Mittelpanzer zwischen den Lafetten, Kiel, je Seite zwei Anbaupunkte.
ROH.push({
  id: 'rumpf_m_lang', name: 'Rumpf lang (M)', art: 'rumpf', grafik: 'rumpf',
  teile: [
    T('rumpf', [N('M', -20), N('M', 20)], NORM.M.fase),
    T('panzer', [{ z: -4, w: 6, h: 0.8, y: 8.4 }, { z: 4, w: 6, h: 0.8, y: 8.4 }], 0.5, 'dunkel'),
    T('kiel', [{ z: -18, w: 4, h: 0.8, y: -8.4 }, { z: 18, w: 4, h: 0.8, y: -8.4 }], 0.5, 'dunkel'),
  ],
  punkte: [rumpfPunkt('vorn', 20, true, 'M'), rumpfPunkt('hinten', -20, false, 'M'),
    seitenPunkt('bb_vorn', 10, 10), seitenPunkt('bb_hinten', 10, -10), seitenPunkt('sb_vorn', -10, 10), seitenPunkt('sb_hinten', -10, -10)],
  lafetten: [{ id: 'oben_vorn', x: 0, z: 10, oben: true }, { id: 'oben_hinten', x: 0, z: -10, oben: true },
    { id: 'unten_vorn', x: 0, z: 10, oben: false }, { id: 'unten_hinten', x: 0, z: -10, oben: false }],
  werte: { besatzung: 20, panzer: 5 },
});

// Rumpf L: Rückenpanzer in zwei Stufen, Kiel, je Seite zwei Anbaupunkte.
ROH.push({
  id: 'rumpf_l', name: 'Rumpf (L)', art: 'rumpf', grafik: 'rumpf',
  teile: [
    T('rumpf', [N('L', -20), N('L', 20)], NORM.L.fase),
    T('panzer', [{ z: -18, w: 12, h: 1.4, y: 13.6 }, { z: 18, w: 12, h: 1.4, y: 13.6 }], 0.5),
    T('panzer2', [{ z: -4.5, w: 6, h: 1, y: 15.4 }, { z: 4.5, w: 6, h: 1, y: 15.4 }], 0.5, 'dunkel'),
    T('kiel', [{ z: -18, w: 6, h: 1, y: -13.4 }, { z: 18, w: 6, h: 1, y: -13.4 }], 0.5, 'dunkel'),
  ],
  punkte: [rumpfPunkt('vorn', 20, true, 'L'), rumpfPunkt('hinten', -20, false, 'L'),
    seitenPunkt('bb_vorn', 18, 10), seitenPunkt('bb_hinten', 18, -10), seitenPunkt('sb_vorn', -18, 10), seitenPunkt('sb_hinten', -18, -10)],
  lafetten: [{ id: 'oben_vorn', x: 0, z: 10, oben: true }, { id: 'oben_hinten', x: 0, z: -10, oben: true },
    { id: 'unten_vorn', x: 0, z: 10, oben: false }, { id: 'unten_hinten', x: 0, z: -10, oben: false }],
  werte: { besatzung: 40, panzer: 15 },
});

// Übergang L (hinten) → M (vorn): 45°-Schulter, kein runder Hals.
ROH.push({
  id: 'uebergang_ml', name: 'Übergang M–L', art: 'uebergang', grafik: 'uebergang',
  teile: [T('rumpf', [N('L', -10), N('L', -1), N('M', 7), N('M', 10)], NORM.L.fase)],
  punkte: [rumpfPunkt('vorn', 10, true, 'M'), rumpfPunkt('hinten', -10, false, 'L')],
  lafetten: [{ id: 'oben', x: 0, z: -5.5, oben: true }, { id: 'unten', x: 0, z: -5.5, oben: false }],
  werte: { besatzung: 10 },
});

// Heck M: zwei achteckige Triebwerke, Heckpanzer, Kühlrippen unten.
ROH.push({
  id: 'heck_m', name: 'Heck (M)', art: 'heck', grafik: 'heck',
  teile: [
    T('rumpf', [N('M', -13), N('M', 13)], NORM.M.fase),
    T('panzer', [{ z: -12, w: 7, h: 1.2, y: 8.6 }, { z: 8, w: 6, h: 1, y: 8.4 }], 0.5),
  ],
  kisten: [K(14, 1.8, 16, 0, -8.8, -3, 'dunkel', false), K(1.2, 8, 2.5, 0, 0, -14.2)],
  duesen: [{ p: [4.6, 0, -13], r: 3.4, l: 6 }, { p: [-4.6, 0, -13], r: 3.4, l: 6 }],
  punkte: [rumpfPunkt('vorn', 13, true, 'M')],
  lafetten: [{ id: 'oben', x: 0, z: -2, oben: true }],
  werte: { schub: 2, besatzung: 15 },
});

// Heck L: sechs achteckige Triebwerke im 3×2-Raster mit Rahmen, gestufter Heckpanzer, Kühlrippen unten.
ROH.push({
  id: 'heck_l', name: 'Heck (L)', art: 'heck', grafik: 'heck',
  teile: [
    T('rumpf', [N('L', -18), N('L', 18)], NORM.L.fase),
    T('panzer', [{ z: -16, w: 13, h: 1.4, y: 13.6 }, { z: 12, w: 11, h: 1.4, y: 13.6 }], 0.5),
    T('panzer2', [{ z: -13, w: 7, h: 1, y: 15.6 }, { z: -2, w: 6.5, h: 1, y: 15.6 }], 0.5, 'dunkel'),
  ],
  kisten: [K(26, 2.6, 24, 0, -14.2, -2, 'dunkel', false),
    K(35, 1.2, 3, 0, 0, -19), K(1.2, 25, 3, 6, 0, -19), K(1.2, 25, 3, -6, 0, -19)],
  duesen: [6.5, -6.5].flatMap((y) => [12, 0, -12].map((x) => ({ p: [x, y, -18], r: 4.6, l: 6 }))),
  punkte: [rumpfPunkt('vorn', 18, true, 'L')],
  lafetten: [{ id: 'oben', x: 0, z: 5, oben: true }],
  werte: { schub: 6, besatzung: 30 },
});

// Hangar-Seitenrumpf (Backbord, +X): liegt mit der Innenwand direkt an der Hülle; Startschächte vorn, Landedeck unten.
// WARUM zwei Innenpunkte (z ±10): sie decken sich mit den Seitenpunkten der langen Rümpfe — der zweite schließt den
// Ring (E3), der Hangar sitzt fest an beiden. dreh nur [0]: gedreht stünde das Landedeck oben oder die Schächte hinten.
const HX = 7.5;
ROH.push({
  id: 'hangar_s_bb', name: 'Hangar (Backbord)', art: 'hangar', grafik: 'hangar', seite: 1,
  teile: [T('rumpf', [{ z: -22, w: 6, h: 4.8, x: HX, y: -1 }, { z: -18, w: 7.5, h: 6, x: HX, y: -1 },
    { z: 16, w: 7.5, h: 6, x: HX, y: -1 }, { z: 22, w: 6, h: 4.8, x: HX, y: -1 }], 0.3)],
  kisten: [K(2, 1.2, 36, 1.2, 4.2, -1), K(2.4, 1.6, 1.2, 1.2, 4.6, -12), K(2.4, 1.6, 1.2, 1.2, 4.6, 8)],
  punkte: [{ id: 'innen_vorn', p: [0, 0, 10], n: [-1, 0, 0], u: [0, 1, 0], groesse: 'S', art: 'anbau', dreh: [0], stecker: true },
    { id: 'innen_hinten', p: [0, 0, -10], n: [-1, 0, 0], u: [0, 1, 0], groesse: 'S', art: 'anbau', dreh: [0], stecker: true }],
  lafetten: [{ id: 'oben', x: HX, z: -8, oben: true }],
  werte: { besatzung: 40, jaeger: 6 },
});

// Panzerplatte: angeschraubter Seitenpanzer (20 m), symmetrisch — passt auf beide Seiten ohne Spiegelpaar.
ROH.push({
  id: 'panzerplatte', name: 'Panzerplatte', art: 'anbau', grafik: 'platte',
  teile: [T('platte', [{ z: -10, w: 0.5, h: 4.4, x: 0.5 }, { z: -9, w: 0.9, h: 5.2, x: 0.9 }, { z: 9, w: 0.9, h: 5.2, x: 0.9 },
    { z: 10, w: 0.5, h: 4.4, x: 0.5 }], 0.4, 'dunkel')],
  punkte: [{ id: 'innen', p: [0, 0, 0], n: [-1, 0, 0], u: [0, 1, 0], groesse: 'S', art: 'anbau', dreh: [0, 2], stecker: true }],
  werte: { panzer: 30 },
});

// Türme: Ursprung im Fußpunkt, Ruhelage gier 0 (Rohre nach +Z), nick 0.
const turmPunkt = () => ({ id: 'fuss', p: [0, 0, 0], n: [0, -1, 0], u: [0, 0, 1], groesse: 'S', art: 'turm', dreh: [0, 1, 2, 3], stecker: true });
const PI = Math.PI;
for (const [id, name, typ, s, nick] of [['turm_flak', 'Flak-Gatling', 'flak', 1, [-0.05, 1.45]], ['turm_schwer', 'Hauptbatterie', 'schwer', 1.3, [-0.1, 0.8]]]) {
  const fr = TURM.fussR * s, mz = (TURM.zapfenZ + TURM.rohrZ + TURM.rohrL / 2) * s;
  ROH.push({
    id, name, art: 'turm', grafik: 'turm', teile: [],
    quader: [{ min: [-fr, -0.1, -fr], max: [fr, 3.4 * s, fr] },
      { min: [-(TURM.rohrX + TURM.mantelR) * s, (TURM.zapfenY - TURM.mantelR) * s, 0], max: [(TURM.rohrX + TURM.mantelR) * s, (TURM.zapfenY + TURM.mantelR) * s, mz] }],
    kugeln: [{ x: 0, y: 1.6 * s, z: 1.2 * s, r: 3.6 * s }],
    turm: { typ, s, gier: [0, PI], nick },
    punkte: [turmPunkt()],
    werte: { masse: Math.round(40 * s * s * s), besatzung: typ === 'schwer' ? 8 : 4 },
  });
}

// Sensormast: kantiger Gittermast mit Rahe und Sensorkästen (keine Kuppeln).
ROH.push({
  id: 'sensormast', name: 'Sensormast', art: 'turm', grafik: 'mast', teile: [],
  kisten: [K(3.6, 1.2, 3.6, 0, 0.5, 0), K(0.8, 12, 0.8, 0, 7, 0, 'metall'), K(6, 0.4, 0.4, 0, 11.5, 0),
    K(1.6, 1, 2.2, 0, 13.5, 0.4, 'metall'), K(1.2, 0.8, 1.2, 2.6, 12.1, 0, 'metall'), K(1.2, 0.8, 1.2, -2.6, 12.1, 0, 'metall'),
    K(2, 1.4, 1.2, 0, 4, 0.9), K(0.2, 3, 0.2, 0, 15.5, 0.4, 'metall'), K(0.2, 2, 0.2, 2.6, 13.5, 0, 'metall'),
    K(0.2, 2, 0.2, -2.6, 13.5, 0, 'metall')],
  punkte: [turmPunkt()],
  werte: { masse: 15, sensor: 1 },
});

// Aufbau-Zonen je Modul (siehe AUFBAU). Rümpfe mit Anbaupunkten: keine Seitenkisten (dort sitzen Hangar/Platte).
const AUF = {
  kommando_m: { rumpf: 'ous', bruecke: 'o' }, bug_m: { rumpf: 'ous', panzer: 'o' }, bug_l: { rumpf: 'ous', panzer: 'o' },
  rumpf_m_kurz: { rumpf: 'ou' }, rumpf_m_lang: { rumpf: 'ou', panzer: 'o' }, rumpf_l: { rumpf: 'ou', panzer: 'o' },
  uebergang_ml: { rumpf: 'ous' }, heck_m: { rumpf: 's', panzer: 'o' }, heck_l: { rumpf: 's', panzer: 'o' }, hangar_s_bb: { rumpf: 'op' }, // WARUM nur außen (p = +X): innen liegt die Hülle
};
for (const r of ROH) for (const t of r.teile) t.aufbau = AUF[r.id]?.[t.name] ?? '';

// ---------------- Spiegeln (E4) ----------------
const sx = (v) => (v === undefined ? v : -v);
function spiegeln(r, id, name) {
  const k = JSON.parse(JSON.stringify(r));
  k.id = id; k.name = name; k.seite = -(r.seite ?? 1);
  for (const t of k.teile) {
    for (const q of t.ab) if (q.x !== undefined) q.x = -q.x;
    t.aufbau = t.aufbau.replace(/[pm]/g, (c) => (c === 'p' ? 'm' : 'p'));
  }
  for (const q of k.kisten ?? []) q.x = -q.x;
  for (const l of k.lafetten ?? []) l.x = -l.x;
  for (const d of k.duesen ?? []) d.p[0] = sx(d.p[0]) + 0;
  for (const p of k.punkte) { p.p[0] = -p.p[0] + 0; p.n[0] = -p.n[0] + 0; p.u[0] = -p.u[0] + 0; }
  return k;
}
ROH.push(spiegeln(ROH.find((r) => r.id === 'hangar_s_bb'), 'hangar_s_sb', 'Hangar (Steuerbord)'));

// ---------------- Fertigstellen ----------------
const huelle = (t) => {
  const min = [Infinity, Infinity, t.ab[0].z], max = [-Infinity, -Infinity, t.ab[t.ab.length - 1].z];
  for (const q of t.ab) {
    const x = q.x ?? 0, y = q.y ?? 0;
    min[0] = Math.min(min[0], x - q.w); max[0] = Math.max(max[0], x + q.w);
    min[1] = Math.min(min[1], y - q.h); max[1] = Math.max(max[1], y + q.h);
  }
  const a = t.aufbau ?? '';
  if (a.includes('o')) max[1] += AUFBAU.hoehe;
  if (a.includes('u')) min[1] -= AUFBAU.hoehe;
  if (a.includes('s') || a.includes('m')) min[0] -= AUFBAU.seite;
  if (a.includes('s') || a.includes('p')) max[0] += AUFBAU.seite;
  return { min, max };
};

/**
 * Hüllquader eines Lofts in Scheiben: gleichbleibende Abschnitte am Stück, veränderliche (Bug, Übergang, Verjüngung)
 * in Scheiben ≤ SCHEIBE m. WARUM: ein Quader über das ganze Loft nimmt den größten Querschnitt für die ganze Länge —
 * am Übergang meldete das einen Turm unter dem schmalen M-Ende als Überschneidung (R15). Querschnitte sind linear
 * zwischen den Stützstellen, also liegt das Maximum einer Scheibe an ihren Enden.
 */
const SCHEIBE = 5;
const gleich = (a, b) => a.w === b.w && a.h === b.h && (a.x ?? 0) === (b.x ?? 0) && (a.y ?? 0) === (b.y ?? 0);
function scheiben(t) {
  const liste = [];
  for (let i = 0; i < t.ab.length - 1; i++) {
    const a = t.ab[i], b = t.ab[i + 1], n = gleich(a, b) ? 1 : Math.ceil((b.z - a.z) / SCHEIBE - 1e-9);
    for (let k = 0; k < n; k++) {
      const za = a.z + (b.z - a.z) * k / n, zb = a.z + (b.z - a.z) * (k + 1) / n;
      liste.push(huelle({ ...t, ab: [masse(t.ab, za), masse(t.ab, zb)].map((q, j) => ({ ...q, z: j ? zb : za })) }));
    }
  }
  // gleichbleibende Nachbarscheiben zusammenlegen (weniger Quader)
  const raus = [];
  for (const q of liste) {
    const v = raus[raus.length - 1];
    if (v && v.max[2] === q.min[2] && [0, 1].every((k) => v.min[k] === q.min[k] && v.max[k] === q.max[k])) v.max[2] = q.max[2];
    else raus.push(q);
  }
  return raus;
}

/** Lafette → Platte (Loft, an teile angehängt), Turmpunkt und Sperrkreis für aufbauten(). */
function lafette(rumpf, l) {
  const r = LAFETTE * Math.SQRT2; // WARUM Umkreis: die Platte ist quadratisch, ihre Ecken sollen nicht schweben
  const f = fusspunkt(rumpf, l.x, l.z, r, l.oben);
  if (!f) throw new Error(`Lafette ${l.id}: kein Rumpf unter (${l.x}, ${l.z})`);
  const hoch = l.oben ? f.y : -f.y, tief = hoch - f.schuerze + 0.1; // v = Abstand vom Rumpf weg
  const oben = raster(Math.ceil((hoch + 0.3) * 2 - 1e-6) / 2), unten = tief - 0.1;
  const s = l.oben ? 1 : -1, hh = (oben - unten) / 2, yc = s * (oben + unten) / 2;
  return {
    platte: T('lafette_' + l.id, [{ z: l.z - LAFETTE, w: LAFETTE, h: hh, x: l.x, y: yc }, { z: l.z + LAFETTE, w: LAFETTE, h: hh, x: l.x, y: yc }],
      Math.min(0.3, 0.15 / Math.min(LAFETTE, hh)), 'dunkel'), // WARUM kleine Fase: die Oberseite bleibt unter dem ganzen Turmfuß eben
    punkt: { id: l.id, p: [l.x + 0, s * oben + 0, l.z], n: [0, s, 0], u: [0, 0, 1], groesse: 'S', art: 'turm', dreh: [0, 1, 2, 3] },
    sperre: [l.x, l.z, r + 0.3],
  };
}

/** Kugeln je großem Loft: gleichmäßig entlang z, Radius deckt den Querschnitts-Abschnitt (lieber zu groß). */
function kugelnAus(teile) {
  const k = [];
  for (const t of teile) {
    const { min, max } = huelle(t), sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
    if (Math.min(sx, sy) < 4) continue;
    const n = Math.max(1, Math.round(sz / Math.max(sx, sy))), d = sz / n;
    for (let i = 0; i < n; i++) k.push({ x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: min[2] + d * (i + 0.5),
      r: Math.round(0.5 * Math.hypot(sx, sy, d) * 0.9 * 10) / 10 });
  }
  return k;
}

function fertig(r) {
  const rumpf = r.teile.slice(), sperren = { oben: [], unten: [] }, punkte = r.punkte.slice(), teile = r.teile.slice();
  for (const l of r.lafetten ?? []) {
    const e = lafette(rumpf, l);
    teile.push(e.platte); punkte.push(e.punkt); (l.oben ? sperren.oben : sperren.unten).push(e.sperre);
  }
  const quader = r.quader ? r.quader.slice() : [];
  for (const t of teile) quader.push(...scheiben(t));
  for (const k of r.kisten ?? []) quader.push({ min: [k.x - k.b / 2, k.y - k.h / 2, k.z - k.t / 2], max: [k.x + k.b / 2, k.y + k.h / 2, k.z + k.t / 2] });
  for (const d of r.duesen ?? []) {
    const [x, y, z] = d.p, q = d.r * 1.2;
    quader.push({ min: [x - q, y - q, z - 1.7 * d.r], max: [x + q, y + q, z + d.l - 0.5] });
  }
  const vol = quader.reduce((v, q) => v + (q.max[0] - q.min[0]) * (q.max[1] - q.min[1]) * (q.max[2] - q.min[2]), 0);
  const m = {
    id: r.id, name: r.name, art: r.art, grafik: r.grafik, seite: r.seite ?? 1,
    teile, kisten: r.kisten ?? [], duesen: r.duesen ?? [], andock: punkte, quader, sperren,
    kugeln: r.kugeln ?? kugelnAus(r.teile),
    werte: { masse: Math.round(vol * DICHTE / 10) * 10, ...r.werte },
  };
  if (r.turm) {
    // Turm-Datensatz in Modul-Koordinaten (Ursprung = Fußpunkt auf ebener Platte) — für Grafik und späteren Probeflug
    const platte = [T('platte', [{ z: -5, w: 5, h: 0.5, y: -0.5 }, { z: 5, w: 5, h: 0.5, y: -0.5 }], 0)];
    m.turm = { ...r.turm, daten: turmDaten(0, { x: 0, z: 0, oben: true, ...r.turm }, platte) };
  }
  return m;
}

export const MODULE = ROH.map(fertig);
export const KATALOG = Object.fromEntries(MODULE.map((m) => [m.id, m]));

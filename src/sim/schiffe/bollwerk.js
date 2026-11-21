// ZWECK: Daten des Schlachtträgers „BT-12 Bollwerk“: Rumpf-Querschnitte, Türme, Kollisionskugeln (ohne three).
// LIEFERT: TEILE (Querschnitte je Rumpfteil), POD_X/POD_Y, BOLLWERK = { name, kennung, laenge, teile, kugeln, tuerme }
// REGEL: Querschnitte NUR hier — grafik/schiff/bollwerk.js baut daraus die Lofts (außer TEILE.details = Grafik-Anbauten
//        als Quader, nur für Fußpunkt/Rumpf-Sperre/Kugel-Deckung). Maße in m, Schiff lokal. 17 Türme (R14: +10 PDC).
import { turmDaten } from './turm.js';
import { alleTeile } from './rumpf.js';

const T = (ab, fase) => ({ ab, fase });
// Hangar-Mitte: Hals-Halbbreite 10,5 + Hangar-Halbbreite 8 − 0,5 m Einbettung → liegt direkt an der Hülle
export const POD_X = 18, POD_Y = -3;
const WANGE = (x) => T([{ z: 46, w: 1.4, h: 7, x, y: -1 }, { z: 96, w: 1.4, h: 6, x, y: -1.5 }], 0.5);
// Hangar läuft hinten in die Verjüngung des Heckblocks hinein (z −60), vorn bis unter den Kopf (z 26)
const DECK = (x) => T([{ z: -60, w: 6.5, h: 5, x, y: POD_Y }, { z: -52, w: 8, h: 6, x, y: POD_Y },
  { z: 16, w: 8, h: 6, x, y: POD_Y }, { z: 26, w: 6.5, h: 5, x, y: POD_Y }], 0.3);
const rippen = [];
for (let z = -40; z <= 26; z += 8) rippen.push(T([{ z: z - 0.8, w: 11.4, h: 10.4 }, { z: z + 0.8, w: 11.4, h: 10.4 }], 0.3));

// Grafik-Anbauten als grobe Quader (fase 0) — NUR für Rechnungen: Fußpunkt der Türme, Rumpf-Sperre (sperre.js),
// Kugel-Deckung. Die Grafik lofted sie NICHT (eigene Geometrie in grafik/schiff/bollwerk.js; Maße dort abgelesen).
// WARUM: Kühlrippen, Rohre, Mast und Triebwerke ragen über die Querschnitte hinaus — ein Turm daneben schösse sonst
// hinein, ohne dass die Sperre es merkt (Frühwarnung R14).
const Q = (x, y, w, h, z0, z1) => T([{ z: z0, w, h, x, y }, { z: z1, w, h, x, y }], 0);
const DETAILS = [];
for (const s of [1, -1]) {
  DETAILS.push(
    Q(s * 9, -16.45, 5, 1.55, -110.4, -69.6),                                      // Kühlrippen unter dem Heck
    Q(s * 9, -16.4, 7, 1.5, -111.6, -110.4), Q(s * 9, -16.4, 7, 1.5, -69.6, -68.4), // Endplatten der Kühlrippen
    Q(s * 21.4, -11.5, 0.7, 1.1, -114, -62),                                        // Panzerkante Heckflanke
    Q(s * 12, 5.45, 0.8, 1.65, -43, 29),                                            // Rohre über den Hangars
    Q(s * 10.8, 3.6, 1.3, 0.8, -53, 21),                                            // Nahtleiste Hangar/Hülle
    Q(s * 15.4, 0, 0.6, 2.5, 105, 115), Q(s * 12.6, -1.5, 0.6, 1.7, 114.5, 121.5),   // Stufen-Platten Bugflanken
  );
}
DETAILS.push(
  Q(0, 22.5, 0.45, 6, -5.45, -4.55), Q(0, 26, 3.5, 0.25, -5.25, -4.75), Q(0, 24, 0.25, 0.25, -7, -3), // Mast + Rahe
  Q(3, 19.5, 0.25, 3.5, -12.25, -11.75), Q(-3, 18.5, 0.25, 2.5, 1.75, 2.25),                          // Antennen
  Q(4, 17.4, 2.2, 1.1, -4.2, 0.2), Q(-4, 17.1, 1.6, 0.8, -17.6, -14.4),                               // Sensorkuppeln
  Q(0, 0, 20.5, 14, -128, -117),                                                                       // Triebwerksblock
);

export const TEILE = {
  kopf: T([
    { z: 28, w: 15, h: 11.5 }, { z: 40, w: 18.5, h: 13.5, y: 0.5 }, { z: 88, w: 18, h: 12.5 },
    { z: 108, w: 14, h: 9.5, y: -1.5 }, { z: 122, w: 7.5, h: 5.5, y: -3.5 }, { z: 128, w: 3.5, h: 2.6, y: -4.5 },
  ], 0.32),
  panzer1: T([{ z: 42, w: 12, h: 1.6, y: 14.2 }, { z: 92, w: 10.5, h: 1.6, y: 12.8 }, { z: 110, w: 7, h: 1.2, y: 9.4 }], 0.5),
  panzer2: T([{ z: 50, w: 7, h: 1.2, y: 16.2 }, { z: 82, w: 6, h: 1.2, y: 15.4 }], 0.5),
  wange: [WANGE(19.2), WANGE(-19.2)], // Index 0 = Backbord (+X), 1 = Steuerbord — wie die Schleife s = 1, −1
  sporn: T([{ z: 70, w: 5, h: 1.6, y: -12 }, { z: 112, w: 3.5, h: 1.4, y: -9.5 }, { z: 132, w: 1.2, h: 0.8, y: -5.5 }], 0.4),
  hals: T([{ z: -44, w: 10.5, h: 9.5 }, { z: 30, w: 10.5, h: 9.5 }], 0.3),
  rippen,
  kommando: T([{ z: -22, w: 6, h: 2.5, y: 11.5 }, { z: -14, w: 7, h: 4, y: 12.5 }, { z: 4, w: 6.5, h: 3.8, y: 12.5 }, { z: 10, w: 4.5, h: 2.5, y: 11.5 }], 0.35),
  heck: T([{ z: -118, w: 21, h: 15 }, { z: -62, w: 21, h: 15 }, { z: -50, w: 16, h: 12 }, { z: -40, w: 10.5, h: 9.5 }], 0.3),
  heckpanzer: T([{ z: -114, w: 15, h: 1.6, y: 16.2 }, { z: -66, w: 13, h: 1.6, y: 16.2 }, { z: -54, w: 8, h: 1.1, y: 13.4 }], 0.5),
  heckpanzer2: T([{ z: -108, w: 8, h: 1.1, y: 18.6 }, { z: -78, w: 7, h: 1.1, y: 18.6 }], 0.5),
  deck: [DECK(POD_X), DECK(-POD_X)],
  details: DETAILS, // nur Rechnung (s. o.), kein Loft
};

const PI = Math.PI, VOLL = [0, PI];
const PDC = (aussen) => ({ typ: 'flak', s: 0.7, sockel: 1, gier: [aussen * PI / 2, 1.8], nick: [-0.25, PI / 2] });
// WARUM diese Grenzen (Schätzung, Waffentechniker prüft): Das Flak-Paar z 62 steht neben der Panzerstufe PANZER2 —
// nach innen schlügen die Rohre hinein (Halbweite π/2 + 0,23). Bugturm: nach hinten verdecken Stufe und Flak-Paar.
// Halsturm auf 6-m-Sockel: Rohre 17,8 m hoch, über Bugstufe (17,4) und Kommandoblock (16,3) hinweg.
const ROH = [
  { x: 9, z: 62, oben: true, typ: 'flak', s: 0.7, gier: [PI / 2, 1.8], nick: [-0.1, 1.45] },
  { x: -9, z: 62, oben: true, typ: 'flak', s: 0.7, gier: [-PI / 2, 1.8], nick: [-0.1, 1.45] },
  { x: 0, z: 98, oben: true, typ: 'schwer', s: 1.3, gier: [0, 2.4], nick: [-0.1, 0.8] },
  { x: 0, z: 22, oben: true, typ: 'schwer', s: 1.1, sockel: 6, gier: VOLL, nick: [-0.05, 0.8] },
  { x: 0, z: -92, oben: true, typ: 'schwer', s: 1.3, gier: VOLL, nick: [-0.1, 0.8] },
  { x: 0, z: 52, oben: false, typ: 'flak', s: 1.3, gier: VOLL, nick: [-0.05, 1.45] },
  { x: 0, z: -10, oben: false, typ: 'flak', s: 1.1, gier: VOLL, nick: [-0.05, 1.45] },
  // Runde 14: zehn Zwillings-PDC (Nahbereichsabwehr) paarweise an den Außenkanten, ids 7–16 (ungerade = Backbord +X).
  // Gier-Mitte zeigt nach außen; WARUM unten gespiegelt: unten montiert ist Turm-+X = Schiff-−X (turm.js). Nick bis
  // −0,25, damit die Randtürme die Flanken decken, bis π/2, damit Zenit und Nadir erreichbar sind. Den Rumpf sperrt
  // rumpfSperre() (sperre.js) zusätzlich je Gier-Sektor.
  ...[[10, 80, false], [16.6, -100, true], [16.4, -88, false], [21, -30, true], [21, 21, false]].flatMap(([x, z, oben]) =>
    [1, -1].map((s) => ({ x: s * x, z, oben, ...PDC(oben ? s : -s) }))),
  // Reihenfolge: Kopf unten (neben dem Sporn) · Heck oben (außen neben dem Heckpanzer) · Heck unten (außen neben den
  // Kühlrippen) · Hangar oben (Außenkante) · Hangar unten (vor dem Landedeck, hinter den Startschächten)
];

export const BOLLWERK = {
  name: 'BOLLWERK', kennung: 'BT-12', laenge: 255, teile: TEILE,
  // Kollision/Treffer, Schiffs-lokal. 16 Kugeln: Heck 4, Hals + Hangars 6, Kopf 4, Bug 2. Radien eingepasst: 90 % der
  // Rumpfpunkte je Kugel-Zelle liegen höchstens 1,5 m außerhalb (Deckung/Überstand: tests/schiffe.mjs).
  // WARUM eher zu groß: ein Fels, der sichtbar im Rumpf steckt, stört mehr als ein paar Meter unsichtbarer Puffer.
  kugeln: [
    { x: 10.5, y: 1, z: -106, r: 18.5 }, { x: -10.5, y: 1, z: -106, r: 18.5 },
    { x: 10.5, y: 1, z: -78, r: 20 }, { x: -10.5, y: 1, z: -78, r: 20 },
    { x: 14, y: -1, z: -46, r: 17.5 }, { x: -14, y: -1, z: -46, r: 17.5 },
    { x: 14, y: 0, z: -17, r: 16.5 }, { x: -14, y: 0, z: -17, r: 16.5 },
    { x: 13, y: 0, z: 11, r: 17 }, { x: -13, y: 0, z: 11, r: 17 },
    { x: 9, y: 2, z: 46, r: 18 }, { x: -9, y: 2, z: 46, r: 18 },
    { x: 9, y: 1, z: 74, r: 17.5 }, { x: -9, y: 1, z: 74, r: 17.5 },
    { x: 0, y: -2, z: 100, r: 18 }, { x: 0, y: -4, z: 120, r: 12.5 },
  ],
  tuerme: ROH.map((r, i) => turmDaten(i, r, alleTeile(TEILE))),
};

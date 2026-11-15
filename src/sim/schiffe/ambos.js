// ZWECK: Daten der Fregatte „FK-07 Ambos“ (gesichertes Design): Rumpf-Querschnitte, Türme, Kollisionskugeln (ohne three).
// LIEFERT: TEILE, POD_X, AMBOS = { name, kennung, laenge, teile, kugeln, tuerme }
// REGEL: Form NICHT ohne Rückfrage ändern (Nutzer). Runde 5: nur Turmhöhen aus dem Rumpf abgeleitet (vorher schwebend).
import { turmDaten } from './turm.js';
import { alleTeile } from './rumpf.js';

const T = (ab, fase) => ({ ab, fase });
export const POD_X = 21;
const SEITENRUMPF = (x) => T([
  { z: -64, w: 4.5, h: 5, x, y: -1 }, { z: -56, w: 5.5, h: 6, x, y: -1 }, { z: 4, w: 5.5, h: 6, x, y: -1 },
  { z: 18, w: 4.6, h: 4.6, x, y: -1 }, { z: 26, w: 2.8, h: 3, x, y: -1.2 },
], 0.25);

export const TEILE = {
  rueckgrat: T([
    { z: -66, w: 8, h: 7.5 }, { z: -58, w: 10.5, h: 9 }, { z: -20, w: 11, h: 9.5 }, { z: 25, w: 11, h: 9 },
    { z: 48, w: 9, h: 7, y: -0.5 }, { z: 72, w: 6, h: 4.5, y: -1 }, { z: 84, w: 3.8, h: 2.6, y: -1.4 },
  ], 0.25),
  bugpanzer: T([
    { z: 6, w: 11, h: 1.2, y: 9.6 }, { z: 18, w: 15, h: 2.2, y: 9.9 }, { z: 52, w: 14, h: 2.4, y: 8.4 },
    { z: 74, w: 9, h: 1.8, y: 5.4 }, { z: 86, w: 5, h: 1.1, y: 3.4 },
  ], 0.4),
  kiel: T([{ z: -40, w: 5, h: 1, y: -9.6 }, { z: 0, w: 7, h: 1.4, y: -9.6 }, { z: 40, w: 7.5, h: 1.6, y: -8.2 }, { z: 70, w: 4.5, h: 1.1, y: -5.6 }], 0.4),
  seitenrumpf: [SEITENRUMPF(POD_X), SEITENRUMPF(-POD_X)], // Index 0 = Backbord (+X)
  kommando: T([{ z: -36, w: 6, h: 2.5, y: 11.2 }, { z: -28, w: 7, h: 3.4, y: 12 }, { z: -9, w: 6, h: 3.2, y: 12 }, { z: -2, w: 4, h: 2, y: 11.4 }], 0.35),
};

const PI = Math.PI, VOLL = [0, PI];
const ROH = [
  { x: 0, z: -48, oben: true, typ: 'flak', s: 1, gier: VOLL, nick: [-0.05, 1.45] },
  { x: 0, z: 34, oben: true, typ: 'schwer', s: 1, gier: [0, 2.6], nick: [-0.1, 0.8] }, // hinten verdeckt der Kommandoblock
  { x: 0, z: -24, oben: false, typ: 'flak', s: 1, gier: VOLL, nick: [-0.05, 1.45] },
  { x: 0, z: 28, oben: false, typ: 'flak', s: 1, gier: VOLL, nick: [-0.05, 1.45] },
];

export const AMBOS = {
  name: 'AMBOS', kennung: 'FK-07', laenge: 150, teile: TEILE,
  // 12 Kugeln: Rückgrat 6, Seitenrümpfe je 3 — eingepasst wie beim Bollwerk (tests/schiffe.mjs)
  kugeln: [
    { x: 0, y: 0.5, z: -56, r: 12 }, { x: 0, y: 1, z: -32, r: 14 }, { x: 0, y: 1, z: -8, r: 14 },
    { x: 0, y: 1, z: 16, r: 15 }, { x: 0, y: 0.5, z: 40, r: 15.5 }, { x: 0, y: -0.5, z: 64, r: 16.5 },
    { x: POD_X, y: -1, z: -50, r: 13 }, { x: -POD_X, y: -1, z: -50, r: 13 },
    { x: POD_X, y: -1, z: -23, r: 12.5 }, { x: -POD_X, y: -1, z: -23, r: 12.5 },
    { x: POD_X, y: -1, z: 5, r: 15.5 }, { x: -POD_X, y: -1, z: 5, r: 15.5 },
  ],
  tuerme: ROH.map((r, i) => turmDaten(i, r, alleTeile(TEILE))),
};

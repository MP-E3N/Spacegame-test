// ZWECK: Drei Beispielformen der Form-Werkstatt (Runde 16) — Startinhalt der Werkstatt und Testvorlage.
// LIEFERT: BEISPIEL_FORMEN = [Brückenturm, Rumpfstück eckig → rund, Triebwerksgondel] (Formen wie form.js)
//          · BEISPIEL_SCHIFFE = [SL-01 Silberlanze] (Runde 23: ganzes Schiff mit Bauteilen, für formZuSchiff/Gefecht;
//            NICHT im Werkstatt-Startinhalt — BEISPIEL_FORMEN bleibt unverändert, tests/silberlanze.mjs)
// REGEL: ohne three. Jede Form zeigt etwas anderes: Spiegel, Plus/Minus, Drehung, mehrere Vorlagen, Rundung ↔ Fase.
//        Jede Form dockt über formZuModul() in der Werft an (Andockpunkte nach Werft E1/E2/E9). Stil: industriell,
//        kantig, gepanzert, keine Fenster (Brücke ohne Glas), eigene Entwürfe.
//        Spant { z, b, h, x?, y?, rundung, fase } — b/h VOLLE Maße. Körper-Z = Loft-Richtung; dreh [−90, 0, 0] stellt
//        einen Körper senkrecht (Körper-+Z → Form-+Y).
const S = (z, b, h, { rundung = 0, fase = 0, x = 0, y = 0 } = {}) => ({ z, b, h, rundung, fase, ...(x && { x }), ...(y && { y }) });
let nr = 0;
const K = (typ, spanten, { op = 'plus', mat = 'rumpf', pos = [0, 0, 0], dreh = [0, 0, 0], spiegel = false } = {}) =>
  ({ id: nr++, typ, op, mat, pos, dreh, spiegel, spanten });
const AUF = [-90, 0, 0]; // senkrecht

// ---------- 1) Brückenturm: steht auf einer Turm-Lafette (S), gepanzerter Kopf, Flügel per Spiegel, Wartungsnut (Minus)
nr = 0;
const BRUECKENTURM = {
  name: 'Brückenturm', version: 1, art: 'anbau',
  koerper: [
    K('trapez', [S(-3.5, 7.4, 2.4, { fase: 0.3, y: 1.2 }), S(3.5, 7.4, 2.4, { fase: 0.3, y: 1.2 })], { mat: 'dunkel' }),        // Sockel
    K('trapez', [S(0, 6, 6, { fase: 0.3 }), S(9, 4.6, 4.6, { fase: 0.3 })], { pos: [0, 1.5, -0.5], dreh: AUF }),                  // Schaft (senkrecht, verjüngt)
    K('rumpf', [S(-4.5, 9, 2.4, { fase: 0.4, y: 10.6 }), S(-3, 11, 3.4, { fase: 0.35, y: 11 }), S(4, 11, 3.4, { fase: 0.35, y: 11 }),
      S(6, 8, 2.2, { fase: 0.4, y: 10.6 })]),                                                                                     // Brückenkopf
    K('platte', [S(-2, 3.4, 1.6, { fase: 0.3, x: 6.8, y: 11.2 }), S(2.5, 3.4, 1.6, { fase: 0.3, x: 6.8, y: 11.2 })], { mat: 'dunkel', spiegel: true }), // Flügel
    K('quader', [S(-1.5, 5, 1.4, { fase: 0.4, y: 13.2 }), S(3, 4.2, 1.4, { fase: 0.4, y: 13.2 })], { mat: 'dunkel' }),           // Dachaufsatz
    K('quader', [S(0, 0.5, 0.5), S(5, 0.4, 0.4)], { mat: 'metall', pos: [-1.5, 13.6, 1], dreh: AUF }),                             // Antennenmast
    K('quader', [S(5.4, 9, 0.5, { y: 11.4 }), S(7, 9, 0.5, { y: 11.4 })], { op: 'minus', mat: 'schacht' }),                        // Wartungsnut vorn
    K('quader', [S(-1, 0.6, 1.2, { x: 5.6, y: 9.8 }), S(1.5, 0.6, 1.2, { x: 5.6, y: 9.8 })], { op: 'minus', mat: 'schacht', spiegel: true }), // Lüfterschlitze
  ],
  andock: [{ id: 'fuss', p: [0, 0, 0], n: [0, -1, 0], u: [0, 0, 1], groesse: 'S', art: 'turm', stecker: true, dreh: [0, 1, 2, 3] }],
};

// ---------- 2) Rumpfstück eckig → rund → eckig: Enden exakt Werft-NORM M (w 10/h 8, fase 0,3 → b 20/h 16), Mitte rund,
//              Spantringe, Rückenpanzer, gespiegelte Kühlschlitze (Minus).
nr = 0;
const NORM_M = (z) => S(z, 20, 16, { fase: 0.3 });
const RING = (z, s) => K('platte', [{ ...s, z: z - 0.6, b: s.b + 0.6, h: s.h + 0.6 }, { ...s, z: z + 0.6, b: s.b + 0.6, h: s.h + 0.6 }], { mat: 'dunkel' });
const RUND = (z) => S(z, 20, 16, { rundung: 1 });
const RUMPFSTUECK = {
  name: 'Rumpfstück rund', version: 1, art: 'rumpf',
  koerper: [
    K('rumpf', [NORM_M(-20), NORM_M(-13), RUND(-5), RUND(5), NORM_M(13), NORM_M(20)]),
    RING(-13, NORM_M(0)), RING(-5, RUND(0)), RING(5, RUND(0)), RING(13, NORM_M(0)),
    K('platte', [S(-11, 6, 1.2, { fase: 0.5, y: 8.3 }), S(11, 6, 1.2, { fase: 0.5, y: 8.3 })], { mat: 'dunkel' }),                // Rückenpanzer
    K('quader', [S(-3.5, 1.2, 5, { x: 10 }), S(3.5, 1.2, 5, { x: 10 })], { op: 'minus', mat: 'schacht', spiegel: true }),          // Kühlschlitze
    K('quader', [S(-3, 3, 0.6, { y: -8.1 }), S(3, 3, 0.6, { y: -8.1 })], { op: 'minus', mat: 'warn' }),                           // Wartungsluke unten
  ],
  andock: [
    { id: 'vorn', p: [0, 0, 20], n: [0, 0, 1], u: [0, 1, 0], groesse: 'M', art: 'rumpf', dreh: [0, 2] },
    { id: 'hinten', p: [0, 0, -20], n: [0, 0, -1], u: [0, 1, 0], groesse: 'M', art: 'rumpf', dreh: [0, 2] },
  ],
};

// ---------- 3) Triebwerksgondel: liegt mit der Innenwand an der Rumpfseite (S-Anbau, Stecker), oben/unten symmetrisch
//              (WARUM: auf der anderen Seite dreht der Zusammenbau sie mit dreh 2 um die Andockachse), Düsentrichter als
//              Minus-Kegel durch Kragen und Gondel, Warnring.
nr = 0;
const GONDEL = {
  name: 'Triebwerksgondel', version: 1, art: 'anbau',
  koerper: [
    K('rumpf', [S(-13, 10, 9, { fase: 0.3, x: 5 }), S(8, 10, 9, { fase: 0.3, x: 5 }), S(13, 6.5, 5.5, { fase: 0.35, x: 4.6 })]),   // Gondel
    K('platte', [S(-15, 9.4, 8.6, { fase: 0.3, x: 5.3 }), S(-12.5, 10.6, 9.6, { fase: 0.3, x: 5.3 })], { mat: 'dunkel' }),              // Düsenkragen
    K('platte', [S(-10.8, 10.3, 9.3, { fase: 0.3, x: 5.15 }), S(-10.2, 10.3, 9.3, { fase: 0.3, x: 5.15 })], { mat: 'warn' }),              // Warnring
    K('quader', [S(-8, 4, 1, { fase: 0.3, x: 5, y: 4.8 }), S(6, 4, 1, { fase: 0.3, x: 5, y: 4.8 })], { mat: 'dunkel' }),             // Kühlleiste oben
    K('quader', [S(-8, 4, 1, { fase: 0.3, x: 5, y: -4.8 }), S(6, 4, 1, { fase: 0.3, x: 5, y: -4.8 })], { mat: 'dunkel' }),           // Kühlleiste unten
    K('kegel', [S(-15.5, 7, 7, { fase: 0.3, x: 5 }), S(-8, 3.6, 3.6, { fase: 0.3, x: 5 })], { op: 'minus', mat: 'duese' }),          // Düsentrichter
    K('quader', [S(-2, 0.8, 3, { x: 10 }), S(2, 0.8, 3, { x: 10 })], { op: 'minus', mat: 'schacht' }),                              // Wartungsluke außen
  ],
  andock: [{ id: 'innen', p: [0, 0, 0], n: [-1, 0, 0], u: [0, 1, 0], groesse: 'S', art: 'anbau', stecker: true, dreh: [0, 2] }],
};

export const BEISPIEL_FORMEN = [BRUECKENTURM, RUMPFSTUECK, GONDEL];

// ---------- 4) SL-01 Silberlanze (Runde 23, Nutzer: „ein Schiff, welches stark an der Aurora-Klasse ist“) ----------
// TYP übernommen (E1/E-005), NICHT nachgebaut: lange Nadel mit spitzem Bug, flache breite Vordersektion, ab der Mitte
// vier lange Ausleger im X (2 oben, 2 unten, gespreizt), die weit über das Heck ragen; glatte gerundete Flächen.
// EIGEN: 370 m (Bug z 180 … Auslegerspitzen z −190), Rumpf 295 m mit stumpfem Triebwerksheck (Kragen + 4 Triebwerke im
// X wie die Ausleger), Rückengrat mit gepanzertem Kommandobuckel (keine Fenster), Stege Rumpf → Ausleger nur bis z −100,
// Ringbänder an den Auslegern, Flankenpanzer am Achterschiff, Segmentnähte (Minus) quer über die Vordersektion.
// WARUM alles oben/unten gespiegelt (y): Schwerpunkt auf der Rumpfachse → Schub ohne Hebel (flugtauglich per Bau).
// Ausleger/Stege: Körper um Z gedreht (dreh [0, 0, 38]) — Körper-X zeigt radial nach außen, Spiegel x/y → vier Kopien.
nr = 0;
const R = (z, b, h, rundung, mehr = {}) => S(z, b, h, { rundung, ...mehr });
const X38 = [0, 0, 38];
const XY = ['x', 'y'];
const AUSLEGER = [R(28, 4, 3, 1, { x: 5 }), R(5, 6.5, 4.2, 1, { x: 8 }), R(-40, 7.5, 4.8, 1, { x: 14 }), R(-110, 7, 4.5, 1, { x: 21 }),
  R(-170, 5, 3.2, 1, { x: 23 }), R(-190, 1.2, 0.8, 1, { x: 23.4 })];
/** Spant des Auslegers bei z (linear zwischen den Stützstellen) — für die Ringbänder. */
const auslegerBei = (z) => {
  const a = [...AUSLEGER].sort((p, q) => p.z - q.z);
  let i = 0; while (i < a.length - 2 && z > a[i + 1].z) i++;
  const t = (z - a[i].z) / (a[i + 1].z - a[i].z), m = (f) => a[i][f] + (a[i + 1][f] - a[i][f]) * t;
  return { b: m('b'), h: m('h'), x: m('x') };
};
const BAND = (z) => { const s = auslegerBei(z);
  return K('platte', [R(z - 1.2, s.b + 0.7, s.h + 0.7, 1, { x: s.x }), R(z + 1.2, s.b + 0.7, s.h + 0.7, 1, { x: s.x })], { mat: 'dunkel', dreh: X38, spiegel: XY }); };
const NAHT = (z, y) => K('quader', [S(z - 0.3, 40, 0.7, { y }), S(z + 0.3, 40, 0.7, { y })], { op: 'minus', mat: 'schacht', spiegel: ['y'] });
let bt = 0;
const T = (typ, p, n, spiegel) => ({ id: bt++, typ, p, n, spiegel });
const OBEN = [0, 1, 0], HECK = [0, 0, -1];
const SILBERLANZE = {
  name: 'SL-01 Silberlanze', version: 1, art: 'rumpf',
  koerper: [
    // Hauptrumpf: stumpfes Heck mit Kragen → runder Hals → flache breite Vordersektion → Nadelbug
    K('rumpf', [R(-115, 22, 20, 0.3), R(-110, 24, 22, 0.45), R(-95, 21, 18, 0.45), R(-30, 17, 14.5, 0.5), R(10, 17, 13, 0.8),
      R(40, 22, 10.5, 0.8), R(70, 34, 9, 0.75), R(110, 36, 8, 0.75), R(140, 24, 6, 0.8), R(165, 9, 3.2, 0.9), R(180, 1.2, 0.8, 1)]),
    // Rückengrat mit Kommandobuckel (gepanzert, ohne Fenster), oben und unten
    K('platte', [S(28, 6, 1.4, { fase: 0.5, y: 5.7 }), S(45, 9, 2.8, { fase: 0.5, y: 5.6 }), S(62, 7, 1.8, { fase: 0.5, y: 4.8 }),
      S(100, 6, 1.6, { fase: 0.5, y: 4.3 }), S(140, 4, 1.2, { fase: 0.5, y: 3.1 }), S(165, 2, 0.8, { fase: 0.5, y: 1.7 })], { mat: 'dunkel', spiegel: ['y'] }),
    K('platte', [S(-113, 25, 23, { rundung: 0.45 }), S(-107, 25, 23, { rundung: 0.45 })], { mat: 'dunkel' }),                   // Heckkragen
    K('zylinder', AUSLEGER, { dreh: X38, spiegel: XY }),                                                                         // vier Ausleger
    K('quader', [S(26, 4, 1.4, { fase: 0.3, x: 5 }), S(5, 7, 1.4, { fase: 0.3, x: 7 }), S(-40, 11, 1.4, { fase: 0.3, x: 9.5 }),
      S(-100, 15, 1.4, { fase: 0.3, x: 12.5 })].sort((a, b) => a.z - b.z), { mat: 'dunkel', dreh: X38, spiegel: XY }),          // Stege Rumpf → Ausleger
    BAND(-60), BAND(-150),                                                                                                       // Ringbänder
    K('platte', [S(-90, 1.6, 9, { fase: 0.4, x: 10.4 }), S(-45, 1.6, 8, { fase: 0.4, x: 9.1 })], { mat: 'dunkel', spiegel: ['x'] }), // Flankenpanzer
    NAHT(84, 4.45), NAHT(132, 3.6),                                                                                              // Segmentnähte
  ],
  andock: [],
  bauteile: [
    T('schwer', [12, 4.18, 95], OBEN, XY),                       // Hauptbatterie vorn: 2 oben + 2 unten
    T('schwer', [0, 8.04, -60], OBEN, ['y']),                   // Hauptbatterie achtern: oben + unten
    T('flak', [0, 6.58, 5], OBEN, ['y']), T('flak', [0, 7.06, -20], OBEN, ['y']),
    T('pdc', [12.5, 4.42, 75], OBEN, XY), T('pdc', [11, 3.66, 120], OBEN, XY), T('pdc', [6.5, 8.6, -82], OBEN, XY),
    T('triebwerk_m', [5.2, 4.8, -115], HECK, XY),
    T('steuer', [5, 2.44, 150], OBEN, XY), T('steuer', [4, 9.66, -100], OBEN, XY),
  ],
};

export const BEISPIEL_SCHIFFE = [SILBERLANZE];

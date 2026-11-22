// ZWECK: Drei Beispielformen der Form-Werkstatt (Runde 16) — Startinhalt der Werkstatt und Testvorlage.
// LIEFERT: BEISPIEL_FORMEN = [Brückenturm, Rumpfstück eckig → rund, Triebwerksgondel] (Formen wie form.js)
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

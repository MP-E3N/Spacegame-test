// ZWECK: Prüfungen ohne Browser für den Schiffs-Baukasten (Runde 15, `node tests/werft.mjs`).
//   1) LAGEN: 24 verschiedene Drehungen, ganzzahlig orthonormal, det +1.
//   2) andockLage: Punkte decken sich, n entgegen, u gleich (dreh 0), dreh 0..3 verschieden, Gegenrichtung = inverse
//      Lage, 50 Segmente ohne Drift.
//   3) baue-Meldungen: je ein kleinster Entwurf pro Code (Protokoll R15, E6) → genau diese Meldung; behoben → weg.
//      Ring-Schluss, ungeordnete Liste, Gleichlauf, tief eingefrorene Eingaben.
//   4) loesche, naechsteNr, kandidaten.
//   5) Datei-Ablage (server/ablage.js): Handler mit nachgebautem req/res in einem Temp-Ordner.
//   Jede Gegenprobe (Zeile „Gegenprobe …“) füttert die Prüfung mit absichtlich falschen Daten und MUSS anschlagen.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
// REGEL: Test-Katalog steht hier im Test (unabhängig vom echten Katalog); Teil 2 (echter KATALOG + BEISPIEL) folgt.
import { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAGEN, EINHEIT, andockLage, baue, kandidaten, loesche, naechsteNr, wende, dreheV } from '../src/sim/werft/zusammenbau.js';
import { ablage } from '../server/ablage.js';

const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};

// ---------- Hilfen (eigene Mathematik, unabhängig von zusammenbau.js) ----------
const mal = (a, b) => a.map((z) => [0, 1, 2].map((j) => z[0] * b[0][j] + z[1] * b[1][j] + z[2] * b[2][j]));
const trans = (m) => [0, 1, 2].map((i) => [m[0][i], m[1][i], m[2][i]]);
const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const mv = (m, v) => m.map((z) => z[0] * v[0] + z[1] * v[1] + z[2] * v[2]);
const abst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const gleichM = (a, b) => a.every((z, i) => z.every((x, j) => x === b[i][j]));
const istId = (m) => gleichM(m, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
/** Ganzzahlig, Einträge ∈ {−1, 0, 1}, M·Mᵀ = I, det +1. */
const istLage = (m) => m.length === 3 && m.every((z) => z.length === 3 && z.every((x) => Number.isInteger(x) && Math.abs(x) <= 1))
  && istId(mal(m, trans(m))) && det(m) === 1;
const pruefeLagen = (liste) => liste.length === 24 && liste.every(istLage) && new Set(liste.map((m) => JSON.stringify(m))).size === 24;
const tiefFrieren = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(tiefFrieren); } return o; };
const kopie = (o) => JSON.parse(JSON.stringify(o));

// ---------- Test-Katalog ----------
// Rumpf M: 20 × 16 m Querschnitt. Kommando/Rumpf ragen an ihren Rumpf-Andockflächen 0,75 m über (Fase, < 2 × 0,5 m
// Schrumpf → kein Treffer zwischen Nachbarn); die Ecke ragt 1,5 m über → trifft ihren Ring-Schluss-Partner nur, wenn
// der Ring-Schluss NICHT als Nachbarschaft erkannt wird.
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], NY = [0, -1, 0], NZ = [0, 0, -1];
const RUMPF = [0, 2], ALLE = [0, 1, 2, 3];
const P = (id, p, n, u, groesse, art, dreh) => ({ id, p, n, u, groesse, art, dreh });
const Q = (min, max) => ({ min, max });
const M = (id, art, quader, andock, extra = {}) => ({ id, name: id, art, quader, andock, kugeln: [{ x: 0, y: 0, z: 0, r: 5 }], werte: { masse: 10, panzer: 1 }, ...extra });
const turmPunkt = (p) => P('oben', p, Y, Z, 'S', 'turm', ALLE);
const fuss = (art = 'turm') => P('fuss', [0, 0, 0], NY, Z, 'S', art, ALLE);
const MODULE = [
  M('kommando_m', 'kommando', [Q([-10, -8, -10.75], [10, 8, 10])], [P('hinten', [0, 0, -10], NZ, Y, 'M', 'rumpf', RUMPF), turmPunkt([0, 8, 0])]),
  M('bug_m', 'bug', [Q([-10, -8, -10.75], [10, 8, 10])], [P('hinten', [0, 0, -10], NZ, Y, 'M', 'rumpf', RUMPF), turmPunkt([0, 8, 0])]),
  M('rumpf_m', 'rumpf', [Q([-10, -8, -20.75], [10, 8, 20.75])], [P('vorn', [0, 0, 20], Z, Y, 'M', 'rumpf', RUMPF), P('hinten', [0, 0, -20], NZ, Y, 'M', 'rumpf', RUMPF), turmPunkt([0, 8, 0])]),
  M('heck_m', 'heck', [Q([-10, -8, -10], [10, 8, 10.75])], [P('vorn', [0, 0, 10], Z, Y, 'M', 'rumpf', RUMPF)], { werte: { masse: 10, schub: 50 }, duesen: [{ p: [0, 0, -10], r: 3 }] }),
  M('turm_s', 'turm', [Q([-2, 0, -2], [2, 3, 2])], [fuss()], { turm: { typ: 'flak', s: 1 }, ersetzt: ['turm_alt'] }),
  M('turm_lang', 'turm', [Q([-2, -3, -2], [2, 3, 40])], [fuss()], { turm: { typ: 'schwer', s: 1 } }),
  M('anbau_s', 'anbau', [Q([-2, 0, -2], [2, 2, 2])], [fuss('anbau')]),
  M('rumpf_l', 'rumpf', [Q([-18, -12, -20], [18, 12, 20])], [P('vorn', [0, 0, 20], Z, Y, 'L', 'rumpf', RUMPF), P('hinten', [0, 0, -20], NZ, Y, 'L', 'rumpf', RUMPF)]),
  M('ecke_m', 'rumpf', [Q([-10, -8, -10], [11.5, 8, 11.5])], [P('a', [0, 0, 10], Z, Y, 'M', 'rumpf', RUMPF), P('b', [10, 0, 0], X, Y, 'M', 'rumpf', RUMPF)]),
];
// Gegenprobe Ring-Schluss: Rumpf, dessen Bug-Punkt 2 mm zu weit vorn liegt
const schief = kopie(MODULE.find((m) => m.id === 'rumpf_m')); schief.id = schief.name = 'rumpf_schief'; schief.andock[0].p = [0, 0, 20.002];
MODULE.push(schief);
const KAT = tiefFrieren(Object.fromEntries(MODULE.map((m) => [m.id, m])));

// ---------- 1) LAGEN ----------
zeile('LAGEN: 24 verschieden, ganzzahlig orthonormal, det +1', 'ja', `${LAGEN.length} St.`, pruefeLagen(LAGEN));
{
  const gespiegelt = kopie(LAGEN); gespiegelt[5] = gespiegelt[5].map((z) => [-z[0], z[1], z[2]]); // Spalte 0 negiert → det −1
  const doppelt = kopie(LAGEN); doppelt[7] = doppelt[3];
  const gestreckt = kopie(LAGEN); gestreckt[0] = [[2, 0, 0], [0, 1, 0], [0, 0, 1]];
  zeile('Gegenprobe LAGEN: Spiegelung / Doppel / Streckung erkannt', 'alle 3 rot', [gespiegelt, doppelt, gestreckt].map((l) => pruefeLagen(l) ? 'grün' : 'rot').join(' / '),
    !pruefeLagen(gespiegelt) && !pruefeLagen(doppelt) && !pruefeLagen(gestreckt));
}

// ---------- 2) andockLage ----------
const lageKey = (m) => JSON.stringify(m);
const LAGEN_SET = new Set(LAGEN.map(lageKey));
const deckung = (lE, pE, lK, pK) => abst(wende(lK, pK.p), wende(lE, pE.p));
{
  const punkte = MODULE.filter((m) => m.id !== 'rumpf_schief').flatMap((m) => m.andock);
  let faelle = 0, maxDeck = 0, nFalsch = 0, uFalsch = 0, nichtLage = 0, dreh4 = 0, verschieden = 0, inversFalsch = 0;
  for (const mE of LAGEN) {
    const lE = { m: mE, t: [3.5, -2, 7.25] };
    for (const pE of punkte) for (const pK of punkte) {
      const ms = [];
      for (let d = 0; d < 4; d++) {
        const lK = andockLage(lE, pE, pK, d); faelle++;
        maxDeck = Math.max(maxDeck, deckung(lE, pE, lK, pK));
        if (abst(mv(lK.m, pK.n), mv(mE, pE.n).map((x) => -x)) !== 0) nFalsch++;
        if (d === 0 && abst(mv(lK.m, pK.u), mv(mE, pE.u)) !== 0) uFalsch++;
        if (!LAGEN_SET.has(lageKey(lK.m))) nichtLage++;
        ms.push(lageKey(lK.m));
      }
      if (new Set(ms).size === 4) verschieden++;
      if (lageKey(andockLage(lE, pE, pK, 4).m) !== ms[0] || lageKey(andockLage(lE, pE, pK, -1).m) !== ms[3]) dreh4++;
    }
  }
  // Gegenrichtung: B an A (A in EINHEIT) und A an B (B in EINHEIT), gleiche dreh → zueinander invers
  for (const pA of punkte) for (const pB of punkte) for (let d = 0; d < 4; d++) {
    const lB = andockLage(EINHEIT, pA, pB, d), lA = andockLage(EINHEIT, pB, pA, d);
    const mi = trans(lB.m), ti = mv(mi, lB.t).map((x) => -x);
    if (!gleichM(lA.m, mi) || abst(lA.t, ti) > 1e-9) inversFalsch++;
  }
  const paare = punkte.length ** 2;
  zeile(`andockLage: Punkte decken sich (${faelle} Fälle) m`, '< 0,001', maxDeck.toExponential(1), maxDeck < 1e-3);
  zeile('andockLage: Kind-n = −Eltern-n (exakt)', '0 falsch', nFalsch, nFalsch === 0);
  zeile('andockLage: Kind-u = Eltern-u bei dreh 0', '0 falsch', uFalsch, uFalsch === 0);
  zeile('andockLage: Ergebnis ∈ LAGEN', '0 außerhalb', nichtLage, nichtLage === 0);
  zeile('andockLage: dreh 0..3 vier verschiedene Lagen', `${paare * 24}`, verschieden, verschieden === paare * 24);
  zeile('andockLage: dreh 4 = 0, dreh −1 = 3', '0 falsch', dreh4, dreh4 === 0);
  zeile(`andockLage: Gegenrichtung = inverse Lage (${paare * 4} Fälle)`, '0 falsch', inversFalsch, inversFalsch === 0);

  // Gegenproben: verschobener Punkt (2 mm) und falsche Lage (Einheit statt Andocklage) müssen anschlagen
  const r = KAT.rumpf_m, pE = r.andock[1], pK = r.andock[0];
  const lK = andockLage(EINHEIT, pE, pK, 0);
  const verschoben = { ...pK, p: [pK.p[0], pK.p[1], pK.p[2] + 0.002] };
  const d2 = deckung(EINHEIT, pE, lK, verschoben);
  // WARUM hinten an hinten: beide n = −Z — in der Einheitslage zeigen sie gleich statt entgegen
  const nGegen = abst(mv(EINHEIT.m, pE.n), mv(EINHEIT.m, pE.n).map((x) => -x));
  zeile('Gegenprobe: Kindpunkt 2 mm verschoben → Deckung rot', '> 0,001 m', d2.toFixed(4), d2 > 1e-3);
  zeile('Gegenprobe: Einheitslage statt Andocklage → n-Prüfung rot', '≠ 0', nGegen, nGegen !== 0);

  // 50 Segmente: gerade Kette nach hinten, dreh abwechselnd 0/2 → Mittelpunkt k exakt bei z = −40·k
  let lage = EINHEIT, drift = 0, allesLage = true;
  for (let k = 1; k <= 50; k++) {
    lage = andockLage(lage, r.andock[1], r.andock[0], k % 2 ? 2 : 0);
    drift = Math.max(drift, abst(lage.t, [0, 0, -40 * k]));
    if (!istLage(lage.m)) allesLage = false;
  }
  zeile('50 Segmente: Drift der Mittelpunkte m', '0 (exakt)', drift, drift === 0 && allesLage);
}

// ---------- 3) baue-Meldungen ----------
const BASIS = tiefFrieren({ name: 'basis', kennung: 'T-1', version: 1, teile: [
  { nr: 0, modul: 'kommando_m' },
  { nr: 1, modul: 'rumpf_m', an: { nr: 0, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 },
  { nr: 2, modul: 'heck_m', an: { nr: 1, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 },
  { nr: 3, modul: 'turm_s', an: { nr: 1, punkt: 'oben' }, punkt: 'fuss', dreh: 0 },
] });
/** Entwurf aus BASIS ableiten: f bekommt eine veränderbare Kopie der Teile-Liste. */
const aus = (f, oben = {}) => tiefFrieren({ ...kopie(BASIS), ...oben, teile: f(kopie(BASIS.teile)) });
const plus = (...neu) => (t) => [...t, ...neu];
const ersetze = (nr, was) => (t) => t.map((x) => x.nr === nr ? { ...x, ...was } : x);
const ohne = (nr) => (t) => t.filter((x) => x.nr !== nr);
const T4 = (an, extra = {}) => ({ nr: 4, modul: 'turm_s', an, punkt: 'fuss', dreh: 0, ...extra });

const FEHLER = new Set(['modul_unbekannt', 'punkt_unbekannt', 'punkt_belegt', 'passt_nicht', 'dreh_verboten', 'eltern_fehlt', 'zyklus', 'wurzel', 'nr_doppelt', 'ueberschneidung', 'kein_kommando', 'kein_heck', 'version']);
const WARNUNG = new Set(['offen_rumpf', 'kein_turm', 'mehrere_kommando']);
const schluessel = (ms) => ms.map((m) => m.code + (m.nr !== undefined ? ':' + m.nr : '')).sort().join(' ');
let stufeFalsch = [], absturz = [];
const baueSicher = (name, e) => { try { return baue(e, KAT); } catch (f) { absturz.push(`${name}: ${f.message}`); return { meldungen: [{ code: 'ABSTURZ' }], teile: [] }; } };

{
  const b = baueSicher('Basis', BASIS);
  zeile('Basis (Kommando, Rumpf, Heck, Turm): Meldungen', 'keine, flugfähig', schluessel(b.meldungen) || 'keine', b.meldungen.length === 0 && b.flugfaehig === true);
}

// [Name, kaputter Entwurf, erwartete Meldungen (code:nr, sortiert), behobener Entwurf (muss meldungsfrei sein)]
const FAELLE = [
  ['modul_unbekannt', aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), modul: 'gibt_es_nicht' })), 'modul_unbekannt:4', aus(plus(T4({ nr: 0, punkt: 'oben' })))],
  ['modul_unbekannt (alte Id über ersetzt)', aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), modul: 'gibt_es_nicht' })), 'modul_unbekannt:4', aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), modul: 'turm_alt' }))],
  ['modul_unbekannt an der Wurzel', aus(ersetze(0, { modul: 'gibt_es_nicht' })), 'eltern_fehlt:1 eltern_fehlt:2 eltern_fehlt:3 modul_unbekannt:0', BASIS],
  ['punkt_unbekannt (Eltern-Punkt)', aus(plus(T4({ nr: 0, punkt: 'obenx' }))), 'punkt_unbekannt:4', aus(plus(T4({ nr: 0, punkt: 'oben' })))],
  ['punkt_unbekannt (Kind-Punkt)', aus(plus(T4({ nr: 0, punkt: 'oben' }, { punkt: 'fussx' }))), 'punkt_unbekannt:4', aus(plus(T4({ nr: 0, punkt: 'oben' })))],
  ['punkt_belegt (zweiter Turm)', aus(plus(T4({ nr: 1, punkt: 'oben' }))), 'punkt_belegt:4', aus(plus(T4({ nr: 0, punkt: 'oben' })))],
  ['punkt_belegt (eigener Andockpunkt des Elternteils)', aus(plus({ nr: 4, modul: 'rumpf_m', an: { nr: 1, punkt: 'vorn' }, punkt: 'hinten', dreh: 0 })), 'punkt_belegt:4', BASIS],
  ['passt_nicht (Art: Anbau an Turmpunkt)', aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), modul: 'anbau_s' })), 'passt_nicht:4', BASIS],
  ['passt_nicht (Größe: L an M)', aus(ersetze(2, { modul: 'rumpf_l' })), 'kein_heck offen_rumpf:2 passt_nicht:2', BASIS],
  ['dreh_verboten (Rumpf dreh 1)', aus(ersetze(2, { dreh: 1 })), 'dreh_verboten:2', aus(ersetze(2, { dreh: 2 }))],
  ['dreh_verboten (dreh 4)', aus(ersetze(2, { dreh: 4 })), 'dreh_verboten:2', aus(ersetze(3, { dreh: 3 }))],
  ['eltern_fehlt', aus(plus(T4({ nr: 9, punkt: 'oben' }))), 'eltern_fehlt:4', BASIS],
  ['zyklus (an sich selbst)', aus(plus(T4({ nr: 4, punkt: 'fuss' }))), 'zyklus:4', BASIS],
  ['zyklus (zwei Teile)', aus(plus(T4({ nr: 5, punkt: 'fuss' }), { ...T4({ nr: 4, punkt: 'fuss' }), nr: 5 })), 'zyklus:4 zyklus:5', BASIS],
  ['wurzel (zweites Startteil)', aus(plus({ nr: 4, modul: 'turm_s' })), 'wurzel:4', BASIS],
  ['wurzel (kein Startteil)', aus(ersetze(0, { an: { nr: 3, punkt: 'oben' }, punkt: 'hinten' })), 'wurzel zyklus:0 zyklus:1 zyklus:2 zyklus:3', BASIS],
  ['nr_doppelt', aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), nr: 3 })), 'nr_doppelt:3', BASIS],
  ['nr_doppelt (keine Zahl)', aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), nr: 'x' })), 'nr_doppelt', BASIS],
  ['ueberschneidung (langer Turm ragt ins Kommando)', aus(ersetze(3, { modul: 'turm_lang' })), 'ueberschneidung:3', BASIS],
  ['kein_kommando', aus(ersetze(0, { modul: 'bug_m' })), 'kein_kommando', BASIS],
  ['kein_heck (Bug als Abschluss)', aus(ersetze(2, { modul: 'bug_m', punkt: 'hinten' })), 'kein_heck', BASIS],
  ['version (2)', aus((t) => t, { version: 2 }), 'version', BASIS],
  ['version (keine Zahl)', aus((t) => t, { version: 'x' }), 'version', aus((t) => t, { version: undefined })],
  ['offen_rumpf (Heck fehlt)', aus(ohne(2)), 'kein_heck offen_rumpf:1', BASIS],
  ['kein_turm', aus(ohne(3)), 'kein_turm', BASIS],
  ['mehrere_kommando', aus(ersetze(2, { modul: 'kommando_m', punkt: 'hinten' })), 'kein_heck mehrere_kommando', BASIS],
];
{
  const falsch = [], nichtWeg = [], ungeordnet = [];
  const abgedeckt = new Set();
  for (const [name, kaputt, soll, heil] of FAELLE) {
    const b = baueSicher(name, kaputt), ist = schluessel(b.meldungen);
    if (ist !== soll) falsch.push(`${name}: „${ist}“ statt „${soll}“`);
    for (const m of b.meldungen) {
      abgedeckt.add(m.code);
      if (!(m.stufe === 'fehler' ? FEHLER : WARNUNG).has(m.code) || typeof m.text !== 'string' || !m.text) stufeFalsch.push(`${name}: ${m.code}/${m.stufe}`);
    }
    if (b.flugfaehig !== !b.meldungen.some((m) => m.stufe === 'fehler')) stufeFalsch.push(`${name}: flugfaehig`);
    const h = baueSicher(name + ' (behoben)', heil);
    if (h.meldungen.length) nichtWeg.push(`${name}: ${schluessel(h.meldungen)}`);
    // Ungeordnete Liste: umgekehrte Reihenfolge muss dasselbe Ergebnis geben
    const umgekehrt = tiefFrieren({ ...kopie(kaputt), teile: kopie(kaputt.teile).reverse() });
    // WARUM Meldungen sortiert: ihre Reihenfolge folgt der Liste (harmlos, gleiche Eingabe → gleiche Reihenfolge)
    const ordne = (x) => JSON.stringify({ ...x, meldungen: [...x.meldungen].sort((p, q) => JSON.stringify(p) < JSON.stringify(q) ? -1 : 1) });
    if (ordne(baueSicher(name + ' (umgekehrt)', umgekehrt)) !== ordne(b)) ungeordnet.push(name);
  }
  const fehlend = [...FEHLER, ...WARNUNG].filter((c) => !abgedeckt.has(c));
  zeile(`Meldungen: ${FAELLE.length} kleinste Entwürfe → genau die erwarteten Codes`, '0 falsch', falsch.length ? falsch.join(' | ') : 0, falsch.length === 0);
  zeile('Meldungen: alle 16 Codes aus E6 mindestens einmal ausgelöst', 'alle', fehlend.length ? 'fehlt: ' + fehlend.join(', ') : 'alle', fehlend.length === 0);
  zeile('Meldungen: Stufe passt zum Code, Text vorhanden, flugfaehig = keine Fehler', '0 falsch', stufeFalsch.length ? stufeFalsch.join(', ') : 0, stufeFalsch.length === 0);
  zeile('Meldungen: behobene Entwürfe meldungsfrei', '0', nichtWeg.length ? nichtWeg.join(' | ') : 0, nichtWeg.length === 0);
  // WARUM weich nur für wurzel/nr_doppelt: Befund an die Projektleitung (Startteil bzw. behaltenes Doppel hängt an der
  // Listenreihenfolge, beides schon Fehler-Entwürfe) — jede andere Abweichung ist hart
  zeile('Ungeordnete Liste (umgekehrt) → gleiches Ergebnis', '0 abweichend', ungeordnet.length ? ungeordnet.join(', ') : 0, ungeordnet.length === 0,
    !ungeordnet.every((n) => n.startsWith('wurzel') || n.startsWith('nr_doppelt')));
}

// Gegenprobe der Fall-Prüfung: eine absichtlich falsche Erwartung muss als „falsch“ zählen
{
  const b = baueSicher('Gegenprobe', aus(ohne(3)));
  zeile('Gegenprobe Meldungen: kein_turm-Entwurf gegen Erwartung „keine“', 'rot', schluessel(b.meldungen) === '' ? 'grün' : 'rot', schluessel(b.meldungen) !== '');
}

// Ring-Schluss: vier Ecken + vier Rumpfsegmente, das letzte Segment trifft die Wurzel-Ecke von selbst
const ring = (letztes) => tiefFrieren({ name: 'ring', version: 1, teile: [
  { nr: 0, modul: 'ecke_m' },
  { nr: 1, modul: 'rumpf_m', an: { nr: 0, punkt: 'b' }, punkt: 'hinten', dreh: 0 },
  { nr: 2, modul: 'ecke_m', an: { nr: 1, punkt: 'vorn' }, punkt: 'a', dreh: 0 },
  { nr: 3, modul: 'rumpf_m', an: { nr: 2, punkt: 'b' }, punkt: 'hinten', dreh: 0 },
  { nr: 4, modul: 'ecke_m', an: { nr: 3, punkt: 'vorn' }, punkt: 'a', dreh: 0 },
  { nr: 5, modul: 'rumpf_m', an: { nr: 4, punkt: 'b' }, punkt: 'hinten', dreh: 0 },
  { nr: 6, modul: 'ecke_m', an: { nr: 5, punkt: 'vorn' }, punkt: 'a', dreh: 0 },
  { nr: 7, modul: letztes, an: { nr: 6, punkt: 'b' }, punkt: 'hinten', dreh: 0 },
] });
{
  const codes = (b) => b.meldungen.filter((m) => !['kein_kommando', 'kein_heck', 'kein_turm'].includes(m.code));
  const b = baueSicher('Ring', ring('rumpf_m'));
  const zu = b.verbunden?.some(([a, c]) => (a === 7 && c === 0) || (a === 0 && c === 7));
  const offenRumpf = b.freiePunkte.filter((f) => f.art === 'rumpf').length;
  zeile('Ring-Schluss: 7↔0 verbunden, keine offen_rumpf/ueberschneidung', 'ja, 0', `${zu ? 'verbunden' : 'NICHT verbunden'}, ${schluessel(codes(b)) || 0}, freie Rumpfpunkte ${offenRumpf}`,
    zu && codes(b).length === 0 && offenRumpf === 0);
  const g = baueSicher('Ring schief', ring('rumpf_schief'));
  zeile('Gegenprobe Ring: Bugpunkt 2 mm daneben → offen + Überschneidung', 'offen_rumpf:0, offen_rumpf:7, ueberschneidung:7', schluessel(codes(g)),
    schluessel(codes(g)) === 'offen_rumpf:0 offen_rumpf:7 ueberschneidung:7');
}

// 50 Segmente über baue(): Kommando + 50 Rumpf + Heck — letzte Lage exakt
{
  const teile = [{ nr: 0, modul: 'kommando_m' }];
  for (let k = 1; k <= 50; k++) teile.push({ nr: k, modul: 'rumpf_m', an: { nr: k - 1, punkt: 'hinten' }, punkt: 'vorn', dreh: k % 2 ? 2 : 0 });
  teile.push({ nr: 51, modul: 'heck_m', an: { nr: 50, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 });
  const b = baueSicher('Kette 50', tiefFrieren({ version: 1, teile }));
  const letzt = b.teile.find((t) => t.nr === 51);
  // Kommando-Heckpunkt z = −10, Segment k Mitte bei −10 − 20 − 40·(k−1), Heck-Mitte = Segment-50-Heckpunkt − 10
  const soll = -10 - 40 * 50 - 10;
  zeile('baue: 50 Segmente, Heck-Mitte z m', String(soll), letzt ? letzt.lage.t.join(', ') : 'fehlt', !!letzt && abst(letzt.lage.t, [0, 0, soll]) === 0 && schluessel(b.meldungen) === 'kein_turm');
  // Kommando-Bug z = +10 (Quader), Heck-Quader reicht 10 m hinter seine Mitte → 10 + 2020 + 10
  zeile('baue: Länge der Kette m', '2040', b.laenge, Math.abs(b.laenge - 2040) < 1e-9);
}

// Gleichlauf + eingefrorene Eingaben
{
  const a = JSON.stringify(baueSicher('Gleichlauf 1', BASIS)), b = JSON.stringify(baueSicher('Gleichlauf 2', BASIS));
  const frisch = JSON.stringify(baue(kopie(BASIS), Object.fromEntries(MODULE.map((m) => [m.id, kopie(m)]))));
  zeile('Gleichlauf: zweimal baue(BASIS) gleich, eingefroren = frische Kopie', 'gleich', a === b && a === frisch ? 'gleich' : 'ABWEICHUNG', a === b && a === frisch);
  zeile('Eingefrorene Eingaben (alle Fälle): kein Absturz', '0', absturz.length ? absturz.join(' | ') : 0, absturz.length === 0);
}

// ---------- 4) loesche, naechsteNr, kandidaten ----------
{
  const nurKopf = loesche(BASIS, 1), leer = loesche(BASIS, 0), nurTurm = loesche(BASIS, 3);
  const nrs = (e) => e.teile.map((t) => t.nr).join(',');
  zeile('loesche(1) nimmt Nachkommen 2, 3 mit; loesche(0) leert; loesche(3) nur Turm', '0 | – | 0,1,2', `${nrs(nurKopf)} | ${nrs(leer) || '–'} | ${nrs(nurTurm)}`,
    nrs(nurKopf) === '0' && nrs(leer) === '' && nrs(nurTurm) === '0,1,2' && nurKopf.name === 'basis' && BASIS.teile.length === 4);
  const n = [naechsteNr(BASIS), naechsteNr(nurTurm), naechsteNr(leer), naechsteNr(aus(plus({ ...T4({ nr: 0, punkt: 'oben' }), nr: 17 })))];
  zeile('naechsteNr: Basis | ohne Turm | leer | mit nr 17', '4 | 3 | 0 | 18', n.join(' | '), n.join() === '4,3,0,18');

  const bau = baue(BASIS, KAT), ohneHeck = baue(aus(ohne(2)), KAT), leerBau = baue({ version: 1, teile: [] }, KAT);
  const k = [kandidaten(bau, KAT, 'turm_s').length, kandidaten(bau, KAT, 'rumpf_m').length, kandidaten(ohneHeck, KAT, 'rumpf_m').length,
    kandidaten(ohneHeck, KAT, 'heck_m').length, kandidaten(ohneHeck, KAT, 'rumpf_l').length, kandidaten(bau, KAT, 'gibt_es_nicht').length, kandidaten(leerBau, KAT, 'turm_s').length];
  zeile('kandidaten: Turm | Rumpf | Rumpf ohne Heck | Heck ohne Heck | L | unbekannt | leer', '1 | 1 | 3 | 1 | 0 | 0 | 0', k.join(' | '), k.join() === '1,1,3,1,0,0,0');
  // WARUM Rumpf = 1 bzw. 3: der Turmpunkt „oben“ des Rumpfs passt (S/turm) auf den freien Turmpunkt des Kommandos — siehe nächste Zeile
  const kopf = baue(tiefFrieren({ version: 1, teile: [{ nr: 0, modul: 'kommando_m' }, { nr: 1, modul: 'rumpf_m', an: { nr: 0, punkt: 'oben' }, punkt: 'oben', dreh: 0 }] }), KAT);
  const kf = kopf.meldungen.filter((m) => m.stufe === 'fehler' && m.code !== 'kein_heck');
  // WARUM weich: Befund an die Projektleitung (Punkt-Rolle fehlt), Regel E2 erlaubt es bisher
  zeile('Rumpf mit seinem Turmpunkt auf Turmpunkt gesetzt → Fehler', '≥ 1 Fehler', schluessel(kf) || 'keiner', kf.length > 0, false);
  // Kandidat ist an der gemeldeten Stelle wirklich andockbar: Lage per andockLage → Punkt sitzt auf dem freien Punkt
  let maxD = 0;
  for (const c of kandidaten(ohneHeck, KAT, 'rumpf_m')) {
    const eltern = ohneHeck.teile.find((t) => t.nr === c.an.nr), pE = KAT[eltern.modul].andock.find((p) => p.id === c.an.punkt), pK = KAT.rumpf_m.andock.find((p) => p.id === c.punkt);
    for (const d of c.dreh) { const l = andockLage(eltern.lage, pE, pK, d); maxD = Math.max(maxD, abst(wende(l, pK.p), c.frei.p), abst(dreheV(l.m, pK.n), c.frei.n.map((x) => -x))); }
  }
  zeile('kandidaten: Lage aus andockLage sitzt auf dem freien Punkt', '0', maxD, maxD === 0);
}

// ---------- 5) Datei-Ablage ----------
async function rufe(handler, method, url, stuecke = []) {
  const req = Readable.from(stuecke.map((s) => Buffer.isBuffer(s) ? s : Buffer.from(s)));
  req.method = method; req.url = url;
  const res = { statusCode: 0, kopf: {}, setHeader(k, v) { this.kopf[k] = v; }, end(t) { this.text = t; } };
  await handler(req, res);
  let daten; try { daten = JSON.parse(res.text); } catch { daten = res.text; }
  return { code: res.statusCode, daten, typ: res.kopf['Content-Type'] };
}
{
  const wurzel = await mkdtemp(join(tmpdir(), 'werft-test-')), ordner = join(wurzel, 'konfig', 'schiffe');
  try {
    const h = ablage({ ordner, max: 2000, wurzel });
    const entwurf = kopie(BASIS);
    const post = await rufe(h, 'POST', '/Test%20Schiff', [JSON.stringify(entwurf)]);
    const get = await rufe(h, 'GET', '/Test%20Schiff');
    const g = get.daten || {};
    const gleich = JSON.stringify(baue(g, KAT)) === JSON.stringify(baue(entwurf, KAT));
    zeile('Ablage: POST → GET Rundlauf, baue gleich, fremde Felder da', '200/200, gleich', `${post.code}/${get.code}, ${gleich ? 'gleich' : 'ANDERS'}, name „${g.name}“, gespeichert ${typeof g.gespeichert}`,
      post.code === 200 && get.code === 200 && gleich && g.name === 'Test Schiff' && typeof g.gespeichert === 'string' && post.daten?.datei === 'konfig/schiffe/Test_Schiff.json'
      && JSON.stringify(g.teile) === JSON.stringify(entwurf.teile) && /json/.test(get.typ));
    // Umlaut über eine Stückgrenze zerrissen („ä“ = 2 Bytes)
    const roh = Buffer.from(JSON.stringify({ version: 1, teile: [], kennung: 'Bärenklaue' }), 'utf8'), schnitt = roh.indexOf(0xc3) + 1;
    const um = await rufe(h, 'POST', '/B%C3%A4r', [roh.subarray(0, schnitt), roh.subarray(schnitt)]);
    const umGet = await rufe(h, 'GET', '/B%C3%A4r');
    zeile('Ablage: Umlaut im Namen und über Stückgrenze', '200, „Bärenklaue“', `${um.code}, „${umGet.daten?.kennung}“`, um.code === 200 && umGet.daten?.kennung === 'Bärenklaue');
    const liste = await rufe(h, 'GET', '/');
    zeile('Ablage: Liste', '[Bär, Test Schiff]', JSON.stringify(liste.daten), liste.code === 200 && JSON.stringify(liste.daten) === JSON.stringify(['Bär', 'Test Schiff']));

    const namen = ['/a.b', '/a/b', '/CON', '/nul', '/..%2Fx', '/' + 'x'.repeat(41), '/%E0%A4%A'];
    const codes = []; for (const u of namen) codes.push((await rufe(h, 'POST', u, ['{}'])).code);
    zeile('Ablage: Namen . / CON nul ..%2F 41 Zeichen, kaputte Kodierung', '7 × 400', codes.join(' '), codes.every((c) => c === 400));
    const vierzig = await rufe(h, 'POST', '/' + 'x'.repeat(40), ['{}']);
    zeile('Ablage: 40 Zeichen erlaubt (Grenze)', '200', vierzig.code, vierzig.code === 200);

    const grenze = '{"a":"' + 'x'.repeat(2000 - 8) + '"}'; // genau 2000 Bytes
    const amMax = await rufe(h, 'POST', '/gross', [grenze]);
    const drueber = await rufe(h, 'POST', '/gross', [grenze.slice(0, 1000), grenze.slice(1000) + ' ']);
    zeile('Ablage: genau max (2000 B) | max + 1', '200 | 413', `${amMax.code} | ${drueber.code}`, Buffer.byteLength(grenze) === 2000 && amMax.code === 200 && drueber.code === 413);

    const k = []; for (const body of ['kein json', '[1,2]', 'null', '"text"', '']) k.push((await rufe(h, 'POST', '/x', [body])).code);
    zeile('Ablage: kein JSON | Array | null | Text | leer', '5 × 400', k.join(' '), k.every((c) => c === 400));
    await writeFile(join(ordner, 'kaputt.json'), '{ "teile": [', 'utf8');
    const s = [(await rufe(h, 'GET', '/gibt%20es%20nicht')).code, (await rufe(h, 'GET', '/kaputt')).code, (await rufe(h, 'PUT', '/x', ['{}'])).code, (await rufe(h, 'POST', '/', ['{}'])).code];
    zeile('Ablage: unbekannt | kaputte Datei | PUT | POST ohne Name', '404 | 422 | 405 | 405', s.join(' | '), s.join() === '404,422,405,405');
  } finally {
    await rm(wurzel, { recursive: true, force: true });
  }
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

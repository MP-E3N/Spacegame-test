// ZWECK: Prüfungen ohne Browser für die Form-Werkstatt (Runde 16, `node tests/form.mjs`): Mathematik in
//        src/sim/form/form.js und Grafik (src/grafik/form/*: Loft, Verschweißen, Werft-Anbindung).
//   1) Profil: 32 Punkte, gegen den Uhrzeigersinn, Start rechts oben, keine Nullkanten, Kreis ±1 %, Anschluss = Werft-NORM.
//   2) Zufallsfelder → alles endlich; normalisiere idempotent und ohne Änderung der Eingabe.
//   3) drehMatrix gegen three (Euler 'XYZ') bis 1e-12, Vielfache von 90° exakt; huelle gegen three-Box3; volumen.
//   4) pruefe: jeder Code; Andockpunkte einrasten (F3); formId (F4); Version (F5).
//   5) formZuModul → baue() der Werft: Startteil, Anschluss-Form an rumpf_m_kurz (Fuge, keine Überschneidung), Gleichlauf.
//   6) form.js rein. 7) Grafik: roher Loft je Vorlage dicht + Volumen (Prismatoid), Beispielformen verschweißt (dicht,
//      Zeit, Volumen gegen Abtastung, gleiches Netz), Gegenproben Spiegel/Zugabe, Werft-Entwurf mit allen Beispielformen.
//   Jede Gegenprobe (Zeile „Gegenprobe …“) füttert die Prüfung mit absichtlich falschen Daten und MUSS anschlagen.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { PROFIL_N, profilPunkte, profilFlaeche, VORLAGEN, neuerKoerper, normalisiere, pruefe, drehMatrix, koerperListe,
  koerperMatrix, wendeK, huelle, volumen, formZuModul, formId, koerperSchluessel, DICHTE, VERSION } from '../src/sim/form/form.js';
import { KATALOG, NORM } from '../src/sim/werft/module.js';
import { baue, andockLage, LAGEN, EINHEIT, wende, dreheV } from '../src/sim/werft/zusammenbau.js';
import { dateiname } from '../server/ablage.js';
import { profil } from '../src/grafik/schiff/bauteile.js';
import { zufall } from '../src/grafik/zufall.js';
import { koerperGeometrie, koerperNetz, lageMatrix4 } from '../src/grafik/form/koerper.js';
import { formGeometrie, offeneKanten } from '../src/grafik/form/schweissen.js';
import { registriereForm, schiffNetz } from '../src/grafik/schiff/module.js';
import { BEISPIEL_FORMEN } from '../src/sim/form/beispiele.js';
import { BEISPIEL } from '../src/sim/werft/beispiel.js';
const T_START = performance.now();
// WARUM: three-bvh-csg ruft three-mesh-bvh mit der alten Option maxLeafSize auf → eine Warnung je CSG-Schritt (Hunderte
// Zeilen). Nur genau diese Meldung wird gezählt statt gedruckt (Info-Zeile am Ende), alle anderen Warnungen bleiben sichtbar.
const bvh = { warnungen: 0 }, warnAlt = console.warn;
console.warn = (...a) => (String(a[0]).startsWith('BVH: "maxLeafSize"') ? bvh.warnungen++ : warnAlt(...a));

const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const kopie = (o) => JSON.parse(JSON.stringify(o));
const tiefFrieren = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(tiefFrieren); } return o; };
const abst = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const schluessel = (ms) => ms.map((m) => m.code + (m.id !== undefined ? ':' + m.id : '')).sort().join(' ');
/** Alle Zahlen eines Objekts endlich? Gibt den ersten Pfad mit NaN/Infinity zurück (oder ''). */
const unendlich = (o, pfad = '') => {
  if (typeof o === 'number') return Number.isFinite(o) ? '' : pfad || '.';
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const f = unendlich(v, pfad + '.' + k); if (f) return f; }
  return '';
};
const rnd = zufall(1616);
const zwischen = (a, b) => a + (b - a) * rnd();

// ---------- 1) Profil ----------
/** Kanten, Umlaufsinn, Startpunkt eines Profils. */
function profilMass(s) {
  const p = profilPunkte(s);
  let flaeche = 0, kurz = Infinity;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    flaeche += p[i][0] * q[1] - q[0] * p[i][1];
    kurz = Math.min(kurz, Math.hypot(q[0] - p[i][0], q[1] - p[i][1]));
  }
  const ox = s.x ?? 0, oy = s.y ?? 0;
  return { n: p.length, flaeche: flaeche / 2, kurz, start: p[0][0] > ox && p[0][1] >= oy, endlich: p.flat().every(Number.isFinite) };
}
{
  const spanten = Object.entries(VORLAGEN).flatMap(([n, v]) => v.spanten.map((s) => ({ n, s })));
  for (let i = 0; i < 400; i++) spanten.push({ n: 'zufall', s: normalisiere({ koerper: [{ spanten: [{ z: 0, b: zwischen(0.1, 60), h: zwischen(0.1, 60),
    rundung: rnd() < 0.2 ? 0 : rnd() < 0.2 ? 1 : rnd(), fase: rnd() < 0.3 ? 0 : rnd(), x: zwischen(-5, 5), y: zwischen(-5, 5) }] }] }).koerper[0].spanten[0] });
  // Ränder: kleinste Maße, Kreis/Raute mit b = h, extrem flach
  for (const [b, h, r, f] of [[0.1, 0.1, 1, 0], [0.1, 0.1, 0, 1], [0.1, 400, 1, 1], [400, 0.1, 0, 0], [6, 6, 1, 0], [6, 6, 0, 1], [6, 6, 1, 1]]) spanten.push({ n: 'rand', s: { z: 0, b, h, rundung: r, fase: f } });
  let falsch = [], kurzMin = Infinity, kurzWo = '';
  for (const { n, s } of spanten) {
    const m = profilMass(s);
    if (m.n !== PROFIL_N || !(m.flaeche > 0) || !m.start || !m.endlich) falsch.push(`${n} ${JSON.stringify(s)}`);
    if (m.kurz < kurzMin) { kurzMin = m.kurz; kurzWo = `${n} b${s.b.toFixed?.(2)} h${s.h.toFixed?.(2)} r${(s.rundung ?? 0).toFixed(2)} f${(s.fase ?? 0).toFixed(2)}`; }
  }
  zeile(`Profil: ${spanten.length} Spanten — 32 Punkte, gegen Uhrzeigersinn, Start rechts oben, endlich`, '0 falsch', falsch.length ? falsch.slice(0, 2).join(' | ') : 0, falsch.length === 0);
  zeile('Profil: kürzeste Kante (keine Nullkanten)', '> 0,001 m', `${kurzMin.toFixed(4)} m (${kurzWo})`, kurzMin > 1e-3);
  // F1 (korrigiert nach Befund R16): innerhalb einer scharfen Ecke sind ~6 mm gewollt, Nullkanten verboten
  // (Einzug 3 cm, 7 Teilstücke) — kürzeste Kante der Quader-Vorlage darum > 1 mm, nicht ≥ 5 cm
  const quader = profilMass(VORLAGEN.quader.spanten[0]).kurz;
  zeile('Profil: kürzeste Kante Quader-Vorlage (F1: ~6 mm in der Ecke, keine Nullkante)', '> 0,001 m', quader.toFixed(4), quader > 1e-3);
  const gegen = profilMass({ z: 0, b: 0.06, h: 0.06, rundung: 1 }); // ohne normalisiere: b < 0,1 → Einzug ≤ 0
  zeile('Gegenprobe Profil: b = 0,06 ohne normalisiere → Kantenprüfung rot', 'rot', gegen.kurz > 1e-3 ? 'grün' : `rot (${gegen.kurz.toExponential(1)})`, !(gegen.kurz > 1e-3));

  // Kreis: Zylinder-Vorlage (b = h = 6, rundung 1) gegen π r²
  const kreis = profilFlaeche(VORLAGEN.zylinder.spanten[0]), soll = Math.PI * 9;
  zeile('Profil: Zylinder-Fläche gegen π·r²', '±1 %', `${kreis.toFixed(3)} / ${soll.toFixed(3)} (${(100 * (kreis / soll - 1)).toFixed(2)} %)`, Math.abs(kreis / soll - 1) <= 0.01);
  const viereck = profilFlaeche({ z: 0, b: 10, h: 6 });
  zeile('Profil: Rechteck 10 × 6 (Einzug 3 cm)', '60 ± 0,01', viereck.toFixed(4), Math.abs(viereck - 60) < 0.01);

  // Anschluss = Werft-NORM: jeder Profilpunkt liegt auf dem Achteck der Werft, jede Achteck-Ecke ist ein Profilpunkt
  const aufRand = (pt, poly) => Math.min(...poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy);
  }));
  const normVergleich = (vorlage, g) => {
    const N = NORM[g], acht = profil(N.w, N.h, N.fase), p = profilPunkte(VORLAGEN[vorlage].spanten[0]);
    return Math.max(...p.map((q) => aufRand(q, acht)), ...acht.map((e) => Math.min(...p.map((q) => Math.hypot(q[0] - e[0], q[1] - e[1])))));
  };
  const nm = normVergleich('anschluss_m', 'M'), nl = normVergleich('anschluss_l', 'L');
  zeile('Anschluss M / L = Werft-NORM (größter Abstand)', '< 1e-9 m', `${nm.toExponential(1)} / ${nl.toExponential(1)}`, nm < 1e-9 && nl < 1e-9);
  const falschNorm = (() => { const N = NORM.M, acht = profil(N.w, N.h, N.fase), p = profilPunkte({ z: 0, b: 20, h: 16, fase: 0.25 }); return Math.max(...p.map((q) => aufRand(q, acht))); })();
  zeile('Gegenprobe NORM: fase 0,25 statt 0,3 → rot', '> 1e-3 m', falschNorm.toFixed(3), falschNorm > 1e-3);
}

// ---------- 2) Zufallsfelder, normalisiere ----------
const MUELL = [NaN, Infinity, -Infinity, null, undefined, 'x', '5', {}, [], true, -1e308, 1e308, -0, 0.5, -7, 1e-12];
const m = () => MUELL[Math.floor(rnd() * MUELL.length)];
const muellForm = () => ({
  name: rnd() < 0.2 ? m() : 'Müll ' + Math.floor(rnd() * 99), version: rnd() < 0.3 ? m() : 1, art: rnd() < 0.5 ? 'rumpf' : m(),
  koerper: Array.from({ length: Math.floor(rnd() * 5) }, () => ({ id: m(), typ: m(), op: rnd() < 0.3 ? 'minus' : m(), mat: m(), pos: [m(), m(), m()], dreh: [m(), m(), m()], spiegel: m(),
    spanten: rnd() < 0.1 ? m() : Array.from({ length: Math.floor(rnd() * 4) }, () => ({ z: m(), b: m(), h: m(), x: m(), y: m(), rundung: m(), fase: m() })) })),
  andock: rnd() < 0.1 ? m() : Array.from({ length: Math.floor(rnd() * 4) }, () => ({ id: m(), p: [m(), m(), m()], n: [m(), m(), m()], u: rnd() < 0.5 ? [m(), m(), m()] : m(), groesse: m(), art: m(), stecker: m(), dreh: rnd() < 0.5 ? [m(), m()] : m() })),
});
{
  const unend = [], absturz = [], nichtIdem = [], geaendert = [];
  for (let i = 0; i < 300; i++) {
    const roh = muellForm(), vorher = JSON.stringify(roh);
    try {
      const n1 = normalisiere(roh), n2 = normalisiere(n1), mod = formZuModul(roh), me = pruefe(n1);
      for (const k of n1.koerper) { const h = huelle(k); if (k.spanten.length && unendlich(h)) unend.push(`huelle${unendlich(h)}`); if (unendlich(volumen(k))) unend.push('volumen'); }
      const f = unendlich(n1) || unendlich(mod) || unendlich(me);
      if (f) unend.push(`Form ${i}: ${f}`);
      if (JSON.stringify(n1) !== JSON.stringify(n2)) nichtIdem.push(i);
      if (JSON.stringify(roh) !== vorher) geaendert.push(i);
    } catch (e) { absturz.push(`Form ${i}: ${e.message}`); }
  }
  zeile('Zufallsfelder (300 Müll-Formen): kein Absturz', '0', absturz.length ? absturz.slice(0, 2).join(' | ') : 0, absturz.length === 0);
  zeile('Zufallsfelder: normalisiere/formZuModul/pruefe/huelle/volumen endlich', '0', unend.length ? unend.slice(0, 3).join(', ') : 0, unend.length === 0);
  zeile('normalisiere idempotent | Eingabe unverändert', '0 | 0', `${nichtIdem.length} | ${geaendert.length}`, nichtIdem.length === 0 && geaendert.length === 0);
  zeile('Gegenprobe Endlich-Prüfung: { a: [1, NaN] }', 'rot', unendlich({ a: [1, NaN] }) ? 'rot' : 'grün', !!unendlich({ a: [1, NaN] }));
  let ohneAbsturz = true; try { normalisiere(undefined); normalisiere(null); normalisiere(42); formZuModul(undefined); pruefe(normalisiere('x')); } catch { ohneAbsturz = false; }
  zeile('normalisiere/formZuModul mit undefined, null, Zahl, Text', 'kein Absturz', ohneAbsturz ? 'ok' : 'ABSTURZ', ohneAbsturz);
  const leer = normalisiere({ koerper: [{ spanten: [{}, {}] }] }).koerper[0].spanten[0];
  zeile('Fehlende Spant-Maße → 1 m (F1)', 'b 1, h 1', `b ${leer.b}, h ${leer.h}`, leer.b === 1 && leer.h === 1);
}

// ---------- 3) drehMatrix, huelle, volumen ----------
const threeMatrix = (g, ordnung = 'XYZ') => {
  const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...g.map((x) => x * Math.PI / 180), ordnung)).elements;
  return [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]];
};
const maxDiff = (a, b) => Math.max(...a.flat().map((x, i) => Math.abs(x - b.flat()[i])));
const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
{
  let diff = 0, gegen = Infinity;
  for (let i = 0; i < 500; i++) {
    const g = [zwischen(-720, 720), zwischen(-720, 720), zwischen(-720, 720)];
    diff = Math.max(diff, maxDiff(drehMatrix(g), threeMatrix(g)));
    gegen = Math.min(gegen, maxDiff(drehMatrix(g), threeMatrix(g, 'ZYX')));
  }
  zeile('drehMatrix = three Euler XYZ (500 Winkel)', '< 1e-12', diff.toExponential(1), diff < 1e-12);
  zeile('Gegenprobe drehMatrix gegen Euler ZYX (kleinste Abweichung)', '> 1e-3', gegen.toExponential(1), gegen > 1e-3);
  let nichtExakt = 0, nichtGleich = 0, n = 0;
  for (const a of [-90, 0, 90, 180, 270, 450]) for (const b of [-180, 0, 90, 270, 360]) for (const c of [0, 90, 180, -270, 720]) {
    const M = drehMatrix([a, b, c]); n++;
    if (!M.flat().every((x) => Number.isInteger(x) && Math.abs(x) <= 1) || det(M) !== 1) nichtExakt++;
    if (maxDiff(M, threeMatrix([a, b, c])) > 1e-12) nichtGleich++;
  }
  zeile(`drehMatrix: Vielfache von 90° exakt ganzzahlig, det +1 (${n} Lagen)`, '0 falsch', nichtExakt, nichtExakt === 0);
  zeile('drehMatrix: Vielfache von 90° = three', '0 falsch', nichtGleich, nichtGleich === 0);
  const gegen90 = [[Math.cos(Math.PI / 2), -Math.sin(Math.PI / 2)]].flat().every(Number.isInteger);
  zeile('Gegenprobe 90°: Math.cos(π/2) wäre nicht exakt', 'rot', gegen90 ? 'grün' : 'rot', !gegen90);

  // huelle gegen three: Punkte per Object3D (Euler XYZ + Position, Spiegel = Skalierung x −1 danach) → Box3
  let hDiff = 0, faelle = 0;
  const v = new THREE.Vector3();
  for (const vorlage of Object.keys(VORLAGEN)) for (let i = 0; i < 6; i++) {
    const k = normalisiere({ koerper: [{ ...neuerKoerper(vorlage, 0, { pos: [zwischen(-20, 20), zwischen(-20, 20), zwischen(-20, 20)] }),
      dreh: i < 3 ? [90 * i, 90 * (i + 1), 0] : [zwischen(0, 360), zwischen(0, 360), zwischen(0, 360)], spiegel: true }] }).koerper[0];
    for (const gesp of [false, true]) {
      const h = huelle(k, koerperMatrix(k, gesp)), box = new THREE.Box3();
      const o = new THREE.Object3D(); o.rotation.set(...k.dreh.map((x) => x * Math.PI / 180), 'XYZ'); o.position.set(...k.pos); o.updateMatrix();
      const sp = new THREE.Matrix4().makeScale(gesp ? -1 : 1, 1, 1).multiply(o.matrix);
      for (const s of k.spanten) for (const [x, y] of profilPunkte(s)) box.expandByPoint(v.set(x, y, s.z).applyMatrix4(sp));
      hDiff = Math.max(hDiff, abst(h.min, box.min.toArray()), abst(h.max, box.max.toArray())); faelle++;
    }
  }
  zeile(`huelle = Box3 aller Profilpunkte (three, ${faelle} Lagen inkl. Spiegel)`, '< 1e-9 m', hDiff.toExponential(1), hDiff < 1e-9);
  // Loft linear (F2): Zwischenpunkte zweier Spanten liegen in der Hülle
  const keil = normalisiere({ koerper: [{ ...neuerKoerper('rumpf', 0), dreh: [30, 50, 70], pos: [3, -4, 5] }] }).koerper[0], hk = huelle(keil);
  let raus = 0;
  for (let i = 1; i < keil.spanten.length; i++) {
    const a = profilPunkte(keil.spanten[i - 1]), b = profilPunkte(keil.spanten[i]);
    for (let j = 0; j < PROFIL_N; j++) for (const t of [0.25, 0.5, 0.75]) {
      const p = wendeK(koerperMatrix(keil), [a[j][0] + (b[j][0] - a[j][0]) * t, a[j][1] + (b[j][1] - a[j][1]) * t, keil.spanten[i - 1].z + (keil.spanten[i].z - keil.spanten[i - 1].z) * t]);
      if (p.some((x, k) => x < hk.min[k] - 1e-9 || x > hk.max[k] + 1e-9)) raus++;
    }
  }
  zeile('huelle enthält Loft-Zwischenpunkte (schräg gedreht)', '0 außerhalb', raus, raus === 0);

  // volumen: Quader exakt, Zylinder, Kegelstumpf gegen Formel (Trapez über z überschätzt den Kegel)
  const vk = (vorlage) => volumen(normalisiere({ koerper: [neuerKoerper(vorlage, 0)] }).koerper[0]);
  const vq = vk('quader'), vz = vk('zylinder'), vg = vk('kegel'), kegelSoll = Math.PI * 8 / 3 * (16 + 4 + 8);
  zeile('volumen: Quader 10×6×10 | Zylinder r 3 L 10', `≈ 600 | ≈ ${(Math.PI * 90).toFixed(0)} ±1 %`, `${vq.toFixed(2)} | ${vz.toFixed(1)}`, Math.abs(vq - 600) < 0.05 && Math.abs(vz / (Math.PI * 90) - 1) < 0.01);
  zeile('volumen: Kegelstumpf r 4→2, L 8 gegen Formel', '±1 % (Prismatoid, R16)', `${vg.toFixed(1)} / ${kegelSoll.toFixed(1)} (${(100 * (vg / kegelSoll - 1)).toFixed(1)} %)`, Math.abs(vg / kegelSoll - 1) <= 0.01);
  const masse = formZuModul({ name: 'q', koerper: [neuerKoerper('quader', 0), neuerKoerper('zylinder', 1, { op: 'minus' })] }).werte.masse;
  zeile('Masse Quader − Zylinder (Plus − Minus)·DICHTE', String(Math.round((vq - vz) * DICHTE)), masse, masse === Math.round((vq - vz) * DICHTE));
  const nurMinus = formZuModul({ name: 'm', koerper: [neuerKoerper('zylinder', 0), neuerKoerper('quader', 1, { op: 'minus' })] }).werte.masse;
  zeile('Masse nie negativ (Minus größer als Plus)', '0', nurMinus, nurMinus === 0);
}

// ---------- 4) pruefe, Andockpunkte, formId, Version ----------
{
  const P = (pos, op = 'plus', id = 0, vorlage = 'quader') => neuerKoerper(vorlage, id, { pos, op });
  const pkt = [{ id: 'a', p: [0, 0, 5], n: [0, 0, 1], groesse: 'M', art: 'rumpf' }];
  const F = (koerper, mehr = {}) => normalisiere({ name: 't', koerper, andock: pkt, ...mehr });
  const FAELLE = [
    ['gültig', F([P([0, 0, 0])]), ''],
    ['version', F([P([0, 0, 0])], { version: 2 }), 'version'],
    ['leer (+ kein_plus)', F([]), 'kein_plus leer'],
    ['kein_plus', F([P([0, 0, 0], 'minus')]), 'kein_plus minus_trifft_nichts:0'],
    ['id_doppelt', F([P([0, 0, 0]), P([2, 0, 0])]), 'id_doppelt:0'],
    ['zu_wenig_spanten', F([{ ...P([0, 0, 0]), spanten: [{ z: 0, b: 2, h: 2 }] }]), 'zu_wenig_spanten:0'],
    ['spanten_gleich', F([{ ...P([0, 0, 0]), spanten: [{ z: 0, b: 2, h: 2 }, { z: 0.01, b: 2, h: 2 }] }]), 'spanten_gleich:0'],
    ['minus_trifft_nichts', F([P([0, 0, 0]), P([100, 0, 0], 'minus', 1)]), 'minus_trifft_nichts:1'],
    ['minus trifft (keine Warnung)', F([P([0, 0, 0]), P([3, 0, 0], 'minus', 1)]), ''],
    ['minus trifft nur die Spiegelkopie', F([{ ...P([30, 0, 0]), spiegel: true }, P([-30, 0, 0], 'minus', 1)]), ''],
    ['kein_punkt', normalisiere({ name: 't', koerper: [P([0, 0, 0])] }), 'kein_punkt'],
  ];
  const falsch = FAELLE.filter(([, f, soll]) => schluessel(pruefe(f)) !== soll).map(([n, f, soll]) => `${n}: „${schluessel(pruefe(f))}“ statt „${soll}“`);
  const alle = new Set(FAELLE.flatMap(([, f]) => pruefe(f).map((x) => x.code)));
  const CODES = ['version', 'leer', 'kein_plus', 'id_doppelt', 'zu_wenig_spanten', 'spanten_gleich', 'minus_trifft_nichts', 'kein_punkt'];
  zeile(`pruefe: ${FAELLE.length} Fälle → genau die erwarteten Codes`, '0 falsch', falsch.length ? falsch.join(' | ') : 0, falsch.length === 0);
  zeile('pruefe: alle 8 Codes ausgelöst', 'alle', CODES.filter((c) => !alle.has(c)).join(', ') || 'alle', CODES.every((c) => alle.has(c)));
  zeile('Gegenprobe pruefe: Version 2 gegen Erwartung „keine“', 'rot', pruefe(FAELLE[1][1]).length ? 'rot' : 'grün', pruefe(FAELLE[1][1]).length > 0);
  const v = [normalisiere({ version: 2 }).version, normalisiere({ version: 'x' }).version, normalisiere({}).version];
  zeile('Version: 2 bleibt | ungültig → 1 | fehlt → 1', '2 | 1 | 1', v.join(' | '), v.join() === `2,${VERSION},${VERSION}`);

  // Andockpunkte einrasten (F3)
  const roh = [
    { id: 'diag', p: [0.26, 1.74, -0.24], n: [0.7, 0.69, 0.1], u: [0, 0, 1] },
    { id: 'null', p: [1, 2, 3], n: [0, 0, 0] },
    { id: 'uparallel', n: [0, -0.9, 0.1], u: [0, 1, 0] },
    { id: 'rumpfstecker', n: [0, 0, -1], art: 'rumpf', stecker: true, groesse: 'M' },
    { id: 'quatsch', n: [1, 0, 0], u: [0.2, 0.3, 0.9], art: 'xyz', groesse: 'XL', dreh: [5, 1, -1, 3] },
    { id: 'drehleer', n: [1, 0, 0], dreh: [] },
    { id: 'sehr_langer_name_fuer_einen_punkt_hier' },
  ];
  const ns = normalisiere({ andock: roh }).andock;
  const soll = [
    { p: [0.5, 1.5, 0], n: [1, 0, 0], u: [0, 0, 1], art: 'anbau', groesse: 'S', dreh: [0, 1, 2, 3] },
    { p: [1, 2, 3], n: [0, 0, 1], u: [0, 1, 0] },
    { n: [0, -1, 0], u: [0, 0, 1] },
    { n: [0, 0, -1], art: 'rumpf', groesse: 'M', stecker: undefined, dreh: [0, 2] },
    { n: [1, 0, 0], u: [0, 0, 1], art: 'anbau', groesse: 'S', dreh: [1, 3] },
    { dreh: [0] },
    { id: 'sehr_langer_name_fu' + 'e' },
  ];
  const abw = [];
  ns.forEach((p, i) => { for (const [k, w] of Object.entries(soll[i])) if (JSON.stringify(p[k]) !== JSON.stringify(w) && !(k === 'p' && abst(p.p, w) === 0)) abw.push(`${roh[i].id}.${k}: ${JSON.stringify(p[k])}`); });
  const achsen = ns.every((p) => [p.n, p.u].every((a) => a.filter((x) => x === 0).length === 2 && a.some((x) => Math.abs(x) === 1)) && p.n.reduce((s, x, i) => s + x * p.u[i], 0) === 0 && p.p.every((x) => Number.isInteger(x * 2)));
  zeile('Andockpunkte einrasten (Raster, n/u-Achsen, u ⟂ n, Größe/Art, Stecker, dreh, id ≤ 20)', '0 Abweichungen', abw.length ? abw.join(', ') : 0, abw.length === 0 && achsen);
  const minus0 = ns[0].p.some((x) => Object.is(x, -0));
  zeile('Andock-Raster: −0,24 → 0 (nicht −0)', '0', minus0 ? '−0' : '0', !minus0);

  // formId (F4)
  const gleich = [['A b', 'a-b', 'A_B', '  a  b  ', 'a---b'], ['Bär', 'Bär', 'BÄR'], ['', '***', '   ']];
  const ids = gleich.map((g) => [...new Set(g.map(formId))]);
  zeile('formId: Schreibweisen | NFC/NFD + groß/klein | leer', 'je 1 Id', ids.map((x) => x.join('/')).join(' | '), ids.every((x) => x.length === 1) && ids[2][0] === 'form_unbenannt');
  const katalogKollision = Object.keys(KATALOG).filter((id) => id.startsWith('form_'));
  zeile('formId: kein Katalog-Modul beginnt mit form_', '0', katalogKollision.join(', ') || 0, katalogKollision.length === 0);
  // F4: gleiche Datei → gleiche Id (Windows: groß/klein egal). Umgekehrt nicht: gleiche Id kann zwei Dateien haben.
  const namen = ['Rumpf A', 'rumpf a', 'Rumpf_A', 'Rumpf-A', 'Rumpf  A', 'Bär', 'Bär'];
  let dateiGleichIdAnders = 0, idGleichDateiAnders = 0;
  for (const a of namen) for (const b of namen) {
    const df = dateiname(a).toLowerCase() === dateiname(b).toLowerCase(), ig = formId(a) === formId(b);
    if (df && !ig) dateiGleichIdAnders++;
    if (ig && !df) idGleichDateiAnders++;
  }
  zeile('formId: gleiche Datei (Windows) → gleiche Id', '0 Paare abweichend', dateiGleichIdAnders, dateiGleichIdAnders === 0);
  zeile('formId: gleiche Id, aber verschiedene Dateien (Info: überschreibt im Katalog)', 'Info', `${idGleichDateiAnders / 2} Paare`, true, false);
  // koerperSchluessel: nur Spanten zählen
  const k1 = neuerKoerper('rumpf', 0), k2 = { ...neuerKoerper('rumpf', 5, { pos: [9, 9, 9] }), dreh: [90, 0, 0] }, k3 = neuerKoerper('keil', 0);
  zeile('koerperSchluessel: gleich bei anderer Lage, anders bei anderen Spanten', 'gleich | anders', `${koerperSchluessel(k1) === koerperSchluessel(k2) ? 'gleich' : 'anders'} | ${koerperSchluessel(k1) === koerperSchluessel(k3) ? 'gleich' : 'anders'}`,
    koerperSchluessel(k1) === koerperSchluessel(k2) && koerperSchluessel(k1) !== koerperSchluessel(k3));
  zeile('Spiegel: koerperListe verdoppelt, Kopie bei −x', '2 Einträge, x gespiegelt', (() => { const l = koerperListe(normalisiere({ koerper: [{ ...neuerKoerper('quader', 0, { pos: [7, 1, 2] }), spiegel: true }] })); return `${l.length}, ${wendeK(l[1].lage, [0, 0, 0]).join('/')}`; })(),
    (() => { const l = koerperListe(normalisiere({ koerper: [{ ...neuerKoerper('quader', 0, { pos: [7, 1, 2] }), spiegel: true }] })); return l.length === 2 && abst(wendeK(l[1].lage, [0, 0, 0]), [-7, 1, 2]) === 0; })());
}

// ---------- 5) formZuModul → baue() der Werft ----------
{
  const anschluss = tiefFrieren({ name: 'Anschluss Test', version: 1, art: 'rumpf', koerper: [neuerKoerper('anschluss_m', 0)],
    andock: [{ id: 'vorn', p: [0, 0, 10], n: [0, 0, 1], groesse: 'M', art: 'rumpf' }, { id: 'hinten', p: [0, 0, -10], n: [0, 0, -1], groesse: 'M', art: 'rumpf' },
      { id: 'seite', p: [10, 0, 0], n: [0.9, 0.1, 0.2], groesse: 'S', art: 'anbau' }] });
  const mod = formZuModul(anschluss), mod2 = formZuModul(kopie(anschluss));
  zeile('Gleichlauf: formZuModul zweimal gleich (eingefroren / Kopie)', 'gleich', JSON.stringify(mod) === JSON.stringify(mod2) ? 'gleich' : 'ANDERS', JSON.stringify(mod) === JSON.stringify(mod2));
  zeile('Modul: id | eigen | Quader | duesen', 'form_anschluss_test | ja | x ±10 y ±8 z ±10 | []', `${mod.id} | ${mod.eigen ? 'ja' : 'nein'} | ${JSON.stringify(mod.quader[0])} | ${JSON.stringify(mod.duesen)}`,
    mod.id === 'form_anschluss_test' && mod.eigen === true && mod.quader.length === 1 && abst(mod.quader[0].min, [-10, -8, -10]) < 1e-9 && abst(mod.quader[0].max, [10, 8, 10]) < 1e-9 && Array.isArray(mod.duesen));
  const KAT = { ...KATALOG, [mod.id]: mod };

  const wurzel = baue({ version: 1, teile: [{ nr: 0, modul: mod.id }] }, KAT);
  zeile('Werft: Form als Startteil', 'gelegt, nur Pflicht-/offen-Meldungen', `${wurzel.teile.length} Teil, ${schluessel(wurzel.meldungen.map((x) => ({ code: x.code, id: x.nr })))}`,
    wurzel.teile.length === 1 && wurzel.meldungen.every((x) => ['kein_kommando', 'kein_heck', 'kein_turm', 'offen_rumpf'].includes(x.code)));

  // Anschluss-Form vorn und hinten an rumpf_m_kurz, Panzerplatte am eingerasteten Seitenpunkt
  const entwurf = { version: 1, teile: [
    { nr: 0, modul: 'rumpf_m_kurz' },
    { nr: 1, modul: mod.id, an: { nr: 0, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 },
    { nr: 2, modul: mod.id, an: { nr: 0, punkt: 'vorn' }, punkt: 'hinten', dreh: 2 },
    { nr: 3, modul: 'panzerplatte', an: { nr: 1, punkt: 'seite' }, punkt: 'innen', dreh: 0 },
  ] };
  const b = baue(entwurf, KAT);
  let fuge = 0;
  for (const t of entwurf.teile.slice(1)) {
    const e = b.teile.find((x) => x.nr === t.an.nr), k = b.teile.find((x) => x.nr === t.nr);
    const pE = KAT[e.modul].andock.find((p) => p.id === t.an.punkt), pK = KAT[k.modul].andock.find((p) => p.id === t.punkt);
    fuge = Math.max(fuge, abst(wende(e.lage, pE.p), wende(k.lage, pK.p)));
  }
  const ueber = b.meldungen.filter((x) => ['ueberschneidung', 'passt_nicht', 'dreh_verboten', 'punkt_unbekannt'].includes(x.code));
  const inLagen = b.teile.every((t) => LAGEN.some((L) => JSON.stringify(L) === JSON.stringify(t.lage.m)));
  zeile('Werft: Anschluss-Form vorn + hinten an rumpf_m_kurz, Platte an eingerastetem Punkt — Fuge', '< 0,001 m', fuge.toExponential(1), b.teile.length === 4 && fuge < 1e-3);
  zeile('Werft: keine Überschneidung/Passfehler, alle Lagen ∈ LAGEN', '0, ja', `${schluessel(ueber.map((x) => ({ code: x.code, id: x.nr }))) || 0}, ${inLagen ? 'ja' : 'nein'}`, ueber.length === 0 && inLagen);
  const seite = mod.andock.find((p) => p.id === 'seite');
  zeile('Gegenprobe diagonales n: eingerastet [1,0,0] | roh → Lage ∉ LAGEN', '[1,0,0] | rot',
    `${JSON.stringify(seite.n)} | ${(() => { const roh = { ...seite, n: [0.9, 0.1, 0.2] }; const l = andockLage(EINHEIT, roh, KATALOG.panzerplatte.andock[0], 0); return LAGEN.some((L) => JSON.stringify(L) === JSON.stringify(l.m)) ? 'grün' : 'rot'; })()}`,
    JSON.stringify(seite.n) === '[1,0,0]' && (() => { const roh = { ...seite, n: [0.9, 0.1, 0.2] }; const l = andockLage(EINHEIT, roh, KATALOG.panzerplatte.andock[0], 0); return !LAGEN.some((L) => JSON.stringify(L) === JSON.stringify(l.m)); })());
  // Gegenprobe Überschneidung: „Spieß“-Form (Körper z −10 … +30, Punkt vorn bei z 10) hinten an rumpf_m_kurz (z ±8) sticht
  // 20 m durch den Rumpf bis in die Anschluss-Form vorn (Teil 2, kein Nachbar) → ueberschneidung:2
  const ue = (bb) => schluessel(bb.meldungen.filter((x) => x.code === 'ueberschneidung').map((x) => ({ code: x.code, id: x.nr })));
  const spiess = formZuModul({ ...kopie(anschluss), name: 'Spiess', koerper: [{ ...neuerKoerper('anschluss_m', 0), spanten: [{ z: -10, b: 20, h: 16, fase: 0.3 }, { z: 30, b: 20, h: 16, fase: 0.3 }] }] });
  const K2 = { ...KAT, [spiess.id]: spiess };
  const bs = baue({ version: 1, teile: [{ nr: 0, modul: 'rumpf_m_kurz' }, { nr: 1, modul: spiess.id, an: { nr: 0, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 },
    { nr: 2, modul: mod.id, an: { nr: 0, punkt: 'vorn' }, punkt: 'hinten', dreh: 0 }] }, K2);
  zeile('Gegenprobe Überschneidung: Spieß-Form durch den Rumpf in Teil 2', 'ueberschneidung:2', ue(bs) || 'keine', ue(bs) === 'ueberschneidung:2');
  // F9 (nach Befund R16): ragt ein Plus-Körper über die Ebene eines Rumpf-Andockpunkts, warnt pruefe (ragt_ueber_fuge) —
  // die Werft selbst nimmt den Fugen-Quader weiter aus (E5), darum muss die Werkstatt es melden.
  const spiessForm = { ...kopie(anschluss), name: 'Spiess', koerper: [{ ...neuerKoerper('anschluss_m', 0), spanten: [{ z: -10, b: 20, h: 16, fase: 0.3 }, { z: 30, b: 20, h: 16, fase: 0.3 }] }] };
  const rf = pruefe(normalisiere(spiessForm)).filter((x) => x.code === 'ragt_ueber_fuge'), rfOk = pruefe(normalisiere(anschluss)).filter((x) => x.code === 'ragt_ueber_fuge');
  zeile('Spieß-Form ragt 20 m über die Fuge → pruefe ragt_ueber_fuge | bündiger Anschluss → keine', 'ragt_ueber_fuge:0 | –', `${schluessel(rf) || 'keine'} | ${schluessel(rfOk) || '–'}`, schluessel(rf) === 'ragt_ueber_fuge:0' && rfOk.length === 0);
  // Versionsmeldung bleibt bei formZuModul nicht hängen, pruefe meldet sie
  const v2 = { ...kopie(anschluss), version: 2 };
  zeile('Gegenprobe Version 2: pruefe meldet version, Modul trotzdem baubar', 'version | gebaut', `${schluessel(pruefe(normalisiere(v2)).filter((x) => x.code === 'version')) || 'keine'} | ${formZuModul(v2).quader.length ? 'gebaut' : 'leer'}`,
    pruefe(normalisiere(v2)).some((x) => x.code === 'version') && formZuModul(v2).quader.length === 1);
  const kurz = formZuModul({ name: 'k', koerper: [neuerKoerper('quader', 0), { ...neuerKoerper('quader', 1), spanten: [{ z: 0, b: 2, h: 2 }] }, { ...neuerKoerper('quader', 2), spanten: [] }] });
  zeile('formZuModul: Körper < 2 Spanten weggelassen (F5)', '1 Quader, endlich', `${kurz.quader.length} Quader, ${unendlich(kurz) || 'endlich'}`, kurz.quader.length === 1 && !unendlich(kurz));
}

// ---------- 6) form.js rein (ohne three, ohne Importe aus grafik) ----------
{
  const text = readFileSync(new URL('../src/sim/form/form.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const importe = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((x) => x[1]).filter((x) => x === 'three' || x.startsWith('three') || x.includes('grafik'));
  zeile('src/sim/form/form.js ohne three/grafik-Importe', '0', importe.join(', ') || 0, importe.length === 0);
}

// ---------- 7) Grafik ----------
/** Vorzeichenbehaftetes Netzvolumen Σ det(a−o, b−o, c−o)/6 (indiziert oder nicht); geschlossen ⇔ unabhängig von o. */
function netzVolumen(geos, o = [0, 0, 0]) {
  let v = 0;
  for (const g of Array.isArray(geos) ? geos : Object.values(geos)) {
    const p = g.attributes.position.array, ix = g.index?.array, n = ix ? ix.length : p.length / 3;
    const P = (i) => { const j = (ix ? ix[i] : i) * 3; return [p[j] - o[0], p[j + 1] - o[1], p[j + 2] - o[2]]; };
    for (let i = 0; i < n; i += 3) {
      const a = P(i), b = P(i + 1), c = P(i + 2);
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return v;
}
const flaeche2 = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; } return a / 2; };
/** Exaktes Volumen eines linearen Lofts (Prismatoid je Spant-Paar: dz/6 · (A0 + 4·Amitte + A1)) — aus den Profilpunkten. */
function prismatoid(k) {
  let v = 0;
  for (let i = 1; i < k.spanten.length; i++) {
    const a = profilPunkte(k.spanten[i - 1]), b = profilPunkte(k.spanten[i]), mid = a.map((p, j) => [(p[0] + b[j][0]) / 2, (p[1] + b[j][1]) / 2]);
    v += (k.spanten[i].z - k.spanten[i - 1].z) / 6 * (flaeche2(a) + 4 * flaeche2(mid) + flaeche2(b));
  }
  return v;
}
/** Volumen einer Form durch Abtastung (Gitter in der Hülle, Punkt-in-Körper aus den DATEN: linearer Loft, konvexe Profile). */
function abtastVolumen(roh, n = 48) {
  const form = normalisiere(roh); form.koerper = form.koerper.filter((k) => k.spanten.length >= 2);
  const liste = koerperListe(form).map(({ k, lage }) => ({ k, lage, h: huelle(k, lage), prof: k.spanten.map(profilPunkte) }));
  const innen = ({ k, lage, h, prof }, q) => {
    if (q.some((x, i) => x < h.min[i] || x > h.max[i])) return false;
    const s = [lage.spiegel ? -q[0] : q[0], q[1], q[2]].map((x, i) => x - lage.t[i]);
    const p = [0, 1, 2].map((j) => lage.m[0][j] * s[0] + lage.m[1][j] * s[1] + lage.m[2][j] * s[2]); // mᵀ·s
    const sp = k.spanten; if (p[2] < sp[0].z || p[2] > sp[sp.length - 1].z) return false;
    let i = 1; while (i < sp.length - 1 && sp[i].z < p[2]) i++;
    const t = (p[2] - sp[i - 1].z) / (sp[i].z - sp[i - 1].z), A = prof[i - 1], B = prof[i];
    for (let j = 0; j < PROFIL_N; j++) { // konvex, gegen den Uhrzeigersinn → links jeder Kante
      const j2 = (j + 1) % PROFIL_N, ax = A[j][0] + (B[j][0] - A[j][0]) * t, ay = A[j][1] + (B[j][1] - A[j][1]) * t;
      const bx = A[j2][0] + (B[j2][0] - A[j2][0]) * t, by = A[j2][1] + (B[j2][1] - A[j2][1]) * t;
      if ((bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) < 0) return false;
    }
    return true;
  };
  const plus = liste.filter((x) => x.k.op === 'plus'), minus = liste.filter((x) => x.k.op === 'minus');
  const H = plus.map((x) => x.h).reduce((a, b) => ({ min: a.min.map((v, i) => Math.min(v, b.min[i])), max: a.max.map((v, i) => Math.max(v, b.max[i])) }));
  const d = [0, 1, 2].map((i) => (H.max[i] - H.min[i]) / n);
  let drin = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
    const q = [H.min[0] + (a + 0.5) * d[0], H.min[1] + (b + 0.5) * d[1], H.min[2] + (c + 0.5) * d[2]];
    if (plus.some((x) => innen(x, q)) && !minus.some((x) => innen(x, q))) drin++;
  }
  return drin * d[0] * d[1] * d[2];
}
const alsSuppe = (g) => ({ x: g.index ? g.toNonIndexed() : g });
{
  // Roher Loft je Vorlage: dicht, Volumen = Prismatoid; volumen() (Trapezregel) als Info
  const offen = [], volFalsch = [], trapez = [];
  for (const [name] of Object.entries(VORLAGEN)) {
    const k = normalisiere({ koerper: [neuerKoerper(name, 0)] }).koerper[0], g = koerperGeometrie(k);
    const ok = offeneKanten(alsSuppe(g));
    if (ok.kanten || ok.flaeche > 1e-6) offen.push(`${name}: ${ok.kanten}`);
    const vn = netzVolumen([g]), vp = prismatoid(k);
    if (Math.abs(vn / vp - 1) > 1e-4) volFalsch.push(`${name} ${vn.toFixed(2)}/${vp.toFixed(2)}`);
    trapez.push(`${name} ${(100 * (volumen(k) / vn - 1)).toFixed(1)}`);
  }
  zeile(`Roher Loft je Vorlage (${Object.keys(VORLAGEN).length}): offene Kanten`, '0', offen.join(', ') || 0, offen.length === 0);
  zeile('Roher Loft: Netzvolumen = Prismatoid aus den Profilen', '< 0,01 %', volFalsch.join(', ') || 'alle', volFalsch.length === 0);
  // WARUM nur Info: volumen() nimmt die Trapezregel (Masse-Anzeige), bei Verjüngung überschätzt sie (Kegel +6,8 %)
  zeile('volumen() gegen Netz je Vorlage in % (Info, Trapezregel)', 'Info', trapez.join(' · '), true, false);

  // Gegenprobe Spiegel: Körper an x 3, gespiegelte Lage per applyMatrix4 OHNE Wicklung umzudrehen → Volumen negativ
  const k = normalisiere({ koerper: [{ ...neuerKoerper('quader', 0, { pos: [3, 0, 0] }), spiegel: true }] }).koerper[0];
  const lage = koerperListe({ koerper: [k] })[1].lage;
  const falsch = netzVolumen([koerperGeometrie(k).clone().applyMatrix4(lageMatrix4(lage))]), richtig = netzVolumen([koerperNetz(k, lage)]);
  zeile('Spiegelkopie (koerperNetz) Volumen | Gegenprobe ohne Wicklungstausch', `≈ +${prismatoid(k).toFixed(0)} | negativ`, `${richtig.toFixed(1)} | ${falsch.toFixed(1)}`,
    Math.abs(richtig / prismatoid(k) - 1) < 1e-4 && falsch < 0);

  // Beispielformen verschweißt
  const zeiten = [], dicht = [], gleich = [], vol = [], volInfo = [];
  for (const f of BEISPIEL_FORMEN) {
    formGeometrie(f); // Aufwärmen (Zwischenspeicher, JIT)
    const laeufe = [0, 1, 2].map(() => formGeometrie(f)), ms = laeufe.map((g) => g.info.ms).sort((a, b) => a - b);
    zeiten.push({ name: f.name, median: ms[1], max: ms[2], csg: laeufe[0].info.csg, dreiecke: laeufe[0].info.dreiecke });
    const g = laeufe[0], i = g.info;
    if (i.offeneKanten !== 0 || !(i.flaechenschluss < 1e-6)) dicht.push(`${f.name}: ${i.offeneKanten} (${(i.offeneLaenge * 100).toFixed(1)} cm), Schluss ${i.flaechenschluss.toExponential(1)}`);
    const h = (x) => Object.entries(x).map(([m, q]) => m + ':' + Array.from(q.attributes.position.array).join(',')).join('|');
    if (h(laeufe[1]) !== h(g) || h(laeufe[2]) !== h(g)) gleich.push(f.name);
    const v0 = netzVolumen(g), v1 = netzVolumen(g, [500, -300, 700]), ref = abtastVolumen(f);
    if (Math.abs(v0 - v1) / Math.abs(v0) > 1e-6) dicht.push(`${f.name}: Volumen hängt vom Ursprung ab (Leck)`);
    const abw = 100 * (v0 / ref - 1);
    if (Math.abs(abw) > 2) vol.push(`${f.name} ${abw.toFixed(2)} %`);
    volInfo.push(`${f.name} ${v0.toFixed(0)}/${ref.toFixed(0)} m³ (${abw.toFixed(2)} %)`);
  }
  zeile('Beispielformen verschweißt: 0 offene Kanten, Flächenschluss 0, kein Leck', '0', dicht.join(' | ') || 0, dicht.length === 0);
  zeile('Beispielformen: Zeit Median aus 3 (nach Aufwärmen)', '≤ 100 ms', zeiten.map((z) => `${z.name} ${z.median.toFixed(0)} ms`).join(' · '), zeiten.every((z) => z.median <= 100));
  zeile('Beispielformen: Spitze | CSG-Schritte | Dreiecke (Info)', 'Info', zeiten.map((z) => `${z.max.toFixed(0)} ms/${z.csg}/${z.dreiecke}`).join(' · '), true, false);
  zeile('Beispielformen: Volumen gegen Abtastung der Daten (48³)', '±2 %', vol.join(', ') || volInfo.join(' · '), vol.length === 0);
  zeile('Beispielformen: gleiche Eingabe → gleiches Netz (3 Läufe)', '0 abweichend', gleich.join(', ') || 0, gleich.length === 0);

  // Gegenprobe Zugabe: Prüfform mit 30 Körpern (Rumpf, überlappende Platten, Seitenkästen, Schlitze — Messform des Schiffbauers)
  const pruefform = (n) => {
    const kk = [neuerKoerper('rumpf', 0)];
    for (let i = 1; i < n; i++) {
      const z = -18 + (i * 37) % 36, art = i % 3;
      if (art === 0) kk.push({ ...neuerKoerper('platte', i, { mat: 'dunkel' }), pos: [0, 6.2, z], spanten: [{ z: -2, b: 8, h: 1, fase: 0.5 }, { z: 2, b: 8, h: 1, fase: 0.5 }] });
      else if (art === 1) kk.push({ ...neuerKoerper('quader', i, { mat: 'metall' }), pos: [7.5, 0, z], spiegel: true, spanten: [{ z: -1.5, b: 2, h: 3, fase: 0.3 }, { z: 1.5, b: 2, h: 3, fase: 0.3 }] });
      else kk.push({ ...neuerKoerper('quader', i, { op: 'minus', mat: 'schacht' }), pos: [0, -6, z], spanten: [{ z: -1, b: 4, h: 1.2 }, { z: 1, b: 4, h: 1.2 }] });
    }
    return { name: 'pruef' + n, art: 'rumpf', koerper: kk };
  };
  formGeometrie(pruefform(30));
  const mit = formGeometrie(pruefform(30)).info, ohne = formGeometrie(pruefform(30), { zugabe: false }).info;
  zeile('Prüfform 30 Körper mit Zugabe: offene Kanten | Zeit (F6 ≤ 400 ms)', '0 | ≤ 400 ms', `${mit.offeneKanten} | ${mit.ms.toFixed(0)} ms`, mit.offeneKanten === 0 && mit.ms <= 400);
  zeile('Gegenprobe Prüfform 30 OHNE Zugabe → offene Kanten', '> 0 (rot)', `${ohne.offeneKanten} (${(ohne.offeneLaenge * 100).toFixed(0)} cm)`, ohne.offeneKanten > 0);

  // Werft: alle drei Beispielformen in WS-01 — Rumpfstück zwischen Kommando (0) und kurzem Rumpf (3), Brückenturm auf 3.oben,
  // Gondeln statt der vier Panzerplatten am langen Rumpf (1). WARUM dort: die Gondel ist 28,5 m lang; an den freien
  // Seitenpunkten des kurzen Rumpfs (16 m) ragt sie in den Übergang, an 1.*_hinten in die Panzerplatten 9/11 (gemessen).
  const mods = BEISPIEL_FORMEN.map((f) => { const m = formZuModul(f); registriereForm(m, formGeometrie(f)); return m; });
  const [turm, stueck, gondel] = mods, KAT = { ...KATALOG, ...Object.fromEntries(mods.map((m) => [m.id, m])) };
  const teile = kopie(BEISPIEL.teile).filter((t) => ![9, 10, 11, 12].includes(t.nr)).map((t) => t.nr === 3 ? { ...t, an: { nr: 25, punkt: 'hinten' } } : t);
  teile.push({ nr: 25, modul: stueck.id, an: { nr: 0, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 },
    { nr: 26, modul: turm.id, an: { nr: 3, punkt: 'oben' }, punkt: 'fuss', dreh: 0 },
    { nr: 27, modul: gondel.id, an: { nr: 1, punkt: 'bb_hinten' }, punkt: 'innen', dreh: 0 },
    { nr: 28, modul: gondel.id, an: { nr: 1, punkt: 'sb_hinten' }, punkt: 'innen', dreh: 2 });
  let b, absturz = '';
  try { b = baue({ ...kopie(BEISPIEL), teile }, KAT); } catch (e) { absturz = e.message; }
  const fehler = b ? b.meldungen.filter((x) => x.stufe === 'fehler') : [];
  zeile('Werft: WS-01 (ohne Platten) + Rumpfstück + Brückenturm + 2 Gondeln — baue', '25 Teile, 0 Fehler', absturz || `${b.teile.length} Teile, ${schluessel(fehler.map((x) => ({ code: x.code, id: x.nr }))) || '0 Fehler'}, Warnungen ${schluessel(b.meldungen.filter((x) => x.stufe !== 'fehler').map((x) => ({ code: x.code, id: x.nr }))) || 0}`,
    !absturz && b.teile.length === 25 && fehler.length === 0);
  // Gegenprobe: Gondeln an den Seiten des kurzen Rumpfs → ueberschneidung mit dem Übergang
  const eng = teile.map((t) => t.nr === 27 ? { ...t, an: { nr: 3, punkt: 'bb' } } : t.nr === 28 ? { ...t, an: { nr: 3, punkt: 'sb' } } : t);
  const be = baue({ ...kopie(BEISPIEL), teile: eng }, KAT), ue2 = be.meldungen.filter((x) => x.code === 'ueberschneidung').map((x) => x.nr).sort();
  zeile('Gegenprobe Werft: Gondeln am kurzen Rumpf → ueberschneidung 27, 28', 'rot', ue2.join(', ') || 'keine', ue2.join() === '27,28');
  const mats = new Proxy({}, { get: (z, k) => (z[k] ??= new THREE.MeshStandardMaterial()) });
  const gr = b ? schiffNetz(b.teile, mats) : null, mitForm = b ? schiffNetz(b.teile.filter((t) => !t.modul.startsWith('form_')), mats) : null;
  zeile('Werft: schiffNetz mit Formen — Draw-Calls | Dreiecke mehr als ohne Formen', '≤ 60 | > 0', gr ? `${gr.userData.drawCalls} | +${Math.round(gr.userData.dreiecke - mitForm.userData.dreiecke)}` : '–',
    !!gr && gr.userData.drawCalls <= 60 && gr.userData.dreiecke > mitForm.userData.dreiecke);
}
zeile('Laufzeit tests/form.mjs | unterdrückte BVH-Warnungen „maxLeafSize“ (Info)', 'Info', `${((performance.now() - T_START) / 1000).toFixed(1)} s | ${bvh.warnungen}`, true, false);

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

// ZWECK: Prüfungen ohne Browser für die Form-Werkstatt (Runde 16, `node tests/form.mjs`), Teil 1 = Mathematik in
//        src/sim/form/form.js; Teil 2 (Grafik: Verschweißen, wasserdicht, Zeiten) folgt.
//   1) Profil: 32 Punkte, gegen den Uhrzeigersinn, Start rechts oben, keine Nullkanten, Kreis ±1 %, Anschluss = Werft-NORM.
//   2) Zufallsfelder → alles endlich; normalisiere idempotent und ohne Änderung der Eingabe.
//   3) drehMatrix gegen three (Euler 'XYZ') bis 1e-12, Vielfache von 90° exakt; huelle gegen three-Box3; volumen.
//   4) pruefe: jeder Code; Andockpunkte einrasten (F3); formId (F4); Version (F5).
//   5) formZuModul → baue() der Werft: Startteil, Anschluss-Form an rumpf_m_kurz (Fuge, keine Überschneidung), Gleichlauf.
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
  // WARUM weich: F1 verspricht ≥ 6 cm, gilt aber nur für die Kanten ZWISCHEN den Ecken; innerhalb einer scharfen Ecke
  // (Einzug 3 cm, 7 Teilstücke) sind die Kanten ~6 mm — Befund an die Projektleitung, keine Nullkante
  const quader = profilMass(VORLAGEN.quader.spanten[0]).kurz;
  zeile('Profil: kürzeste Kante ≥ 5 cm (F1, Quader-Vorlage)', '≥ 0,05 m', quader.toFixed(4), quader >= 0.05, false);
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
  zeile('volumen: Kegelstumpf r 4→2, L 8 gegen Formel', '0 … +10 %', `${vg.toFixed(1)} / ${kegelSoll.toFixed(1)} (${(100 * (vg / kegelSoll - 1)).toFixed(1)} %)`, vg / kegelSoll >= 1 && vg / kegelSoll <= 1.1);
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
  zeile('Andock-Raster: −0,24 → 0 (nicht −0)', '0', minus0 ? '−0 (nur Schönheit, JSON = 0)' : '0', true, false);

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
  // Befund an die Projektleitung (E5): ragt ein Form-Körper NUR in seinen direkten Nachbarn (über die eigene Andockebene
  // hinaus), enthält der Quader den Fugenpunkt → ausgenommen. Katalog-Module schließt tests/werft.mjs aus („Quader über der
  // Ebene“), für eigene Formen prüft das niemand. WARUM weich: Regel E5 erlaubt es bisher.
  const bn = baue({ version: 1, teile: [{ nr: 0, modul: 'rumpf_m_kurz' }, { nr: 1, modul: spiess.id, an: { nr: 0, punkt: 'hinten' }, punkt: 'vorn', dreh: 0 }] }, K2);
  zeile('Spieß-Form 20 m in den direkten Nachbarn (nur dieser) → Meldung', '≥ 1 Meldung', ue(bn) || 'keine', ue(bn) !== '', false);
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

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

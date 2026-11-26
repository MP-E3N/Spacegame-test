// ZWECK: Prüfungen ohne Browser für Push/Pull und „Auf die Fläche setzen“ (Runde 18, `node tests/ziehen.mjs`) gegen die
//        Schnittstelle src/sim/form/ziehen.js (Protokoll R18, Entscheidungen 1–9) — unabhängig vom Schiffbauer geschrieben.
//   1) trefferImKoerper: Form → Körper (inkl. Spiegel) gegen die Formel p_K = mᵀ·(S·p_F − t), n_K = mᵀ·(S·n_F).
//   2) flaecheVon: jedes Dreieck des rohen Körpernetzes (koerperGeometrie: alle Vorlagen, Skizze, alsPunkte; gedreht und
//      gespiegelt) → erwartete Fläche aus der Dreiecks-Reihenfolge (Seitenstreifen, dann Kappen); richtung nach außen.
//   3) ziehe: Kappe (prismatisch / Verlängerung / Klemmung), Seite (scharf exakt, gegenüber bleibt), Kante (gleitet an den
//      Nachbarkanten, p in ±0,5), Maß + d, Volumen, Hin und zurück, fest, Eingabe unverändert, Unsinn-d, dicht.
//   4) ablegen: Hülle berührt die Fläche (±1 mm) für alle 6 Achsen-Normalen, quer auf 0,5 m; gedreht nur Info (E8).
//   Jede Gegenprobe (Zeile „Gegenprobe …“) füttert die Prüfung mit absichtlich falschen Daten und MUSS anschlagen.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER oder fehlendem Modul.
// REGEL: misst nur über die Schnittstelle; Körper-Geometrie aus src/grafik/form/koerper.js (Dreiecks-Reihenfolge: je
//        Abschnitt i, Punkt j zwei Dreiecke; danach Kappen — Fächer abwechselnd vorn/hinten, Umriss p: erst vorn, dann hinten).
import { PROFIL_N, profilPunkte, VORLAGEN, neuerKoerper, normalisiere, pruefe, koerperMatrix, koerperListe, wendeK, huelle,
  volumen, skizzenKoerper, alsPunkte } from '../src/sim/form/form.js';
import { koerperGeometrie } from '../src/grafik/form/koerper.js';
import { offeneKanten } from '../src/grafik/form/schweissen.js';

let Z;
try { Z = await import('../src/sim/form/ziehen.js'); }
catch (e) {
  console.error(`tests/ziehen.mjs: src/sim/form/ziehen.js fehlt oder lädt nicht (${e.code ?? ''} ${e.message.split('\n')[0]}) — Prüfung nicht möglich.`);
  process.exit(1);
}
const FEHLT = ['flaecheVon', 'ziehe', 'flaechenMass', 'ablegen', 'trefferImKoerper'].filter((n) => typeof Z[n] !== 'function');
if (FEHLT.length) { console.error(`tests/ziehen.mjs: ziehen.js exportiert nicht: ${FEHLT.join(', ')}`); process.exit(1); }
const { flaecheVon, ziehe, flaechenMass, ablegen, trefferImKoerper } = Z;
// three-bvh-csg: Warnung „maxLeafSize“ zählen statt drucken (siehe tests/form.mjs)
const warnAlt = console.warn; console.warn = (...a) => (String(a[0]).startsWith('BVH: "maxLeafSize"') ? 0 : warnAlt(...a));

const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const kopie = (o) => JSON.parse(JSON.stringify(o));
const tiefFrieren = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(tiefFrieren); } return o; };
const abst = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unendlich = (o) => (typeof o === 'number' ? !Number.isFinite(o) : o && typeof o === 'object' ? Object.values(o).some(unendlich) : false);
const N = (k) => normalisiere({ koerper: [k] }).koerper[0];
const sicher = (f, fallback) => { try { return f(); } catch (e) { return fallback(e); } };

// ---------- Körper-Sammlung ----------
const L = [[-7.5, 3.5], [3, 3.5], [3, -0.5], [-3, -0.5], [-3, -7.5], [-7.5, -7.5]];
const VORNE = { ex: [1, 0, 0], ey: [0, 1, 0], n: [0, 0, 1] };
const KOERPER = {
  ...Object.fromEntries(Object.keys(VORLAGEN).map((v) => [v, N(neuerKoerper(v, 0))])),
  skizze_L: N(skizzenKoerper({ punkte: L, ...VORNE, tiefe: -10, id: 0 })),
  punkte_quader: N(alsPunkte(N(neuerKoerper('quader', 0)))),
  punkte_trapez: N(alsPunkte(N(neuerKoerper('trapez', 0)))),
  punkte_zylinder: N(alsPunkte(N(neuerKoerper('zylinder', 0)))),
};

// ---------- Erwartete Fläche je Dreieck (aus der Reihenfolge in koerperGeometrie) ----------
/** 2D-Außennormale des Profil-Abschnitts j (Profil gegen den Uhrzeigersinn → rechts der Laufrichtung). */
const normale2 = (P, j) => { const a = P[j], b = P[(j + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dy / l, -dx / l]; };
function erwartet(k, t) {
  const n = k.spanten.length, P = profilPunkte(k.spanten[0]).length, seiten = (n - 1) * P * 2;
  if (t < seiten) {
    const i = Math.floor(t / (2 * P)), j = Math.floor((t % (2 * P)) / 2);
    if (k.spanten[0].p) return { art: 'kante', j };
    const a = normale2(profilPunkte(k.spanten[i]), j), b = normale2(profilPunkte(k.spanten[i + 1]), j), m2 = [a[0] + b[0], a[1] + b[1]];
    const gleich = Math.abs(Math.abs(m2[0]) - Math.abs(m2[1])) < 1e-6 * Math.hypot(...m2); // Fase genau 45°: beide Achsen zulässig
    const achse = Math.abs(m2[0]) > Math.abs(m2[1]) ? 'x' : 'y';
    return { art: 'seite', achse, vz: Math.sign(achse === 'x' ? m2[0] : m2[1]), gleich, m2 };
  }
  const r = t - seiten;
  if (k.spanten[0].p) return { art: 'kappe', ende: r < P - 2 ? 0 : 1 };
  return { art: 'kappe', ende: r % 2 };
}
const passt = (ist, soll) => {
  if (!ist || ist.art !== soll.art) return false;
  if (soll.art === 'kappe') return ist.ende === soll.ende;
  if (soll.art === 'kante') return ist.j === soll.j;
  if (soll.gleich) { const w = soll.m2; return (ist.achse === 'x' && ist.vz === Math.sign(w[0])) || (ist.achse === 'y' && ist.vz === Math.sign(w[1])); }
  return ist.achse === soll.achse && ist.vz === soll.vz;
};
/** Dreiecke des rohen Körpernetzes: Schwerpunkt + Flächennormale (Körper-Koordinaten). */
function dreiecke(k) {
  const g = koerperGeometrie(k), p = g.attributes.position.array, ix = g.index.array, aus = [];
  for (let t = 0; t < ix.length / 3; t++) {
    const v = [0, 1, 2].map((q) => [p[ix[3 * t + q] * 3], p[ix[3 * t + q] * 3 + 1], p[ix[3 * t + q] * 3 + 2]]);
    const e1 = v[1].map((x, i) => x - v[0][i]), e2 = v[2].map((x, i) => x - v[0][i]);
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...c);
    if (l < 1e-12) { aus.push(null); continue; }
    aus.push({ p: [0, 1, 2].map((i) => (v[0][i] + v[1][i] + v[2][i]) / 3), n: c.map((x) => x / l) });
  }
  return aus;
}

// ---------- 1) trefferImKoerper ----------
const mT = (m, v) => [0, 1, 2].map((j) => m[0][j] * v[0] + m[1][j] * v[1] + m[2][j] * v[2]);
const formel = (lage, pF, nF) => { const S = lage.spiegel ?? [1, 1, 1]; return { p: mT(lage.m, pF.map((x, i) => S[i] * x - lage.t[i])), n: mT(lage.m, nF.map((x, i) => S[i] * x)) }; };
const inForm = (lage, p, n) => { const S = lage.spiegel ?? [1, 1, 1]; return { p: wendeK(lage, p), n: [0, 1, 2].map((i) => S[i] * (lage.m[i][0] * n[0] + lage.m[i][1] * n[1] + lage.m[i][2] * n[2])) }; };
const LAGEN_TEST = [[0, 0, 0], [90, 0, 0], [0, 90, 180], [30, 45, 60], [270, 15, 90]];
const SPIEGEL_TEST = [[], ['x'], ['x', 'z'], ['x', 'y', 'z']];
{
  let maxP = 0, maxN = 0, faelle = 0, absturz = '';
  for (const dreh of LAGEN_TEST) for (const spiegel of SPIEGEL_TEST) {
    const k = N({ ...neuerKoerper('rumpf', 0, { pos: [3.5, -2, 7] }), dreh, spiegel });
    for (const { lage } of koerperListe({ koerper: [k] })) for (const pk of [[1, 2, 3], [-4, 0.5, 9], [0, 0, -20]]) {
      const nk = [0.6, 0, 0.8], f = inForm(lage, pk, nk), ist = sicher(() => trefferImKoerper(lage, f.p, f.n), (e) => { absturz = e.message; return null; });
      if (!ist) continue;
      const soll = formel(lage, f.p, f.n);
      maxP = Math.max(maxP, abst(ist.p, soll.p), abst(ist.p, pk)); maxN = Math.max(maxN, abst(ist.n, soll.n), abst(ist.n, nk)); faelle++;
    }
  }
  zeile(`trefferImKoerper = mᵀ·(S·p − t) und zurück zum Ursprung (${faelle} Fälle, gedreht + 4 Spiegelarten)`, '< 1e-9', absturz || `p ${maxP.toExponential(1)}, n ${maxN.toExponential(1)}`, !absturz && faelle > 0 && maxP < 1e-9 && maxN < 1e-9);
}

// ---------- 2) flaecheVon je Dreieck ----------
{
  let gesamt = 0, falschIdx = 0, falschOhne = 0, ohneGezaehlt = 0, richtungFalsch = 0, gegenFalsch = 0, gegenGezaehlt = 0, absturz = '';
  const beispiele = [];
  for (const [name, k0] of Object.entries(KOERPER)) for (const dreh of [[0, 0, 0], [30, 45, 60]]) for (const spiegel of [[], ['x', 'y']]) {
    const k = N({ ...k0, dreh, spiegel, pos: [2, -1, 4] }), tri = dreiecke(k);
    const lagen = koerperListe({ koerper: [k] }).map((x) => x.lage);
    tri.forEach((d, t) => {
      if (!d) return;
      const soll = erwartet(k, t);
      for (const lage of lagen) {
        gesamt++;
        // Treffer wie in der Werkstatt: Netz in Form-Koordinaten → zurück in den Körper
        const f = inForm(lage, d.p, d.n), kt = sicher(() => trefferImKoerper(lage, f.p, f.n), (e) => { absturz ||= e.message; return null; });
        if (!kt) return;
        const ist = sicher(() => flaecheVon(k, kt.p, kt.n, t), (e) => { absturz ||= e.message; return null; });
        if (!passt(ist, soll)) { falschIdx++; if (beispiele.length < 3) beispiele.push(`${name} t${t}: ${JSON.stringify(ist)} statt ${soll.art}${soll.j ?? soll.ende ?? soll.achse + soll.vz}`); }
        const r = ist?.richtung;
        if (!r || Math.abs(Math.hypot(...r) - 1) > 1e-9 || dot(r, d.n) <= (soll.art === 'seite' ? 0 : 0.7)) richtungFalsch++;
        // ohne Dreieck-Index: nur eindeutige Fälle (keine 45°-Fase)
        if (!soll.gleich) {
          ohneGezaehlt++;
          if (!passt(sicher(() => flaecheVon(k, kt.p, kt.n), () => null), soll)) falschOhne++;
        }
        // Gegenprobe: Spiegelkopie ohne Spiegel-Rückrechnung (nur Drehung) → muss bei Seiten oft falsch werden
        if (lage.spiegel && soll.art === 'seite' && !soll.gleich) {
          gegenGezaehlt++;
          const roh = { p: mT(lage.m, f.p.map((x, i) => x - lage.t[i])), n: mT(lage.m, f.n) };
          if (!passt(sicher(() => flaecheVon(k, roh.p, roh.n, t), () => null), soll) || !passt(sicher(() => flaecheVon(k, roh.p, roh.n), () => null), soll)) gegenFalsch++;
        }
      }
    });
  }
  zeile(`flaecheVon mit Dreieck-Index: ${gesamt} Treffer (${Object.keys(KOERPER).length} Körper × gedreht × Spiegelkopien)`, '0 falsch', absturz || (falschIdx ? `${falschIdx}: ${beispiele.join(' | ')}` : 0), !absturz && falschIdx === 0);
  zeile(`flaecheVon ohne Dreieck-Index (${ohneGezaehlt} eindeutige Treffer)`, '0 falsch', falschOhne, falschOhne === 0);
  zeile('flaecheVon: richtung Einheitsvektor nach außen (Kante/Kappe: · n > 0,7)', '0 falsch', richtungFalsch, richtungFalsch === 0);
  zeile('Gegenprobe flaecheVon: Spiegelkopie ohne Spiegel-Rückrechnung', `> 0 von ${gegenGezaehlt} falsch`, gegenFalsch, gegenFalsch > 0);
}

// ---------- 3) ziehe ----------
const flaecheAn = (k, art) => { // Fläche über ein Dreieck des rohen Netzes bestimmen (wie die Werkstatt)
  const tri = dreiecke(k);
  for (let t = 0; t < tri.length; t++) { if (!tri[t]) continue; const s = erwartet(k, t); if (art(s, tri[t])) return flaecheVon(k, tri[t].p, tri[t].n, t); }
  return null;
};
const KAPPE = (ende) => (s) => s.art === 'kappe' && s.ende === ende;
const SEITE = (achse, vz) => (s) => s.art === 'seite' && !s.gleich && s.achse === achse && s.vz === vz;
const KANTE = (j) => (s) => s.art === 'kante' && s.j === j;
const lauf = (k, f, d) => { const r = ziehe(k, f, d); return { r, k2: N(r.koerper) }; };
const laenge = (k) => k.spanten[k.spanten.length - 1].z - k.spanten[0].z;
const absPunkte = (k) => k.spanten.map((s) => profilPunkte(s));
const maxAbw = (A, B) => Math.max(...A.flatMap((s, i) => s.map((p, j) => abst(p, B[i][j]))));
const zahlenAbw = (a, b) => { let m = 0; const geh = (x, y) => { if (typeof x === 'number') m = Math.max(m, Math.abs(x - y)); else if (x && typeof x === 'object') for (const k of Object.keys(x)) geh(x[k], y?.[k]); }; geh(a, b); return m; };
{
  // Kappe, prismatisch (Quader): nur z wandert, Volumen + A·d, Maß + d, hin und zurück
  const q = KOERPER.quader, f1 = flaecheAn(q, KAPPE(1)), f0 = flaecheAn(q, KAPPE(0)), A = volumen(q) / laenge(q);
  const a = lauf(q, f1, 2), b = lauf(q, f0, 3);
  zeile('Kappe prismatisch (Quader, Ende 1 +2 / Ende 0 +3): Spantzahl | Länge | ΔV = A·d | d', '2 | 12, 13 | exakt | 2, 3',
    `${a.k2.spanten.length} | ${laenge(a.k2)}, ${laenge(b.k2)} | ${(volumen(a.k2) - volumen(q) - 2 * A).toExponential(1)}, ${(volumen(b.k2) - volumen(q) - 3 * A).toExponential(1)} | ${a.r.d}, ${b.r.d}`,
    a.k2.spanten.length === 2 && laenge(a.k2) === 12 && laenge(b.k2) === 13 && Math.abs(volumen(a.k2) - volumen(q) - 2 * A) < 1e-9 && Math.abs(volumen(b.k2) - volumen(q) - 3 * A) < 1e-9 && a.r.d === 2 && b.r.d === 3
    && a.k2.spanten[0].z === q.spanten[0].z && b.k2.spanten[1].z === q.spanten[1].z);
  const m0 = flaechenMass(q, f1), m1 = flaechenMass(a.k2, flaecheAn(a.k2, KAPPE(1)));
  const zur = lauf(a.k2, flaecheAn(a.k2, KAPPE(1)), -2);
  zeile('Kappe: flaechenMass + d | hin und zurück', `${m0} → ${m0 + 2} | < 1e-9`, `${m0} → ${m1} | ${zahlenAbw(zur.k2.spanten, q.spanten).toExponential(1)}`, m1 === m0 + 2 && zahlenAbw(zur.k2.spanten, q.spanten) < 1e-9);
  // Kappe nach innen geklemmt: Abstand zum Nachbar-Spant ≥ 0,1 m
  const kl = lauf(q, f1, -100), r4 = KOERPER.rumpf, rk = lauf(r4, flaecheAn(r4, KAPPE(1)), -100);
  const abstNachbar = (k) => k.spanten[k.spanten.length - 1].z - k.spanten[k.spanten.length - 2].z;
  zeile('Kappe nach innen −100 geklemmt: Quader-Länge | Rumpf Abstand zum Nachbar-Spant | d', '0,1 | 0,1 | −9,9 / −11,9',
    `${laenge(kl.k2).toFixed(4)} | ${abstNachbar(rk.k2).toFixed(4)} | ${kl.r.d} / ${rk.r.d}`,
    Math.abs(laenge(kl.k2) - 0.1) < 1e-9 && Math.abs(abstNachbar(rk.k2) - 0.1) < 1e-9 && Math.abs(kl.r.d + 9.9) < 1e-9 && Math.abs(rk.r.d - (0.1 - (r4.spanten[3].z - r4.spanten[2].z))) < 1e-9);
  // Kappe an nicht-prismatischem Ende: neuer Spant (Kopie des End-Spants), alte Spanten unverändert, ΔV = A_Ende·d
  const fehlerV = [];
  for (const name of ['trapez', 'kegel', 'rumpf', 'keil']) {
    const k = KOERPER[name];
    for (const ende of [0, 1]) {
      const { r, k2 } = lauf(k, flaecheAn(k, KAPPE(ende)), 2.5), sEnde = k.spanten[ende ? k.spanten.length - 1 : 0];
      const neu = ende ? k2.spanten[k2.spanten.length - 1] : k2.spanten[0], alt = ende ? k2.spanten.slice(0, -1) : k2.spanten.slice(1);
      const dV = volumen(k2) - volumen(k), soll = profilFlaecheS(sEnde) * 2.5;
      if (k2.spanten.length !== k.spanten.length + 1 || zahlenAbw(alt, k.spanten) > 1e-9 || Math.abs(neu.z - (sEnde.z + (ende ? 2.5 : -2.5))) > 1e-9
        || Math.abs(neu.b - sEnde.b) > 1e-9 || Math.abs(neu.h - sEnde.h) > 1e-9 || Math.abs(dV - soll) > 1e-6 * Math.max(1, soll) || r.d !== 2.5) fehlerV.push(`${name}/${ende}: ${k2.spanten.length} Sp., ΔV ${dV.toFixed(3)}/${soll.toFixed(3)}`);
    }
  }
  zeile('Kappe nach außen an nicht-prismatischem Ende (Trapez, Kegel, Rumpf, Keil × 2 Enden): neuer Spant, ΔV = A_Ende·d', '0 falsch', fehlerV.join(' | ') || 0, fehlerV.length === 0);

  // Seite (ohne p), scharfer Quader: b + d, gegenüberliegende Seite bleibt, ΔV = h·L·d exakt, Maß + d, hin und zurück
  const sf = [];
  for (const [achse, vz] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]]) {
    const f = flaecheAn(q, SEITE(achse, vz)); if (!f) { sf.push(`${achse}${vz}: keine Fläche`); continue; }
    const { r, k2 } = lauf(q, f, 1.5), i = achse === 'x' ? 0 : 1, h0 = huelle(q), h1 = huelle(k2);
    const gegen = vz > 0 ? h1.min[i] - h0.min[i] : h1.max[i] - h0.max[i], vorn = vz > 0 ? h1.max[i] - h0.max[i] : h0.min[i] - h1.min[i];
    const quer = achse === 'x' ? q.spanten[0].h : q.spanten[0].b, dV = volumen(k2) - volumen(q) - quer * laenge(q) * 1.5;
    const mass = flaechenMass(k2, flaecheAn(k2, SEITE(achse, vz))) - flaechenMass(q, f);
    const zur = lauf(k2, flaecheAn(k2, SEITE(achse, vz)), -1.5);
    if (Math.abs(gegen) > 1e-9 || Math.abs(vorn - 1.5) > 1e-9 || Math.abs(dV) > 1e-9 || Math.abs(mass - 1.5) > 1e-9 || r.d !== 1.5 || zahlenAbw(zur.k2.spanten, q.spanten) > 1e-9) sf.push(`${achse}${vz}: gegen ${gegen} vorn ${vorn} ΔV ${dV.toExponential(1)} Maß ${mass}`);
  }
  zeile('Seite (Quader, ±x/±y +1,5): gegenüber bleibt, ΔV = Querseite·L·d, Maß + d, hin und zurück', '0 falsch', sf.join(' | ') || 0, sf.length === 0);
  // Seite bei Fase/Rundung: nur Grenzen (E3) — Volumen wächst, höchstens um die volle Hüllfläche·d
  const sr = [];
  for (const name of ['zylinder', 'rumpf', 'platte', 'trapez']) {
    const k = KOERPER[name], f = flaecheAn(k, SEITE('x', 1)); if (!f) { sr.push(`${name}: keine Fläche`); continue; }
    const { k2 } = lauf(k, f, 1), h = huelle(k), dV = volumen(k2) - volumen(k), oben = (h.max[1] - h.min[1]) * (h.max[2] - h.min[2]);
    if (!(dV > 0 && dV <= oben + 1e-6) || Math.abs(huelle(k2).min[0] - h.min[0]) > 1e-9) sr.push(`${name}: ΔV ${dV.toFixed(2)} (≤ ${oben.toFixed(1)})`);
  }
  zeile('Seite mit Fase/Rundung (+1): 0 < ΔV ≤ Hüllfläche·d, gegenüber bleibt', '0 falsch', sr.join(' | ') || 0, sr.length === 0);
  const sk = lauf(q, flaecheAn(q, SEITE('x', 1)), -100);
  zeile('Seite nach innen −100 geklemmt: Breite | d', '0,1 | −9,9', `${sk.k2.spanten[0].b} | ${sk.r.d}`, Math.abs(sk.k2.spanten[0].b - 0.1) < 1e-9 && Math.abs(sk.r.d + 9.9) < 1e-9);

  // Kante (Umriss p): L-Skizze, jede Kante +1 → Kante parallel um d, Nachbarpunkte bleiben auf den Nachbarlinien,
  // übrige Punkte bleiben, p in ±0,5, ΔV = Kantenlänge·L·d (rechtwinklige Nachbarn), Maß + d, hin und zurück
  const kf = [], sk2 = KOERPER.skizze_L, PL = profilPunkte(sk2.spanten[0]), TOL = 1.5e-3; // TOL: umrissAusPunkten rundet b/h/x/y auf mm
  for (let j = 0; j < PL.length; j++) {
    const f = flaecheAn(sk2, KANTE(j)); if (!f) { kf.push(`j${j}: keine Fläche`); continue; }
    const { r, k2 } = lauf(sk2, f, 1), P2 = absPunkte(k2), P0 = absPunkte(sk2), j2 = (j + 1) % PL.length, n2 = normale2(PL, j);
    let fehler = '';
    for (let s = 0; s < P0.length; s++) {
      for (let i = 0; i < PL.length; i++) if (i !== j && i !== j2 && abst(P2[s][i], P0[s][i]) > TOL) fehler = `Punkt ${i} bewegt`;
      for (const i of [j, j2]) if (Math.abs((P2[s][i][0] - P0[s][i][0]) * n2[0] + (P2[s][i][1] - P0[s][i][1]) * n2[1] - 1) > TOL) fehler = `Punkt ${i} nicht um d`;
      // Nachbarlinie: Punkt j auf der Linie (j−1, j), Punkt j+1 auf der Linie (j+1, j+2)
      for (const [i, a] of [[j, (j - 1 + PL.length) % PL.length], [j2, (j2 + 1) % PL.length]]) {
        const A = P0[s][a], B = P0[s][i], C = P2[s][i], cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        if (Math.abs(cr) / Math.hypot(B[0] - A[0], B[1] - A[1]) > TOL) fehler = `Punkt ${i} verlässt die Nachbarlinie`;
      }
    }
    const pAus = k2.spanten.some((s) => s.p.some(([u, v]) => Math.abs(u) > 0.5 + 1e-9 || Math.abs(v) > 0.5 + 1e-9));
    const lenJ = abst(PL[j], PL[j2]), dV = volumen(k2) - volumen(sk2) - lenJ * laenge(sk2) * 1;
    // Maß + d nur an äußeren Kanten (Kante ist die weiteste Stelle in ihrer Richtung) — WARUM: an der inneren Stufe des L
    // ändert sich die Ausdehnung in Zugrichtung nicht; was flaechenMass dort anzeigt, legt die Schnittstelle nicht fest
    const aussen = Math.max(...PL.map((q) => q[0] * n2[0] + q[1] * n2[1])) - (PL[j][0] * n2[0] + PL[j][1] * n2[1]) < 1e-9;
    const mass = aussen ? flaechenMass(k2, flaecheAn(k2, KANTE(j))) - flaechenMass(sk2, f) : 1;
    const zur = lauf(k2, flaecheAn(k2, KANTE(j)), -1), zAbw = maxAbw(absPunkte(zur.k2), P0);
    if (fehler || pAus || Math.abs(dV) > 0.02 * lenJ * laenge(sk2) || Math.abs(mass - 1) > TOL || Math.abs(r.d - 1) > 1e-9 || zAbw > 2 * TOL)
      kf.push(`j${j}: ${fehler || ''}${pAus ? ' p>0,5' : ''} ΔV ${dV.toFixed(3)} Maß ${mass.toFixed(4)} zurück ${zAbw.toExponential(1)}`);
  }
  zeile(`Kante (L-Skizze, alle ${PL.length} Kanten +1): parallel um d, gleitet an den Nachbarkanten, Rest bleibt, p ≤ 0,5, ΔV, Maß, zurück`, '0 falsch (±1,5 mm)', kf.join(' | ') || 0, kf.length === 0);
  // Kante an alsPunkte(Trapez) (verjüngt: je Spant eigene Normale): Punkte bewegen sich je Spant um d entlang ihrer Normalen
  const tp = KOERPER.punkte_trapez, tf = [];
  for (let j = 0; j < profilPunkte(tp.spanten[0]).length; j++) {
    const f = flaecheAn(tp, KANTE(j)); if (!f) continue;
    const { k2 } = lauf(tp, f, 0.8), P0 = absPunkte(tp), P2 = absPunkte(k2);
    for (let s = 0; s < P0.length; s++) {
      const n2 = normale2(P0[s], j), j2 = (j + 1) % P0[s].length;
      for (const i of [j, j2]) if (Math.abs((P2[s][i][0] - P0[s][i][0]) * n2[0] + (P2[s][i][1] - P0[s][i][1]) * n2[1] - 0.8) > TOL) tf.push(`j${j} Spant ${s}`);
    }
  }
  zeile('Kante an alsPunkte(Trapez): je Spant um d entlang der eigenen Normalen', '0 falsch', tf.slice(0, 4).join(', ') || 0, tf.length === 0);
  // Kante nach innen −100: geklemmt — kein Selbstschnitt, keine Kante < 6 cm, Fläche > 0
  const schnitt = (P) => { for (let a = 0; a < P.length; a++) for (let b = a + 2; b < P.length; b++) { if (a === 0 && b === P.length - 1) continue;
    const [p1, p2, p3, p4] = [P[a], P[(a + 1) % P.length], P[b], P[(b + 1) % P.length]], o = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
    if (o(p1, p2, p3) * o(p1, p2, p4) < 0 && o(p3, p4, p1) * o(p3, p4, p2) < 0) return true; } return false; };
  const klf = [];
  for (let j = 0; j < PL.length; j++) {
    const f = flaecheAn(sk2, KANTE(j)); if (!f) continue;
    const { r, k2 } = lauf(sk2, f, -100), P = profilPunkte(k2.spanten[0]);
    const kurz = Math.min(...P.map((p, i) => abst(p, P[(i + 1) % P.length])));
    if (schnitt(P) || kurz < 0.06 - 1e-3 || !(volumen(k2) > 0) || !(r.d < 0 && r.d > -100)) klf.push(`j${j}: d ${r.d} kurz ${kurz.toFixed(3)}${schnitt(P) ? ' Schnitt' : ''}`);
  }
  zeile('Kante −100 geklemmt (L-Skizze): kein Selbstschnitt, Kanten ≥ 6 cm, Volumen > 0, −100 < d < 0', '0 falsch', klf.join(' | ') || 0, klf.length === 0);
  zeile('Gegenprobe Selbstschnitt-Prüfung: Schleife (Achter)', 'rot', schnitt([[0, 0], [2, 2], [2, 0], [0, 2]]) ? 'rot' : 'grün', schnitt([[0, 0], [2, 2], [2, 0], [0, 2]]));

  // fest, Eingabe unverändert, Unsinn-d, dicht, pruefe
  const fest = tiefFrieren({ ...kopie(q), fest: true }), rf = ziehe(fest, f1, 5);
  zeile('fest: Körper unverändert, d = 0', 'gleich, 0', `${JSON.stringify(rf.koerper) === JSON.stringify(fest) ? 'gleich' : 'ANDERS'}, ${rf.d}`, JSON.stringify(rf.koerper) === JSON.stringify(fest) && rf.d === 0);
  const unsinn = [], aendert = [], offen = [], meld = [], kipp = [];
  for (const [name, k0] of Object.entries(KOERPER)) {
    const k = tiefFrieren(kopie(k0)), vorher = JSON.stringify(k), tri = dreiecke(k);
    for (let t = 0; t < tri.length; t += Math.max(1, Math.floor(tri.length / 12))) {
      if (!tri[t]) continue;
      const f = flaecheVon(k, tri[t].p, tri[t].n, t);
      for (const d of [NaN, Infinity, -Infinity, 1e9, -1e9, 0, 0.37]) {
        const r = sicher(() => ziehe(k, f, d), (e) => ({ fehler: e.message }));
        if (r.fehler || unendlich(r.koerper) || !Number.isFinite(r.d) || (!Number.isFinite(d) && r.d !== 0)) { unsinn.push(`${name} t${t} d=${d}: ${r.fehler ?? 'd ' + r.d}`); continue; }
        if (d === 0 && (r.d !== 0 || zahlenAbw(N(r.koerper).spanten, k.spanten) > 1e-9)) unsinn.push(`${name} t${t} d=0 ändert`);
        if (d === 0.37 || d === 1e9) {
          const k2 = N(r.koerper), ok = offeneKanten({ a: koerperGeometrie(k2).toNonIndexed() }).kanten;
          if (ok) offen.push(`${name} t${t} d=${d}: ${ok}`);
          // Umriss p: keine Kante dreht sich um (kurze Fase weiter als ihre Höhe gezogen → Kante kippt, Netz undicht)
          if (k.spanten[0].p && k2.spanten.length === k.spanten.length) k.spanten.forEach((s, i) => {
            const A = profilPunkte(s), B = profilPunkte(k2.spanten[i]);
            for (let j = 0; j < A.length; j++) { const j2 = (j + 1) % A.length;
              if ((A[j2][0] - A[j][0]) * (B[j2][0] - B[j][0]) + (A[j2][1] - A[j][1]) * (B[j2][1] - B[j][1]) <= 0) { kipp.push(`${name} t${t} d=${d} Spant ${i} Kante ${j}`); break; } }
          });
          const neu = pruefe(normalisiere({ name: 't', koerper: [k2], andock: [{ id: 'a', n: [0, 0, 1] }] })).filter((m) => m.stufe === 'fehler');
          if (neu.length) meld.push(`${name} t${t}: ${neu.map((m) => m.code).join(',')}`);
        }
      }
    }
    if (JSON.stringify(k) !== vorher) aendert.push(name);
  }
  zeile('Unsinn-d (NaN, ±∞, ±1e9, 0) an allen Körpern: kein Absturz, endlich, d(NaN/∞) = 0, d = 0 ändert nichts', '0', unsinn.slice(0, 3).join(' | ') || 0, unsinn.length === 0);
  zeile('ziehe: Eingabe (tief eingefroren) unverändert', '0', aendert.join(', ') || 0, aendert.length === 0);
  zeile('ziehe: Ergebnis-Netz dicht (d 0,37 und 1e9)', '0 offene Kanten', offen.slice(0, 3).join(' | ') || 0, offen.length === 0);
  zeile('ziehe: Umriss p — keine Kante kippt (Richtung bleibt, d 0,37 und 1e9)', '0', kipp.slice(0, 3).join(' | ') || 0, kipp.length === 0);
  zeile('ziehe: pruefe meldet danach keinen Fehler', '0', meld.slice(0, 3).join(' | ') || 0, meld.length === 0);
}

// ---------- 4) ablegen ----------
{
  const raster = (x) => Number.isInteger(x * 2);
  const neu = N(neuerKoerper('trapez', 0)), h = huelle(neu), mitte = h.min.map((v, i) => (v + h.max[i]) / 2);
  const fehler = [];
  let maxBer = 0, faelle = 0, art = new Set();
  for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) for (const p0 of [[3.3, 7.1, -2.6], [-12.74, 0.2, 40.01]]) {
    const i = n.findIndex((x) => x !== 0), p = [...p0];
    const pos = sicher(() => ablegen(h, { p, n }), (e) => { fehler.push(e.message); return null; }); if (!pos) continue;
    faelle++;
    const lo = h.min.map((v, a) => v + pos[a]), hi = h.max.map((v, a) => v + pos[a]);
    const ber = n[i] > 0 ? lo[i] - p[i] : p[i] - hi[i]; maxBer = Math.max(maxBer, Math.abs(ber));
    if (Math.abs(ber) > 1e-3) fehler.push(`n ${n}: Abstand ${ber.toFixed(4)}`);
    for (let a = 0; a < 3; a++) if (a !== i) {
      if (!raster(pos[a])) fehler.push(`n ${n}: pos[${a}] = ${pos[a]} nicht auf 0,5 m`);
      // quer: entweder Mitte oder Ursprung des Körpers am Treffer (± halbes Raster)
      const mitteAm = Math.abs(pos[a] + mitte[a] - p[a]) <= 0.25 + 1e-9, nullAm = Math.abs(pos[a] - p[a]) <= 0.25 + 1e-9;
      if (!mitteAm && !nullAm) fehler.push(`n ${n}: quer ${a} weit weg`); else art.add(mitteAm ? 'Mitte am Treffer' : 'Ursprung am Treffer');
    }
  }
  zeile(`ablegen: 6 Achsen-Normalen × 2 Treffer — Hülle berührt die Fläche von außen, quer auf 0,5 m (${faelle} Fälle)`, '±1 mm, Raster', fehler.slice(0, 3).join(' | ') || `${maxBer.toExponential(1)} m, ${[...art].join('/')}`, fehler.length === 0 && faelle === 12);
  // Gegenproben: um 0,1 m quer bzw. 2 mm entlang n verschobene pos müssen auffallen
  const p = [3.3, 7.1, -2.6], n = [0, 1, 0], pos = ablegen(h, { p, n });
  const quer = [pos[0] + 0.1, pos[1], pos[2]], tief = [pos[0], pos[1] - 0.002, pos[2]];
  zeile('Gegenprobe ablegen: pos quer +0,1 m → Raster rot | pos −2 mm entlang n → Berührung rot', 'rot | rot',
    `${raster(quer[0]) ? 'grün' : 'rot'} | ${Math.abs(h.min[1] + tief[1] - p[1]) > 1e-3 ? 'rot' : 'grün'}`, !raster(quer[0]) && Math.abs(h.min[1] + tief[1] - p[1]) > 1e-3);
  // Gedreht (E8: Spalt hingenommen) — Info: Zielkörper 30° um Y, Treffer auf seiner +X-Seite (Normale gerastet)
  const ziel = N({ ...neuerKoerper('quader', 0), dreh: [0, 30, 0] }), lage = koerperMatrix(ziel);
  const pF = wendeK(lage, [5, 0, 0]), nF = [lage.m[0][0], lage.m[1][0], lage.m[2][0]], nR = nF.map((x, i) => (i === 0 ? Math.sign(x) : 0));
  const pg = ablegen(h, { p: pF, n: nR });
  // Spalt = Abstand der nächsten Hüllecke des abgelegten Körpers zur echten (schrägen) Fläche entlang ihrer Normalen
  let spalt = Infinity;
  for (const x of [h.min[0], h.max[0]]) for (const y of [h.min[1], h.max[1]]) for (const z of [h.min[2], h.max[2]]) spalt = Math.min(spalt, dot([x + pg[0] - pF[0], y + pg[1] - pF[1], z + pg[2] - pF[2]], nF));
  zeile('ablegen auf schräger Fläche (Ziel 30° gedreht) — Spalt bzw. Eindringen (Info, E8)', 'Info', `${spalt.toFixed(3)} m`, true, false);
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

function profilFlaecheS(s) { const p = profilPunkte(s); let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }

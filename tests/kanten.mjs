// ZWECK: Prüfungen ohne Browser für Fase/Rundung an Kanten (Runde 21, `node tests/kanten.mjs`) gegen die Schnittstelle im
//        Protokoll R21 — unabhängig vom Schiffbauer geschrieben.
//   1) Alte Formen bitgleich zum Stand vor R21 (Commit 19a5ed2): Beispiele, Generator-Formen, Zufallsformen — normalisiere,
//      profilPunkte, huelle, volumen, massenwerte, flugwerte, pruefe, pruefeSchiff, formKugeln als Fingerabdruck je Satz.
//   2) kanten.js: kantenVon (ids L0–L3, K0o…K1r, P<j>), fase/rundung → { koerper, mass }: Maß an der Ecke exakt, Volumen
//      sinkt wie gerechnet (Fase L·a²/2, Rundung L·r²(1−π/4), Kappe b·a²/2), Klemmen, Müll, unbekannte id, eigener Umriss,
//      Spiegelkörper, Kappe bei 24 Spanten, normalisiere behält ecken/kf (idempotent), Gleichlauf, pruefe/pruefeSchiff.
//   Gegenproben: die Maß-Prüfung schlägt an einer unveränderten Ecke an; eine geänderte Form ändert den Fingerabdruck.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER. MESSEN=1 → gibt nur die Anker aus (alter Stand).
// REGEL: KANTEN_MODUL=<pfad> prüft eine andere kanten.js (Ersatz-Umsetzung, Lernbuch R18).
import { normalisiere, pruefe, profilPunkte, huelle, volumen, koerperListe, VORLAGEN, GRENZEN } from '../src/sim/form/form.js';
import { massenwerte, flugwerte } from '../src/sim/form/flug.js';
import { BAUTEILE, pruefeSchiff } from '../src/sim/form/bauteile.js';
import { formKugeln } from '../src/sim/form/kugeln.js';
import { BEISPIEL_FORMEN } from '../src/sim/form/beispiele.js';
import { generiere, standardEinstellung } from '../src/sim/form/generator.js';
import { zufall } from '../src/sim/zufall.js';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const START = performance.now();
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const J = (o) => JSON.stringify(o);
const kopie = (o) => JSON.parse(J(o));
const sicher = (f, fb) => { try { return f(); } catch (e) { return fb(e); } };
const tiefFrieren = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(tiefFrieren); } return o; };
const unendlich = (o) => (typeof o === 'number' ? !Number.isFinite(o) : o && typeof o === 'object' ? Object.values(o).some(unendlich) : false);
const hash = (s) => { let a = 0x811c9dc5, b = 0x2545f491; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = (Math.imul(b ^ c, 2246822519) + i) >>> 0; } return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'); };

// ---------- 1) Alte Formen bitgleich ----------
/** Alles, was eine Form nach außen ergibt (ohne neue Felder) — als Text. */
function abdruck(roh) {
  const f = normalisiere(roh);
  return J({
    f, profile: f.koerper.map((k) => k.spanten.map((s) => profilPunkte(s))),
    huellen: koerperListe(f).map(({ k, lage }) => huelle(k, lage)), vol: f.koerper.map((k) => volumen(k)),
    mw: (({ masse, schwerpunkt, traegheit, formMasse, laenge }) => ({ masse, schwerpunkt, traegheit, formMasse, laenge }))(massenwerte(f, BAUTEILE)),
    fw: flugwerte(f, BAUTEILE).werte, pr: pruefe(f).map((m) => m.code), ps: pruefeSchiff(f, true).meldungen.map((m) => m.code + ':' + (m.bauteil ?? '')),
    kugeln: formKugeln(f),
  });
}
/** Zufallsformen (fester Startwert): Vorlagen, Drehungen, Spiegel, Fase/Rundung, eigene Umrisse, Minus, Bauteile. */
function zufallsFormen(n) {
  const r = zufall(2111), w = (a) => a[Math.floor(r() * a.length)], z = (a, b) => a + (b - a) * r();
  const vorlagen = Object.keys(VORLAGEN), typen = Object.keys(BAUTEILE), aus = [];
  for (let i = 0; i < n; i++) {
    const koerper = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, id) => {
      const ns = 2 + Math.floor(r() * 4), np = 5 + Math.floor(r() * 4), p = r() < 0.25 ? Array.from({ length: np }, (_, j) => { const t = (j / np) * 2 * Math.PI; return [0.5 * Math.cos(t), 0.5 * Math.sin(t) * z(0.6, 1)]; }) : undefined;
      let zz = z(-40, -5);
      return { id, typ: w(vorlagen), op: r() < 0.15 ? 'minus' : 'plus', mat: 'rumpf', pos: [z(-15, 15), z(-8, 8), z(-30, 30)],
        dreh: [w([0, 90, 180, 270, z(0, 360)]), w([0, 0, 90]), w([0, 0, 0, 45])], spiegel: w([[], [], ['x'], ['x', 'z']]),
        spanten: Array.from({ length: ns }, () => ({ z: (zz += z(2, 25)), b: z(1, 30), h: z(1, 20), x: w([0, 0, z(-2, 2)]), y: w([0, z(-2, 2)]), rundung: w([0, 0, z(0, 1)]), fase: w([0, z(0, 1)]), ...(p && { p }) })) };
    });
    const bauteile = Array.from({ length: Math.floor(r() * 5) }, (_, id) => ({ id, typ: w(typen), p: [z(-10, 10), z(-8, 8), z(-40, 40)], n: w([[0, 1, 0], [0, -1, 0], [0, 0, -1], [1, 0, 0]]), spiegel: w([[], ['x']]) }));
    aus.push({ name: 'Zufall ' + i, art: 'rumpf', koerper, bauteile });
  }
  return aus;
}
const SAETZE = {
  beispiele: BEISPIEL_FORMEN,
  generator: ['korvette', 'fregatte', 'traeger'].flatMap((k) => [1, 815, 4711, 99999].flatMap((seed) => [{}, { kantigkeit: 0 }, { kantigkeit: 1, aufbauten: 1 }].map((m) => generiere({ ...standardEinstellung(k), seed, ...m })))),
  zufall: zufallsFormen(60),
};
const satzAbdruck = (liste) => hash(liste.map(abdruck).join('\n'));
const ANKER = { beispiele: 'a6d61f396305b271', generator: '43d78e8b49a24f91', zufall: '9e05538634e88df3' };
if (process.env.MESSEN) { console.log(JSON.stringify(Object.fromEntries(Object.entries(SAETZE).map(([n, l]) => [n, satzAbdruck(l)])))); process.exit(0); }
{
  const ist = Object.fromEntries(Object.entries(SAETZE).map(([n, l]) => [n, satzAbdruck(l)]));
  for (const n of Object.keys(SAETZE)) zeile(`Alte Formen bitgleich zu 19a5ed2: ${n} (${SAETZE[n].length} Formen)`, 'gleich', ist[n] === ANKER[n] ? 'gleich' : `${ist[n]} ≠ ${ANKER[n]}`, ist[n] === ANKER[n]);
  const g = kopie(SAETZE.beispiele[0]); g.koerper[0].spanten[0].b += 1e-9;
  zeile('Gegenprobe: 1e-9 m mehr Breite ändert den Fingerabdruck', 'anders', satzAbdruck([g]) !== satzAbdruck([SAETZE.beispiele[0]]) ? 'anders' : 'GLEICH', satzAbdruck([g]) !== satzAbdruck([SAETZE.beispiele[0]]));
  const kein = [...SAETZE.generator, ...SAETZE.zufall].filter((f) => /"ecken"|"kf"/.test(J(normalisiere(f)))).length;
  zeile('normalisiere ergänzt bei alten Formen kein ecken/kf', '0', kein, kein === 0);
}

// ---------- 2) kanten.js ----------
const PFAD = process.env.KANTEN_MODUL ? pathToFileURL(process.env.KANTEN_MODUL).href : new URL('../src/sim/form/kanten.js', import.meta.url).href;
const K = await import(PFAD).then((m) => { const f = ['kantenVon', 'fase', 'rundung'].filter((n) => !(n in m)); return f.length ? `exportiert nicht ${f.join(', ')}` : m; }, (e) => `fehlt oder lädt nicht (${e.code ?? ''} ${String(e.message).split('\n')[0]})`);
if (typeof K === 'string') zeile('src/sim/form/kanten.js', 'vorhanden + Exporte', K, false);
else {
  const { kantenVon, fase, rundung, kanteFlaechen } = K;
  const MIN = 0.03; // MIN_EINZUG in form.js — Standard-Ecken sind schon 3 cm gefast
  const B = 8, H = 6, L = 20, w = B / 2, h = H / 2;
  const quader = (spanten = [{ z: -L / 2, b: B, h: H }, { z: L / 2, b: B, h: H }], mehr = {}) => normalisiere({ art: 'rumpf', koerper: [{ id: 0, typ: 'quader', op: 'plus', mat: 'rumpf', pos: [0, 0, 0], dreh: [0, 0, 0], spiegel: [], spanten, ...mehr }] }).koerper[0];
  const Q = tiefFrieren(quader());
  /** Ergebnis einer Kanten-Operation über normalisiere (so speichert die Werkstatt). */
  const op = (fn, k, ids, m) => { const r = fn(k, ids, m); return { ...r, k: normalisiere({ art: 'rumpf', koerper: [r.koerper] }).koerper[0] }; };
  const ids = (k) => kantenVon(k).map((e) => e.id);
  const nah = (pkt, q, t = 1e-6) => pkt.some(([x, y]) => Math.abs(x - q[0]) < t && Math.abs(y - q[1]) < t);
  /** Fase a an Ecke (sx, sy): beide Endpunkte da, kein Punkt jenseits der Fasenlinie. */
  const faseOk = (k, sx, sy, a) => k.spanten.every((s) => { const p = profilPunkte(s);
    return nah(p, [sx * (w - a), sy * h]) && nah(p, [sx * w, sy * (h - a)]) && Math.max(...p.map(([x, y]) => sx * x + sy * y)) <= w + h - a + 1e-6; });
  const rundOk = (k, sx, sy, r) => k.spanten.every((s) => { const p = profilPunkte(s), cx = sx * (w - r), cy = sy * (h - r);
    return nah(p, [cx, sy * h]) && nah(p, [sx * w, cy]) && p.filter(([x, y]) => sx * (x - cx) > 1e-9 && sy * (y - cy) > 1e-9).every(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r) < 1e-6); });

  // kantenVon
  const soll = ['L0', 'L1', 'L2', 'L3', 'K0o', 'K0u', 'K0l', 'K0r', 'K1o', 'K1u', 'K1l', 'K1r'];
  const kv = sicher(() => kantenVon(Q), (e) => e);
  const fehlt = Array.isArray(kv) ? soll.filter((i) => !kv.some((e) => e.id === i)) : ['wirft ' + kv.message];
  zeile('kantenVon(Quader): ids L0–L3, K0o/u/l/r, K1o/u/l/r | Punkte endlich', 'vollständig | ja', `${fehlt.join(',') || 'vollständig'} | ${Array.isArray(kv) && !unendlich(kv.map((e) => e.punkte)) ? 'ja' : 'NEIN'}`, fehlt.length === 0 && !unendlich(kv.map((e) => e.punkte)));

  // Fase an L0 (rechts oben): Maß, Volumen, Felder
  const V0 = volumen(Q);
  const f1 = sicher(() => op(fase, Q, ['L0'], 1), (e) => ({ fehler: e.message }));
  if (f1.fehler) zeile('fase(Quader, [L0], 1)', 'wirft nicht', f1.fehler, false);
  else {
    zeile('fase L0 = 1 m: mass | Endpunkte an Ecke 0 (rechts oben) exakt | kein Punkt über der Fasenlinie', '1 | ja', `${f1.mass} | ${faseOk(f1.k, 1, 1, 1) ? 'ja' : 'NEIN'}`, f1.mass === 1 && faseOk(f1.k, 1, 1, 1));
    zeile('Gegenprobe: Maß-Prüfung an der unveränderten Ecke 1 (links oben)', 'schlägt an', faseOk(f1.k, -1, 1, 1) ? 'STUMM' : 'schlägt an', !faseOk(f1.k, -1, 1, 1));
    const dV = V0 - volumen(f1.k), dSoll = L * (1 - MIN * MIN) / 2;
    zeile('fase L0 = 1 m: Volumen sinkt um L·(a² − 0,03²)/2', `${dSoll.toFixed(4)} m³ ±1e-6`, `${dV.toFixed(6)} m³`, Math.abs(dV - dSoll) < 1e-6 * V0 + 1e-6);
    zeile('normalisiere behält ecken (Spant-Feld) | idempotent | Eingabe unverändert', 'ja | ja | ja', `${/"ecken"/.test(J(f1.k)) ? 'ja' : 'NEIN'} | ${J(normalisiere({ koerper: [f1.k] }).koerper[0]) === J(f1.k) ? 'ja' : 'NEIN'} | ${J(Q) === J(quader()) ? 'ja' : 'NEIN'}`,
      /"ecken"/.test(J(f1.k)) && J(normalisiere({ koerper: [f1.k] }).koerper[0]) === J(f1.k) && J(Q) === J(quader()));
    const f1b = op(fase, Q, ['L0'], 1);
    zeile('Gleichlauf: fase zweimal → gleiches JSON', 'gleich', J(f1b.k) === J(f1.k) ? 'gleich' : 'ANDERS', J(f1b.k) === J(f1.k));
    const nachher = sicher(() => ids(f1.k), () => []);
    zeile('Kanten-ids bleiben nach einer Fase erhalten', 'alle', soll.filter((i) => !nachher.includes(i)).join(',') || 'alle', soll.every((i) => nachher.includes(i)));
    const f4 = op(fase, Q, ['L0', 'L1', 'L2', 'L3'], 1), d4 = V0 - volumen(f4.k);
    zeile('fase L0–L3 = 1 m: 4 × Volumenverlust | alle Ecken exakt', `${(4 * dSoll).toFixed(4)} | ja`, `${d4.toFixed(6)} | ${[[1, 1], [-1, 1], [-1, -1], [1, -1]].every(([sx, sy]) => faseOk(f4.k, sx, sy, 1)) ? 'ja' : 'NEIN'}`,
      Math.abs(d4 - 4 * dSoll) < 1e-6 * V0 + 1e-6 && [[1, 1], [-1, 1], [-1, -1], [1, -1]].every(([sx, sy]) => faseOk(f4.k, sx, sy, 1)));
  }
  // Rundung an L1 (links oben)
  const r2 = sicher(() => op(rundung, Q, ['L1'], 2), (e) => ({ fehler: e.message }));
  if (r2.fehler) zeile('rundung(Quader, [L1], 2)', 'wirft nicht', r2.fehler, false);
  else {
    // WARUM Sollwert aus dem Polygon (Lernbuch R16: exakte Formel, nicht das Verhalten): der Bogen besteht aus N Sehnen —
    // abgeschnitten wird r² minus N Dreiecke (r²/2)·sin(π/2N); N aus den Punkten auf dem Kreis
    const c0 = [-(w - 2), h - 2], aufBogen = profilPunkte(r2.k.spanten[0]).filter(([x, y]) => x <= c0[0] + 1e-9 && y >= c0[1] - 1e-9 && Math.abs(Math.hypot(x - c0[0], y - c0[1]) - 2) < 1e-6).length, N = aufBogen - 1;
    const dV = V0 - volumen(r2.k), dSoll = L * (4 - 2 * N * Math.sin(Math.PI / (2 * N)) - MIN * MIN / 2), dKreis = L * 4 * (1 - Math.PI / 4);
    zeile('rundung L1 = 2 m: Volumen sinkt um L·(r² − N·r²/2·sin(π/2N)) (N Sehnen) | Abweichung zum echten Kreis', `${dSoll.toFixed(4)} ±1e-6 | ≤ 5 %`, `${dV.toFixed(6)} (N = ${N}) | ${(100 * (dV / dKreis - 1)).toFixed(1)} %`, N >= 4 && Math.abs(dV - dSoll) < 1e-6 * V0 + 1e-6 && Math.abs(dV / dKreis - 1) <= 0.05);
    zeile('rundung L1 = 2 m: mass | Endpunkte + Bogenpunkte auf dem Kreis (Ecke 1 links oben)', '2 | ja', `${r2.mass} | ${rundOk(r2.k, -1, 1, 2) ? 'ja' : 'NEIN'}`, r2.mass === 2 && rundOk(r2.k, -1, 1, 2));
  }
  // Klemmen, Müll, unbekannte id
  const gross = sicher(() => op(fase, Q, ['L0'], 100), (e) => ({ fehler: e.message }));
  zeile('fase 100 m auf 8 × 6: geklemmt (mass ≤ 3) | Umriss ok | Volumen > 0', 'ja', gross.fehler ?? `${gross.mass} | ${pruefe({ koerper: [gross.k], andock: [] }).some((m) => m.code === 'umriss_kreuzt') || unendlich(gross.k) ? 'NEIN' : 'ja'} | ${volumen(gross.k).toFixed(1)}`,
    !gross.fehler && gross.mass > 0 && gross.mass <= 3 + 1e-9 && !pruefe({ koerper: [gross.k], andock: [] }).some((m) => m.code === 'umriss_kreuzt') && !unendlich(gross.k) && volumen(gross.k) > 0);
  const muell = [[fase, ['L0'], NaN], [fase, ['L0'], -1], [rundung, ['L2'], 0], [fase, ['X9'], 1], [rundung, [], 1], [fase, null, 1]].map(([fn, i, m]) => sicher(() => { const r = op(fn, Q, i, m); return Math.abs(volumen(r.k) - V0) < 1e-9 && !unendlich(r.k) ? '' : `${fn.name}(${J(i)}, ${m}) ändert`; }, (e) => `${fn.name}(${J(i)}, ${m}) wirft ${e.message}`)).filter(Boolean);
  zeile('Müll (NaN, −1, 0, unbekannte id, leere/fehlende Liste) → keine Änderung, wirft nicht', '0', muell.join('; ') || '0', muell.length === 0);
  const ecMuell = normalisiere({ koerper: [{ ...kopie(Q), spanten: Q.spanten.map((s) => ({ ...s, ecken: [{ f: NaN }, { r: -1 }, 'x', { f: 1e9 }] })) }], andock: [] });
  const ecOk = !unendlich(ecMuell.koerper[0].spanten.map((s) => profilPunkte(s))) && J(normalisiere(ecMuell)) === J(ecMuell) && !pruefe(ecMuell).some((m) => m.code === 'umriss_kreuzt');
  zeile('normalisiere: ecken-Müll ({f: NaN}, {r: −1}, "x", {f: 1e9}) → endlich, idempotent, Umriss ok', 'ja', ecOk ? 'ja' : 'NEIN', ecOk);
  // Kappe
  const kp = sicher(() => op(fase, Q, ['K0o'], 1), (e) => ({ fehler: e.message }));
  if (kp.fehler) zeile('fase(Quader, [K0o], 1)', 'wirft nicht', kp.fehler, false);
  else {
    const dV = V0 - volumen(kp.k), hz = (k) => { const q = huelle(k); return [q.min[2], q.max[2]]; };
    const luecke = kp.k.spanten.every((s, i, a) => i === 0 || s.z - a[i - 1].z >= 0.05);
    zeile('fase K0o = 1 m (Kappe Ende 0, oben): Volumen − ≈ b·a²/2 | Länge gleich | kf behalten | Spantabstand ≥ 0,05', `${(B * 0.5).toFixed(2)} ±3 % | ja | ja | ja`,
      `${dV.toFixed(3)} | ${J(hz(kp.k)) === J(hz(Q)) ? 'ja' : 'NEIN'} | ${/"kf"/.test(J(kp.k)) ? 'ja' : 'NEIN'} | ${luecke ? 'ja' : 'NEIN'}`,
      Math.abs(dV / (B * 0.5) - 1) < 0.03 && J(hz(kp.k)) === J(hz(Q)) && /"kf"/.test(J(kp.k)) && luecke);
    zeile('Kappe: pruefe ohne Fehler', '0', pruefe({ koerper: [kp.k], andock: [] }).filter((m) => m.stufe === 'fehler').map((m) => m.code).join(',') || '0', !pruefe({ koerper: [kp.k], andock: [] }).some((m) => m.stufe === 'fehler'));
  }
  const Q24 = quader(Array.from({ length: GRENZEN.spanten }, (_, i) => ({ z: -L / 2 + (i * L) / (GRENZEN.spanten - 1), b: B, h: H })));
  const k24 = sicher(() => op(fase, Q24, ['K0o', 'K1u'], 1), (e) => ({ fehler: e.message }));
  zeile(`Kappe an Körper mit ${GRENZEN.spanten} Spanten: wirft nicht, ≤ ${GRENZEN.spanten} Spanten, Länge gleich, Volumen nicht größer`, 'ja', k24.fehler ?? `${k24.k.spanten.length} Spanten, Δz ${(huelle(k24.k).max[2] - huelle(k24.k).min[2] - L).toFixed(3)}`,
    !k24.fehler && k24.k.spanten.length <= GRENZEN.spanten && Math.abs(huelle(k24.k).max[2] - huelle(k24.k).min[2] - L) < 1e-9 && volumen(k24.k) <= volumen(Q24) + 1e-9);
  // Eigener Umriss (P<j>)
  const fuenf = [[0.5, 0], [0.155, 0.476], [-0.405, 0.294], [-0.405, -0.294], [0.155, -0.476]];
  const PU = quader([{ z: -L / 2, b: B, h: H, p: fuenf }, { z: L / 2, b: B, h: H, p: fuenf }]);
  const pIds = sicher(() => ids(PU), () => []);
  const pu = sicher(() => op(fase, PU, ['P1'], 0.5), (e) => ({ fehler: e.message }));
  const puOk = !pu.fehler && pu.k.spanten.every((s) => s.p && s.p.length === pu.k.spanten[0].p.length) && volumen(pu.k) < volumen(PU) - 1e-6 && !pruefe({ koerper: [pu.k], andock: [] }).some((m) => m.code === 'umriss_kreuzt');
  zeile('Eigener Umriss (Fünfeck): ids P0–P4, keine K* | fase P1: alle Spanten gleiche Punktzahl, Volumen sinkt, Umriss ok', 'ja | ja',
    `${['P0', 'P1', 'P2', 'P3', 'P4'].every((i) => pIds.includes(i)) && !pIds.some((i) => i.startsWith('K')) ? 'ja' : J(pIds)} | ${pu.fehler ?? (puOk ? 'ja' : 'NEIN')}`,
    ['P0', 'P1', 'P2', 'P3', 'P4'].every((i) => pIds.includes(i)) && !pIds.some((i) => i.startsWith('K')) && puOk);
  // Spiegelkörper
  const SP = quader(undefined, { pos: [10, 0, 0], spiegel: ['x'] });
  const sp = sicher(() => op(fase, SP, ['L0', 'L3'], 1), (e) => ({ fehler: e.message }));
  if (!sp.fehler) {
    const form = normalisiere({ art: 'rumpf', koerper: [sp.k] }), [o, c] = koerperListe(form).map(({ k, lage }) => huelle(k, lage));
    const spOk = Math.abs(c.min[0] + o.max[0]) < 1e-9 && Math.abs(c.max[0] + o.min[0]) < 1e-9 && Math.abs(massenwerte(form).schwerpunkt[0]) < 1e-9 && !pruefe(form).some((m) => m.code === 'umriss_kreuzt');
    zeile('Spiegelkörper (x = 10, Spiegel x) mit Fase: Kopie spiegelbildlich, Schwerpunkt x = 0, Umriss ok', 'ja', spOk ? 'ja' : `${o.min[0]}…${o.max[0]} / ${c.min[0]}…${c.max[0]}`, spOk);
  } else zeile('Spiegelkörper mit Fase', 'wirft nicht', sp.fehler, false);
  // kanteFlaechen: entfällt (Protokoll R21, Entscheidung 2 — 4b löst bedienung.js über Kantengriffe in gerader Ansicht).
  // Nur prüfen, falls es später doch exportiert wird.
  if (typeof kanteFlaechen === 'function') {
    const kf = sicher(() => kanteFlaechen(Q, 'L0'), (e) => e);
    zeile('kanteFlaechen(Quader, L0) → zwei verschiedene Flächen', '2', Array.isArray(kf) ? `${kf.length}${kf.length === 2 && J(kf[0]) === J(kf[1]) ? ' (gleich!)' : ''}` : 'wirft ' + kf?.message, Array.isArray(kf) && kf.length === 2 && J(kf[0]) !== J(kf[1]));
  }
  // Generator-Formen: Fase am Hauptrumpf bringt keine neuen Fehler
  const neueFehler = [];
  for (const k of ['korvette', 'fregatte', 'traeger']) for (const seed of [4711, 815]) {
    const f = generiere({ ...standardEinstellung(k), seed }), vor = new Set(pruefeSchiff(f).meldungen.filter((m) => m.stufe === 'fehler').map((m) => m.code));
    const hi = f.koerper.reduce((a, x, i) => (x.op === 'plus' && x.spanten.length > f.koerper[a].spanten.length ? i : a), 0);
    const g = kopie(f); const r = sicher(() => fase(g.koerper[hi], ['L0', 'L1', 'L2', 'L3'], 0.3), (e) => ({ fehler: e.message }));
    if (r.fehler) { neueFehler.push(`${k} ${seed}: wirft`); continue; }
    g.koerper[hi] = r.koerper;
    const nach = pruefeSchiff(g).meldungen.filter((m) => m.stufe === 'fehler' && !vor.has(m.code)).map((m) => m.code);
    if (nach.length) neueFehler.push(`${k} ${seed}: ${nach.join(',')}`);
  }
  zeile('Generator-Formen: Fase 0,3 m an allen Längskanten des Hauptrumpfs → keine neuen Fehler (pruefeSchiff)', '0 / 6', neueFehler.join('; ') || '0', neueFehler.length === 0);
  // Laufzeit
  const zt = []; for (let i = 0; i < 40; i++) { const t0 = performance.now(); fase(Q24, ['L0', 'L1', 'K0o'], 0.5 + i * 0.01); zt.push(performance.now() - t0); }
  zt.sort((a, b) => a - b);
  zeile('Laufzeit fase (24 Spanten, 3 Kanten): Median', '≤ 5 ms', `${zt[20].toFixed(2)} ms`, zt[20] <= 5, false);
}

const dauer = (performance.now() - START) / 1000;
zeile('Dauer der ganzen Datei', '≤ 15 s', `${dauer.toFixed(1)} s`, dauer <= 15, false);
console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

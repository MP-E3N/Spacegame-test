// ZWECK: Verschweißen einer Form (Runde 16): alle Plus-Körper vereinigen, alle Minus-Körper abziehen (three-bvh-csg),
//        Knick-Normalen, Box-UVs → je Material EINE Geometrie in Form-Koordinaten.
// LIEFERT: formGeometrie(form, { schweissen = true, zugabe = true, pruefen = true }) → { <mat>: BufferGeometry } mit
//          nicht aufzählbarem Feld .info = { ms, msCsg, msPruefen, dreiecke, csg, gruppen, offeneKanten, offeneLaenge,
//          flaechenschluss } · offeneKanten(geos) · MATERIALIEN
// REGEL (F6–F8): läuft ohne document.
//   - Schweißzugabe ε = 1–3 mm je Körper (0,25-mm-Stufen nach Listenplatz). Befund R16: three-bvh-csg schließt bündige
//     Flächen auch ohne Zugabe dicht; OHNE Zugabe aber (a) Splitter-Flut bei deckungsgleichen Flächen (×7 Dreiecke) und
//     (b) Risse bei vielen überlappenden Platten (Prüfform 30: 34 offene Kanten). Mit Zugabe: 0.
//   - Ablauf: Plus-Körper in Gruppen (Hüllen berühren sich), je Gruppe in Sätze ohne gegenseitige Berührung → ein Satz =
//     EIN Brush (mehrere Schalen) → Sätze paarweise vereinigen → Minus-Sätze abziehen. WARUM: 30 Körper = 3 CSG-Schritte
//     statt 39 (≈ 90 ms statt ≈ 430 ms). Einzelne Körper ohne Berührung gehen gar nicht durchs CSG.
//   - Schnittflächen eines Minus-Körpers tragen dessen Material. schweissen: false → nur zusammenfügen (schnell,
//     Vorschau beim Ziehen; Minus-Körper fehlen dann). pruefen: false spart die Kantenprüfung (≈ 10–60 ms).
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
// WARUM Quellpfad statt Paketname: das Paket hat kein "exports"; Node nähme sonst den UMD-Build (require('three') →
// zweite three-Kopie neben der ESM-three). Vite nimmt ohnehin "module" = genau diese Datei.
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg/src/index.js';
import { normalisiere, koerperListe, huelle } from '../../sim/form/form.js';
import { koerperNetz, KNICK } from './koerper.js';
import { boxUv } from '../schiff/bauteile.js';

export const MATERIALIEN = ['rumpf', 'dunkel', 'metall', 'duese', 'schacht', 'warn'];
// Platzhalter je Material: die CSG trägt sie als Gruppen durch, danach finden wir den Eimer über die Identität
const PLATZ = Object.fromEntries(MATERIALIEN.map((n) => [n, new THREE.MeshBasicMaterial({ name: n })]));
const NAME = new Map(MATERIALIEN.map((n) => [PLATZ[n], n]));

// 1 … 3 mm in 0,25-mm-Stufen nach Listenplatz — WARUM je Körper verschieden: zwei gleich hohe Deckflächen mit gleicher
// Zugabe lägen wieder genau aufeinander (Splitter-Flut, gemessen R16); neun Nachbarn in Folge sind immer verschieden.
// Runde 20: eine Spiegelkopie, die ihr Original nicht berührt, bekommt dessen Zugabe (formGeometrie) — WARUM: bekamen
// Original und Kopie verschiedene Zugaben,
// lagen ihre Stirnflächen 0,25 mm auseinander; die CSG schnitt das Deck darunter an beiden Linien und ließ 0,25 mm
// breite Splitter stehen (offene Kanten, Generator-Träger 279: Kasten-Paar auf dem Deck).
const zugabeVon = (i) => 0.001 + 0.00025 * (i % 9);

let evaluator = null;
function ev() {
  if (evaluator) return evaluator;
  evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal']; // WARUM: alle Brushes brauchen dieselben Attribute; UVs kommen danach
  evaluator.useGroups = true;
  return evaluator;
}

const ueber = (a, b, e = 0) => [0, 1, 2].every((i) => a.min[i] - e < b.max[i] && b.min[i] - e < a.max[i]);
const vereine = (a, b) => ({ min: a.min.map((v, i) => Math.min(v, b.min[i])), max: a.max.map((v, i) => Math.max(v, b.max[i])) });

function brush(geo, mat) {
  const b = new Brush(geo, PLATZ[mat]);
  b.updateMatrixWorld();
  return b;
}

/** Körper in Sätze teilen, in denen sich keine zwei Hüllen berühren (gierig, große zuerst). */
function saetze(liste) {
  const groesse = (x) => (x.h.max[0] - x.h.min[0]) * (x.h.max[1] - x.h.min[1]) * (x.h.max[2] - x.h.min[2]);
  const aus = [];
  for (const x of [...liste].sort((a, b) => groesse(b) - groesse(a))) {
    let s = aus.find((q) => !q.some((y) => ueber(x.h, y.h, 0.01)));
    if (!s) aus.push(s = []);
    s.push(x);
  }
  return aus;
}
/** Satz → ein Brush (Geometrie-Gruppen je Körper, Material je Gruppe). faktor: Vielfaches der Zugabe (Minus: 2). */
function satzBrush(satz, faktor) {
  const geos = satz.map((x) => koerperNetz(x.k, x.lage, { zugabe: x.e * faktor }));
  if (geos.length === 1) return brush(geos[0], satz[0].k.mat);
  const b = new Brush(mergeGeometries(geos, true), satz.map((x) => PLATZ[x.k.mat]));
  for (const g of geos) g.dispose();
  b.updateMatrixWorld();
  return b;
}

/** CSG-Ergebnis → { mat: [nicht indizierte Geometrie] } (Gruppen und drawRange aufgelöst). */
function zerlege(b, eimer) {
  const g = b.geometry, idx = g.index.array, pos = g.attributes.position.array, mats = Array.isArray(b.material) ? b.material : [b.material];
  const gruppen = g.groups.length ? g.groups : [{ start: 0, count: g.drawRange.count === Infinity ? idx.length : g.drawRange.count, materialIndex: 0 }];
  for (const gr of gruppen) {
    const name = NAME.get(mats[gr.materialIndex]) ?? 'rumpf', p = new Float32Array(gr.count * 3);
    for (let i = 0; i < gr.count; i++) { const v = idx[gr.start + i] * 3; p[i * 3] = pos[v]; p[i * 3 + 1] = pos[v + 1]; p[i * 3 + 2] = pos[v + 2]; }
    const neu = new THREE.BufferGeometry(); neu.setAttribute('position', new THREE.BufferAttribute(p, 3));
    (eimer[name] ??= []).push(neu);
  }
}
/** Rohes Körpernetz → nicht indiziert, nur Position. */
function roh(g) { const n = g.toNonIndexed(); n.deleteAttribute('normal'); return n; }

/**
 * Form → je Material eine Geometrie (position, normal, uv) in Form-Koordinaten.
 * zugabe: false nur für Gegenproben (Messung), sonst immer an. pruefen: offene Kanten zählen (für die Anzeige).
 */
export function formGeometrie(roheForm, { schweissen = true, zugabe = true, pruefen = true } = {}) {
  const t0 = performance.now();
  const form = normalisiere(roheForm);
  form.koerper = form.koerper.filter((k) => k.spanten.length >= 2);
  const liste = koerperListe(form).map(({ k, lage }, i) => ({ k, lage, h: huelle(k, lage), e: zugabe ? zugabeVon(i) : 0 }));
  // Spiegelkopie, die ihr Original nicht berührt → Zugabe des Originals (Runde 20, siehe zugabeVon). WARUM nur dann:
  // berühren sie sich (Körper an der Spiegelebene), bräuchten sie wieder verschiedene Zugaben (Prüfform 30, R16)
  const erstes = new Map();
  for (const x of liste) {
    const o = erstes.get(x.k);
    if (!o) erstes.set(x.k, x);
    else if (!ueber(x.h, o.h, 0.01)) x.e = o.e;
  }
  const plus = liste.filter((x) => x.k.op === 'plus'), minus = schweissen ? liste.filter((x) => x.k.op === 'minus') : [];
  const eimer = {};
  let csg = 0, gruppenZahl = 0;

  if (!schweissen) {
    for (const x of plus) (eimer[x.k.mat] ??= []).push(roh(koerperNetz(x.k, x.lage)));
  } else {
    // Gruppen: Plus-Körper, deren Hüllen sich (mit Zugabe) berühren — Vereinigungs-Suche
    const eltern = plus.map((_, i) => i), wurzel = (i) => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
    for (let i = 0; i < plus.length; i++) for (let j = i + 1; j < plus.length; j++) if (ueber(plus[i].h, plus[j].h, 0.01)) eltern[wurzel(i)] = wurzel(j);
    const gruppen = new Map();
    plus.forEach((x, i) => { const w = wurzel(i); if (!gruppen.has(w)) gruppen.set(w, []); gruppen.get(w).push(x); });
    gruppenZahl = gruppen.size;
    for (const glieder of gruppen.values()) {
      const treffer = minus.filter((m) => glieder.some((p) => ueber(m.h, p.h)));
      if (glieder.length === 1 && !treffer.length) { // nichts zu schweißen: Körper unverändert übernehmen
        const x = glieder[0]; (eimer[x.k.mat] ??= []).push(roh(koerperNetz(x.k, x.lage))); continue;
      }
      // WARUM Sätze: Körper, die sich gegenseitig nicht berühren, kommen als EIN Brush (mehrere geschlossene Schalen)
      // in die CSG — statt 30 Vereinigungen nur so viele, wie Sätze nötig sind (meist 2–4). Paarweise im Baum.
      let stufe = saetze(glieder).map((s) => ({ b: satzBrush(s, 1), h: s.map((x) => x.h).reduce(vereine) }));
      while (stufe.length > 1) {
        const naechste = [];
        for (let i = 0; i < stufe.length; i += 2) {
          if (i + 1 === stufe.length) { naechste.push(stufe[i]); continue; }
          const a = stufe[i], b = stufe[i + 1];
          naechste.push({ b: ev().evaluate(a.b, b.b, ADDITION), h: vereine(a.h, b.h) }); csg++;
        }
        stufe = naechste;
      }
      let erg = stufe[0].b;
      // Minus ebenso in Sätzen: der abgezogene Brush muss selbst überschneidungsfrei sein (README three-bvh-csg)
      for (const s of saetze(treffer)) { erg = ev().evaluate(erg, satzBrush(s, 2), SUBTRACTION); csg++; }
      zerlege(erg, eimer);
    }
  }

  const tCsg = performance.now() - t0;
  const geos = {};
  let dreiecke = 0;
  for (const name of MATERIALIEN) {
    const l = eimer[name]; if (!l?.length) continue;
    const g = boxUv(toCreasedNormals(mergeGeometries(l), KNICK));
    for (const x of l) x.dispose();
    geos[name] = g; dreiecke += g.attributes.position.count / 3;
  }
  const info = { ms: performance.now() - t0, msCsg: tCsg, dreiecke, csg, gruppen: gruppenZahl };
  if (pruefen) {
    const t1 = performance.now(), ok = offeneKanten(geos);
    Object.assign(info, { offeneKanten: ok.kanten, offeneLaenge: ok.laenge, flaechenschluss: ok.flaeche, msPruefen: performance.now() - t1 });
  }
  // WARUM nicht aufzählbar: Object.entries(geos) liefert so nur die Materialien (für registriereForm/schiffNetz)
  Object.defineProperty(geos, 'info', { value: info, enumerable: false });
  return geos;
}

/**
 * Offene Kanten über alle Materialien. Punkte auf 0,05 mm zusammengelegt; jede gerichtete Kante a→b braucht ein
 * Gegenstück b→a. WARUM der zweite Durchgang: die CSG lässt T-Stöße stehen (eine lange Kante liegt an zwei kurzen) —
 * das Netz ist trotzdem dicht. Ungepaarte Kanten werden darum an allen Punkten geteilt, die auf ihnen liegen
 * (≤ 0,2 mm), und die Stücke neu gepaart. Ergebnis: { kanten: offene Stücke, laenge: m, flaeche: |Σ n·A| / Σ A }
 * (flaeche ≈ 0 ⇔ Hülle geschlossen, unabhängig von der Zerlegung).
 */
export function offeneKanten(geos) {
  const ids = new Map(), P = [], id = (x, y, z) => {
    const s = Math.round(x * 2e4) + ',' + Math.round(y * 2e4) + ',' + Math.round(z * 2e4);
    let i = ids.get(s); if (i === undefined) { i = P.length; ids.set(s, i); P.push([x, y, z]); } return i;
  };
  const zahl = new Map(), add = (a, b, d) => { const s = a + '>' + b; zahl.set(s, (zahl.get(s) ?? 0) + d); };
  let nx = 0, ny = 0, nz = 0, summe = 0;
  for (const g of Object.values(geos)) {
    const p = g.attributes.position.array;
    for (let t = 0; t < p.length; t += 9) {
      const v = [id(p[t], p[t + 1], p[t + 2]), id(p[t + 3], p[t + 4], p[t + 5]), id(p[t + 6], p[t + 7], p[t + 8])];
      const e1 = [p[t + 3] - p[t], p[t + 4] - p[t + 1], p[t + 5] - p[t + 2]], e2 = [p[t + 6] - p[t], p[t + 7] - p[t + 1], p[t + 8] - p[t + 2]];
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      nx += c[0]; ny += c[1]; nz += c[2]; summe += Math.hypot(...c);
      if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue; // entartet
      for (let k = 0; k < 3; k++) add(v[k], v[(k + 1) % 3], 1);
    }
  }
  // gegenläufige Kanten heben sich auf
  const offen = () => {
    const l = [];
    for (const [s, n] of zahl) {
      if (n <= 0) continue;
      const [a, b] = s.split('>').map(Number), r = zahl.get(b + '>' + a) ?? 0;
      const rest = n - Math.max(0, r); if (rest > 0) l.push([a, b, rest]);
    }
    return l;
  };
  for (let runde = 0; runde < 6; runde++) { // WARUM mehrfach: überlappende Teilstücke beider Seiten teilen sich gegenseitig
    const l = offen(); if (!l.length) break;
    // Kandidaten nach x sortiert → je Kante nur der x-Bereich der Kante (binäre Suche); WARUM: sonst O(Kanten × Punkte)
    const kandidaten = [...new Set(l.flatMap(([a, b]) => [a, b]))].sort((u, v) => P[u][0] - P[v][0]);
    const kx = kandidaten.map((c) => P[c][0]);
    const ab = (x) => { let lo = 0, hi = kx.length; while (lo < hi) { const m = (lo + hi) >> 1; if (kx[m] < x) lo = m + 1; else hi = m; } return lo; };
    for (const [a, b, n] of l) {
      const A = P[a], B = P[b], d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const auf = [], y0 = Math.min(A[1], B[1]) - 2e-4, y1 = Math.max(A[1], B[1]) + 2e-4, z0 = Math.min(A[2], B[2]) - 2e-4, z1 = Math.max(A[2], B[2]) + 2e-4;
      for (let i = ab(Math.min(A[0], B[0]) - 2e-4), x1 = Math.max(A[0], B[0]) + 2e-4; i < kx.length && kx[i] <= x1; i++) {
        const c = kandidaten[i];
        if (c === a || c === b || P[c][1] < y0 || P[c][1] > y1 || P[c][2] < z0 || P[c][2] > z1) continue;
        const C = P[c], t = ((C[0] - A[0]) * d[0] + (C[1] - A[1]) * d[1] + (C[2] - A[2]) * d[2]) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const q = [A[0] + d[0] * t - C[0], A[1] + d[1] * t - C[1], A[2] + d[2] * t - C[2]];
        if (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] < 4e-8) auf.push([t, c]);
      }
      if (!auf.length) continue;
      auf.sort((x, y) => x[0] - y[0]);
      add(a, b, -n);
      let vor = a; for (const [, c] of auf) { add(vor, c, n); vor = c; } add(vor, b, n);
    }
  }
  let kanten = 0, laenge = 0;
  for (const [a, b, n] of offen()) { kanten += n; laenge += n * Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]); }
  return { kanten, laenge, flaeche: summe ? Math.hypot(nx, ny, nz) / summe : 0 };
}

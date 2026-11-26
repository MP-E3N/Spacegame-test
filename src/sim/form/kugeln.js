// ZWECK: Kollisionskugeln eines selbst gebauten Schiffs (Runde 19, Entscheidung 10) und ein Innen-Test für Formen.
//        Reine Rechnung: ohne three, ohne DOM, ohne Zufall.
// LIEFERT: formKugeln(form) → [{ x, y, z, r }] (Form-Koordinaten; formZuSchiff verschiebt sie um den Versatz)
//          · punktInForm(form, p) → true/false (in einem Plus- und in keinem Minus-Körper) · tiefeLaengs(form, p, n, max)
// REGEL: Die Hülle aller Plus-Körper (mit Spiegelkopien) wird in Zellen geteilt: Kantenlänge t entlang der längsten
//        Achse, bei breiten Formen auch entlang der zweiten. Je belegter Zelle EINE Kugel um die Oberflächenpunkte der
//        Zelle (Mitte = Mitte ihrer Punkte, Radius = weitester Punkt). WARUM Zellen statt einer Kugel je Körper: ein
//        255-m-Rumpf bekäme sonst eine Kugel mit ~130 m Radius — Felsen prallten im Leeren ab (Frühwarnung R19).
//        Oberflächenpunkte: Profilpunkte jedes Spants, Kanten und Abschnitte so unterteilt, dass kein Abstand > t/2 ist —
//        jede Zelle deckt damit ihre Hülle ganz (Deckung wie tests/schiffe.mjs). Minus-Körper zählen nicht (lieber zu groß).
//        Höchstens MAX_KUGELN Kugeln (sonst wird t vergrößert).
import { normalisiere, koerperListe, profilPunkte, wendeK } from './form.js';

export const MAX_KUGELN = 48;
const T_MIN = 2; // m — kleinste Zelle (WARUM: kleiner bringt der Kollision nichts, kostet aber Kugeln)

const r2 = (v) => Math.round(v * 100) / 100 + 0;

/** Oberflächenpunkte eines Körpers (Form-Koordinaten), Abstand ≤ schritt. */
function oberflaeche(k, lage, schritt) {
  const sp = k.spanten, aus = [];
  const ring = (R, z) => {
    for (let j = 0; j < R.length; j++) {
      const a = R[j], b = R[(j + 1) % R.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / schritt));
      for (let i = 0; i < n; i++) aus.push(wendeK(lage, [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, z]));
    }
  };
  for (let i = 0; i < sp.length - 1; i++) {
    const A = profilPunkte(sp[i]), B = profilPunkte(sp[i + 1]), n = Math.max(1, Math.ceil((sp[i + 1].z - sp[i].z) / schritt));
    for (let s = 0; s <= n; s++) {
      if (s === n && i < sp.length - 2) continue; // nächster Abschnitt beginnt hier
      const t = s / n;
      ring(A.map((q, j) => [q[0] + (B[j][0] - q[0]) * t, q[1] + (B[j][1] - q[1]) * t]), sp[i].z + (sp[i + 1].z - sp[i].z) * t);
    }
  }
  // Kappen: Gitter über die Endflächen (sonst bliebe die Mitte einer großen Heckfläche ungedeckt)
  for (const s of [sp[0], sp[sp.length - 1]]) {
    const R = profilPunkte(s), xs = R.map((q) => q[0]), ys = R.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const nx = Math.ceil((x1 - x0) / schritt), ny = Math.ceil((y1 - y0) / schritt);
    for (let a = 1; a < nx; a++) for (let b = 1; b < ny; b++) {
      const q = [x0 + (x1 - x0) * a / nx, y0 + (y1 - y0) * b / ny];
      if (imUmriss(R, q)) aus.push(wendeK(lage, [q[0], q[1], s.z]));
    }
  }
  return aus;
}

/** Kollisionskugeln einer Form (siehe Kopf). */
export function formKugeln(roh) {
  const form = normalisiere(roh);
  const plus = koerperListe(form).filter((x) => x.k.op === 'plus' && x.k.spanten.length >= 2);
  if (!plus.length) return [];
  // Grobe Hülle aus den Spant-Profilen → Achsen nach Länge ordnen
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { k, lage } of plus) for (const s of k.spanten) for (const [x, y] of profilPunkte(s)) {
    const p = wendeK(lage, [x, y, s.z]); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  }
  const d = [0, 1, 2].map((i) => max[i] - min[i]), ach = [0, 1, 2].sort((a, b) => d[b] - d[a]);
  let t = Math.max(T_MIN, d[ach[2]], d[ach[1]] / 2);
  for (let versuch = 0; versuch < 20; versuch++, t *= 1.25) {
    const punkte = plus.flatMap(({ k, lage }) => oberflaeche(k, lage, t / 2));
    // Zellen: längste Achse immer geteilt, zweite nur wenn sie mehr als 1,5 Zellen breit ist
    const nA = Math.max(1, Math.ceil(d[ach[0]] / t)), nB = d[ach[1]] > 1.5 * t ? Math.ceil(d[ach[1]] / t) : 1;
    if (nA * nB > MAX_KUGELN * 1.5) continue; // sicher zu viele
    const zellen = new Map();
    for (const p of punkte) {
      const a = Math.min(nA - 1, Math.floor((p[ach[0]] - min[ach[0]]) / (d[ach[0]] / nA || 1)));
      const b = Math.min(nB - 1, Math.floor((p[ach[1]] - min[ach[1]]) / (d[ach[1]] / nB || 1)));
      const key = a * nB + b; let z = zellen.get(key); if (!z) zellen.set(key, z = []); z.push(p);
    }
    if (zellen.size > MAX_KUGELN) continue;
    const kugeln = [];
    for (const z of [...zellen.keys()].sort((a, b) => a - b).map((key) => zellen.get(key))) {
      const lo = [0, 1, 2].map((i) => Math.min(...z.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...z.map((p) => p[i])));
      const c = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2);
      let r = 0; for (const p of z) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
      kugeln.push({ x: r2(c[0]), y: r2(c[1]), z: r2(c[2]), r: r2(Math.max(0.5, r) + 0.01) }); // + 1 cm: Rundung der Mitte
    }
    return kugeln;
  }
  // Rückfall (kommt praktisch nicht vor): eine Kugel um alles
  const c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  return [{ x: r2(c[0]), y: r2(c[1]), z: r2(c[2]), r: r2(Math.hypot(...d) / 2 + 0.01) }];
}

// ---------------- Innen-Test ----------------
/** Punkt q im Umriss R (gerade/ungerade-Regel — gilt auch für hohle Umrisse wie L oder U). */
function imUmriss(R, q) {
  let drin = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const a = R[i], b = R[j];
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) drin = !drin;
  }
  return drin;
}
/** Punkt p (Form-Koordinaten) im Körper (Loft linear zwischen den Spanten)? */
function imKoerper(k, lage, p) {
  const S = lage.spiegel ?? [1, 1, 1], m = lage.m, q0 = [0, 1, 2].map((i) => S[i] * p[i] - lage.t[i]);
  const q = [0, 1, 2].map((j) => m[0][j] * q0[0] + m[1][j] * q0[1] + m[2][j] * q0[2]); // mᵀ
  const sp = k.spanten; if (sp.length < 2 || q[2] < sp[0].z || q[2] > sp[sp.length - 1].z) return false;
  let i = 0; while (i < sp.length - 2 && q[2] > sp[i + 1].z) i++;
  const t = (q[2] - sp[i].z) / ((sp[i + 1].z - sp[i].z) || 1), A = profilPunkte(sp[i]), B = profilPunkte(sp[i + 1]);
  return imUmriss(A.map((a, j) => [a[0] + (B[j][0] - a[0]) * t, a[1] + (B[j][1] - a[1]) * t]), q);
}
/** In einem Plus- und in keinem Minus-Körper? liste: koerperListe (vorab gerechnet, für viele Abfragen). */
export function punktInForm(roh, p, liste = koerperListe(normalisiere(roh))) {
  let drin = false;
  for (const { k, lage } of liste) if (k.op === 'plus' && imKoerper(k, lage, p)) { drin = true; break; }
  if (!drin) return false;
  for (const { k, lage } of liste) if (k.op === 'minus' && imKoerper(k, lage, p)) return false;
  return true;
}
/**
 * Wie tief reicht das Material von p aus entgegen der Normalen n (nach innen)? Schritte von 0,25 m bis max. WARUM:
 * das Düsengehäuse ragt in den Rumpf — auf einer dünnen Stufe stäche es vorn wieder heraus (Frühwarnung R19).
 */
export function tiefeLaengs(roh, p, n, max = 6) {
  const liste = koerperListe(normalisiere(roh));
  let tiefe = 0;
  for (let s = 0.05; s <= max + 1e-9; s += 0.25) {
    if (!punktInForm(null, [p[0] - n[0] * s, p[1] - n[1] * s, p[2] - n[2] * s], liste)) break;
    tiefe = s;
  }
  return tiefe;
}

// ZWECK: Geschütze als Bauteile der Form-Werkstatt (Runde 19): Katalog, Turm-Datensatz aus einem gesetzten Bauteil
//        (eigene Höhenprobe gegen die Form-Lofts) und Montage-Prüfung. Rein rechnend: ohne three, ohne DOM, ohne Zufall.
// LIEFERT: GESCHUETZE = { pdc, flak, schwer } · turmAusBauteil(eintrag, id, form) → Turm-Datensatz | null
//          · pruefeGeschuetze(form) → [{ code, stufe, text, bauteil }]
//          · formHoehenfeld(form, versatz) → Höhenfeld für die Rumpf-Sperre (R21, Kopf der Funktion) | null
// REGEL (Protokoll R19, Entscheidungen 2 + 3):
//   - Katalogeintrag { art: 'geschuetz', name, masse (t), turm: { typ: 'flak' | 'schwer', s, sockel }, gier: [mitte,
//     halbweite] RELATIV im Turm-Rahmen, aussen?, nick: [min, max], flaeche: ['oben', 'unten'] }. aussen: true → die
//     Gier-Mitte zeigt von x = 0 weg (wie die Bollwerk-PDC: mitte · Vorzeichen(x) · (oben ? 1 : −1)).
//   - eintrag = ein Element aus bauteilListe(form) (form.js): { b, p, n, spiegel, kopie }, p/n schon gespiegelt.
//   - Datensatz genau wie schiffe/turm.js turmDaten: { id, x, y, z, oben, typ, s, sockel, schuerze, zapfen, muendungen,
//     gier, nick }. x/z = eintrag.p, y = höchster tragender Ringpunkt unter der Standfläche (Ring 4 × 24 wie
//     fusspunkt()), schuerze = hoch − tief + 0,1. Nur n = ±Y, sonst null (Meldung seitenmontage).
//   - Gier-Mitte der Spiegelkopien (vom Original aus): Spiegel x → −g, Spiegel y → −g (oben ↔ unten, der Turm-Rahmen
//     dreht x mit), Spiegel z → π − g. nick bleibt. Ergebnis auf (−π, π].
//   - Höhenprobe: Strecken einer Geraden durch die Körper (Mantel-Dreiecke + End-Kappen, je Körper in seinen eigenen
//     Koordinaten), Vereinigung der Plus-Körper minus Vereinigung der Minus-Körper. Die Form muss normalisiert sein.
//   - Codes: seitenmontage, im_rumpf, zu_dicht, auf_spiegelebene (fehler); schraeg, ueber_kante, rohre_kreuzen,
//     kein_schussfeld (warnung). Je Bauteil und Code höchstens eine Meldung (Spiegelkopien zählen zum Original).
import { koerperListe, huelle, profilPunkte, bauteilListe, ACHSEN } from './form.js';
import { TURM } from '../schiffe/turm.js';

const PI = Math.PI, VOLL = [0, PI];
export const GESCHUETZE = {
  // WARUM diese Werte: genau die Türme der Bollwerk-ROH-Liste (dort im Gefecht erprobt) — PDC = Zwillings-PDC der
  // Außenkanten (s 0,7, Sockel 1, Mitte nach außen), Flak = Bauch-Flak z −10 (s 1,1), schwer = Heckturm z −92 (s 1,3).
  pdc: { art: 'geschuetz', name: 'PDC (Zwillings-Gatling)', masse: 12, turm: { typ: 'flak', s: 0.7, sockel: 1 },
    gier: [PI / 2, 1.8], aussen: true, nick: [-0.25, PI / 2], flaeche: ['oben', 'unten'] },
  flak: { art: 'geschuetz', name: 'Flak-Gatling', masse: 35, turm: { typ: 'flak', s: 1.1, sockel: 0 },
    gier: VOLL, nick: [-0.05, 1.45], flaeche: ['oben', 'unten'] },
  schwer: { art: 'geschuetz', name: 'Hauptbatterie', masse: 90, turm: { typ: 'schwer', s: 1.3, sockel: 0 },
    gier: VOLL, nick: [-0.1, 0.8], flaeche: ['oben', 'unten'] },
};

// ---------------- Maße eines Turms (aus TURM, wie turmDaten) ----------------
const RINGE = 4, WINKEL = 24;              // Standflächen-Proben wie rumpf.js fusspunkt()
const ANTEIL_MIN = 0.8;                    // unter 80 % tragender Proben → ueber_kante
const SCHRAEG = 0.5;                       // Höhenunterschied > 0,5 · Fußradius → schraeg (≈ 14° Neigung)
const FELD_WEITE = 40, FELD_RICHTUNGEN = 16, FELD_NICK = [0, 0.35], FELD_MIN = 0.25; // Schussfeld-Probe
const W = 3000;                            // halbe Länge der Höhenprobe (Form reicht bis ±1000 m, Körper bis ±400 m dazu)
const EPS = 1e-9;
const reichweite = (s) => Math.hypot(TURM.zapfenZ + TURM.rohrZ + TURM.rohrL / 2, TURM.rohrX) * s; // Kranzachse → Mündung
const kopfHoehe = (s, sockel) => sockel + (TURM.zapfenY + TURM.mantelR) * s;                      // so hoch ragt das Gehäuse
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;                                                    // 0,1 mm, kein −0

// ---------------- Szene: Körper einer Form, vorbereitet für Geradenschnitte ----------------
const szenen = new WeakMap(); // form → Szene (WARUM: formZuSchiff ruft turmAusBauteil je Turm mit derselben Form)

function szene(form) {
  let s = szenen.get(form);
  if (s) return s;
  s = koerperListe(form).map(({ k, lage }) => {
    const sp = k.spanten, ringe = sp.map((x) => profilPunkte(x));
    // WARUM Umlaufsinn messen: normalisiere() dreht eigene Umrisse gegen den Uhrzeigersinn, Vorlagen sind es schon —
    // aber die Außen-Richtung der Mantel-Dreiecke hängt daran, und ein falsches Vorzeichen kehrt innen/außen um.
    let a = 0; const r0 = ringe[0];
    for (let i = 0; i < r0.length; i++) { const q = r0[(i + 1) % r0.length]; a += r0[i][0] * q[1] - q[0] * r0[i][1]; }
    const o = a < 0 ? -1 : 1, dreiecke = [];
    for (let i = 0; i < sp.length - 1; i++) {
      const A = ringe[i], B = ringe[i + 1], n = A.length;
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        const p00 = [A[j][0], A[j][1], sp[i].z], p01 = [A[j1][0], A[j1][1], sp[i].z];
        const p10 = [B[j][0], B[j][1], sp[i + 1].z], p11 = [B[j1][0], B[j1][1], sp[i + 1].z];
        dreiecke.push(dreieck(p00, p01, p10, o), dreieck(p01, p11, p10, o));
      }
    }
    const kappen = [{ z: sp[0].z, poly: ringe[0], nz: -1 }, { z: sp[sp.length - 1].z, poly: ringe[ringe.length - 1], nz: 1 }];
    // WARUM flach in einem Float64Array (je Dreieck a, e1, e2, n = 12 Zahlen): die Höhenprobe testet ~10⁵ Dreiecke je
    // Prüfung; Objekte je Test kosten mehr als die Rechnung selbst (Messung R19: 6 → 2 ms bei 20 Türmen)
    const dr = dreiecke.filter(Boolean), flach = new Float64Array(dr.length * 12);
    dr.forEach((t, i) => flach.set([...t.a, ...t.e1, ...t.e2, ...t.n], i * 12));
    return { k, lage, S: lage.spiegel ?? [1, 1, 1], plus: k.op === 'plus', dreiecke: flach, kappen, h: huelle(k, lage) };
  });
  szenen.set(form, s);
  return s;
}
/** Dreieck a, b, c mit Außennormale o · (b − a) × (c − a) (bei CCW-Umriss und z aufsteigend nach außen). */
function dreieck(a, b, c, o) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [o * (e1[1] * e2[2] - e1[2] * e2[1]), o * (e1[2] * e2[0] - e1[0] * e2[2]), o * (e1[0] * e2[1] - e1[1] * e2[0])];
  if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-12) return null; // entartet (zusammenfallende Punkte)
  return { a, e1, e2, n };
}
/** Punkt in Polygon (gerade/ungerade), 2D. */
function drinnen(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Strecken [t0, t1] einer Geraden o + t·d (Form-Koordinaten, d Einheitsvektor) im Inneren eines Körpers.
 * WARUM Ein/Aus statt Zählen: eine Gerade durch eine Dreieckskante trifft beide Nachbardreiecke (Toleranz) — doppelte
 * Eintritte bzw. Austritte werden übersprungen, die Strecken bleiben richtig.
 */
function strecken(kp, o, d, senk = false) {
  // Gerade in Körper-Koordinaten (wie ziehen.js trefferImKoerper, ohne Zwischenlisten): p = mᵀ·(S·o − t), r = mᵀ·S·d.
  // Orthogonal → t bleibt gleich, Skalarprodukte (innen/außen) auch.
  const m = kp.lage.m, S = kp.S, T = kp.lage.t;
  const qx = S[0] * o[0] - T[0], qy = S[1] * o[1] - T[1], qz = S[2] * o[2] - T[2], sx = S[0] * d[0], sy = S[1] * d[1], sz = S[2] * d[2];
  const ox = m[0][0] * qx + m[1][0] * qy + m[2][0] * qz, oy = m[0][1] * qx + m[1][1] * qy + m[2][1] * qz, oz = m[0][2] * qx + m[1][2] * qy + m[2][2] * qz;
  const rx = m[0][0] * sx + m[1][0] * sy + m[2][0] * sz, ry = m[0][1] * sx + m[1][1] * sy + m[2][1] * sz, rz = m[0][2] * sx + m[1][2] * sy + m[2][2] * sz;
  const hits = [], D = kp.dreiecke;
  // WARUM vorbereiten: alle Höhenproben laufen senkrecht — r × e2, 1/det und die Hülle jedes Dreiecks quer zur Geraden
  // hängen nur von der Richtung ab; einmal je Körper rechnen, dann fallen fast alle Dreiecke am Hüllentest heraus.
  // Schräge Strahlen (Schussfeld) rechnen direkt.
  const V = senk ? (kp.senk ??= vorbereite(D, rx, ry, rz)) : null;
  const c1 = V ? ox * V.basis[0] + oy * V.basis[1] + oz * V.basis[2] : 0, c2 = V ? ox * V.basis[3] + oy * V.basis[4] + oz * V.basis[5] : 0;
  for (let i = 0, k = 0; i < D.length; i += 12, k += 8) { // Möller–Trumbore
    const e1x = D[i + 3], e1y = D[i + 4], e1z = D[i + 5], e2x = D[i + 6], e2y = D[i + 7], e2z = D[i + 8];
    let px, py, pz, inv;
    if (V) {
      inv = V[k + 3]; if (inv === 0) continue; // Gerade parallel zur Fläche
      if (c1 < V[k + 4] || c1 > V[k + 5] || c2 < V[k + 6] || c2 > V[k + 7]) continue; // Gerade läuft am Dreieck vorbei
      px = V[k]; py = V[k + 1]; pz = V[k + 2];
    } else {
      px = ry * e2z - rz * e2y; py = rz * e2x - rx * e2z; pz = rx * e2y - ry * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      inv = 1 / det;
    }
    const tx = ox - D[i], ty = oy - D[i + 1], tz = oz - D[i + 2];
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < -EPS || u > 1 + EPS) continue;
    const ax = ty * e1z - tz * e1y, ay = tz * e1x - tx * e1z, az = tx * e1y - ty * e1x;
    const v = (rx * ax + ry * ay + rz * az) * inv; if (v < -EPS || u + v > 1 + EPS) continue;
    hits.push([(e2x * ax + e2y * ay + e2z * az) * inv, D[i + 9] * rx + D[i + 10] * ry + D[i + 11] * rz < 0]);
  }
  if (Math.abs(rz) > 1e-12) for (const c of kp.kappen) {
    const t = (c.z - oz) / rz;
    if (drinnen(c.poly, ox + rx * t, oy + ry * t)) hits.push([t, c.nz * rz < 0]);
  }
  if (!hits.length) return hits;
  hits.sort((x, y) => x[0] - y[0] || (y[1] - x[1])); // gleiche Stelle: erst Eintritt (Kanten-Doppel bleiben harmlos)
  const aus = []; let drin = false, start = 0, erst = true;
  for (let i = 0; i < hits.length; i++) {
    const t = hits[i][0], ein = hits[i][1];
    if (ein) { if (!drin) { drin = true; start = t; } }
    else if (drin) { aus.push([start, t]); drin = false; }
    else if (erst) aus.push([-Infinity, t]); // Gerade beginnt im Körper
    erst = false;
  }
  if (drin) aus.push([start, Infinity]);
  return aus;
}
/** Je Dreieck r × e2, 1/det (0 = parallel) und Hülle [min, max] in der Ebene quer zu r (Basis V.basis), 1 mm Rand. */
function vorbereite(D, rx, ry, rz) {
  const V = new Float64Array(D.length / 12 * 8);
  const h = Math.abs(rx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let b1 = [h[1] * rz - h[2] * ry, h[2] * rx - h[0] * rz, h[0] * ry - h[1] * rx];
  const l = Math.hypot(...b1); b1 = b1.map((v) => v / l);
  const b2 = [ry * b1[2] - rz * b1[1], rz * b1[0] - rx * b1[2], rx * b1[1] - ry * b1[0]];
  V.basis = [...b1, ...b2];
  for (let i = 0, k = 0; i < D.length; i += 12, k += 8) {
    for (const [b, o] of [[b1, 4], [b2, 6]]) {
      const a = D[i] * b[0] + D[i + 1] * b[1] + D[i + 2] * b[2];
      const u = D[i + 3] * b[0] + D[i + 4] * b[1] + D[i + 5] * b[2], w = D[i + 6] * b[0] + D[i + 7] * b[1] + D[i + 8] * b[2];
      V[k + o] = a + Math.min(0, u, w) - 1e-3; V[k + o + 1] = a + Math.max(0, u, w) + 1e-3;
    }
    const e2x = D[i + 6], e2y = D[i + 7], e2z = D[i + 8];
    const px = ry * e2z - rz * e2y, py = rz * e2x - rx * e2z, pz = rx * e2y - ry * e2x;
    const det = D[i + 3] * px + D[i + 4] * py + D[i + 5] * pz;
    V[k] = px; V[k + 1] = py; V[k + 2] = pz; V[k + 3] = Math.abs(det) < 1e-12 ? 0 : 1 / det;
  }
  return V;
}
/** Vereinigung sortierter Strecken. */
function vereinige(l) {
  l.sort((a, b) => a[0] - b[0]);
  const aus = [];
  for (const s of l) { const z = aus[aus.length - 1]; if (z && s[0] <= z[1]) z[1] = Math.max(z[1], s[1]); else aus.push([...s]); }
  return aus;
}
/** a minus b (beide vereinigt). */
function ohne(a, b) {
  let aus = a;
  for (const [m0, m1] of b) {
    const neu = [];
    for (const [s0, s1] of aus) {
      if (m1 <= s0 || m0 >= s1) { neu.push([s0, s1]); continue; }
      if (m0 > s0) neu.push([s0, m0]);
      if (m1 < s1) neu.push([m1, s1]);
    }
    aus = neu;
  }
  return aus;
}
/** Feste Strecken der ganzen Form entlang o + t·d (nur Körper, deren Hülle der Quader box [min, max] schneidet). */
function festStrecken(sz, o, d, box, senk = false) {
  const plus = [], minus = [];
  for (const kp of sz) {
    const h = kp.h;
    if (box && (h.max[0] < box[0][0] || h.min[0] > box[1][0] || h.max[1] < box[0][1] || h.min[1] > box[1][1]
      || h.max[2] < box[0][2] || h.min[2] > box[1][2])) continue;
    for (const s of strecken(kp, o, d, senk)) (kp.plus ? plus : minus).push(s);
  }
  return ohne(vereinige(plus), vereinige(minus)).filter((s) => s[1] - s[0] > 1e-6);
}

// ---------------- Höhenprobe, Gier, Datensatz ----------------
/**
 * Lage eines Geschützes an (x, z) auf der Ober- (oben) bzw. Unterseite. vRef = Höhe „vom Rumpf weg“ des gesetzten
 * Fußpunkts. → { v (Fuß, vom Rumpf weg), schuerze, anteil (tragende Proben), imRumpf }
 */
function hoehenprobe(sz, x, z, vRef, oben, s, sockel) {
  const r = TURM.fussR * s, tol = 2 * r, kopf = kopfHoehe(s, sockel), sg = oben ? 1 : -1;
  // WARUM vorsortieren: nur Körper, deren Hülle die Standfläche berührt, kommen für die 97 Proben in Frage
  const nah = sz.filter((kp) => !(kp.h.max[0] < x - r || kp.h.min[0] > x + r || kp.h.max[2] < z - r || kp.h.min[2] > z + r));
  const linie = (px, pz) => festStrecken(nah, [px, -W, pz], [0, 1, 0], [[px, -Infinity, pz], [px, Infinity, pz]], true)
    .map(([a, b]) => (oben ? [a - W, b - W] : [W - b, W - a])); // → Strecken in v = sg · y
  const proben = [];
  for (let k = 0; k <= RINGE; k++) {
    const rr = r * k / RINGE, n = k ? WINKEL : 1;
    for (let j = 0; j < n; j++) { const w = j / n * PI * 2; proben.push(linie(x + Math.cos(w) * rr, z + Math.sin(w) * rr)); }
  }
  // WARUM die Mitte am gesetzten Punkt ausrichten: ein Körper über dem Fuß (Überhang, Mast) darf den Turm nicht nach
  // oben ziehen — er soll als „im Rumpf“ gemeldet werden. Die Fläche, die der Nutzer angeklickt hat, ist die nächste.
  let vc = vRef, best = Infinity;
  for (const [, b] of proben[0]) if (Number.isFinite(b) && Math.abs(b - vRef) < best) { best = Math.abs(b - vRef); vc = b; }
  let hoch = -Infinity, tief = Infinity, tragend = 0;
  for (const l of proben) {
    // tragend = Strecke, die von unten bis zur Fußhöhe reicht (eine schwebende Platte darüber trägt nicht) und deren
    // Oberkante höchstens eine 45°-Neigung über der Mitte liegt (höher = Wand → im_rumpf)
    let top = -Infinity;
    for (const [a, b] of l) if (a <= vc + 0.01 && b <= vc + tol && b > top) top = b;
    if (top < vc - tol) continue; // nichts in Reichweite darunter (Kante, Stufe weit hinab)
    tragend++; if (top > hoch) hoch = top; if (top < tief) tief = top;
  }
  if (!tragend) hoch = tief = vc;
  let imRumpf = false;
  for (const l of proben) for (const [a, b] of l) if (b > hoch + 0.05 && a < hoch + kopf) imRumpf = true;
  return { v: hoch, y: r4(sg * hoch), schuerze: r4(hoch - tief + 0.1), anteil: tragend / proben.length, imRumpf };
}
const umbruch = (g) => { const w = g - 2 * PI * Math.ceil((g - PI) / (2 * PI)); return w + 0; }; // → (−π, π]

/** Gier-Mitte im Turm-Rahmen der (gespiegelten) Kopie. */
function gierMitte(kat, eintrag) {
  let g = kat.gier[0];
  if (kat.aussen) g *= (eintrag.b.p[0] >= 0 ? 1 : -1) * (eintrag.b.n[1] > 0 ? 1 : -1); // vom Original aus
  const s = eintrag.spiegel;
  if (s) { if (s[0] < 0) g = -g; if (s[1] < 0) g = -g; if (s[2] < 0) g = PI - g; }
  return umbruch(g);
}

/** Datensatz + Prüfwerte (intern, auch für pruefeGeschuetze). */
function geschuetzLage(eintrag, id, form, sz) {
  const kat = GESCHUETZE[eintrag.b.typ];
  if (!kat || Math.abs(eintrag.n[1]) !== 1) return null;
  const oben = eintrag.n[1] > 0, { s, sockel, typ } = kat.turm, [x, py, z] = eintrag.p;
  const f = hoehenprobe(sz, x, z, oben ? py : -py, oben, s, sockel);
  const mz = (TURM.rohrZ + TURM.rohrL / 2) * s;
  const turm = {
    id, x, y: f.y, z, oben, typ, s, sockel, schuerze: f.schuerze,
    zapfen: { y: sockel + TURM.zapfenY * s, z: TURM.zapfenZ * s },
    muendungen: [{ x: TURM.rohrX * s, y: 0, z: mz }, { x: -TURM.rohrX * s, y: 0, z: mz }],
    gier: [gierMitte(kat, eintrag), kat.gier[1]], nick: [...kat.nick],
  };
  return { turm, f, kat, eintrag };
}

/** Turm-Datensatz (wie turmDaten) eines Geschütz-Eintrags aus bauteilListe(form); null bei Seitenmontage/kein Geschütz. */
export function turmAusBauteil(eintrag, id, form) {
  return geschuetzLage(eintrag, id, form, szene(form))?.turm ?? null;
}

/** Anteil freier Richtungen: Strahlen vom Zapfen, je Gier im erlaubten Bereich, bei zwei Nick-Stufen (eine frei reicht). */
function schussfeld(sz, t) {
  const sg = t.oben ? 1 : -1, [m, h] = t.gier, voll = h >= PI;
  let frei = 0;
  for (let i = 0; i < FELD_RICHTUNGEN; i++) {
    const g = voll ? -PI + i * 2 * PI / FELD_RICHTUNGEN : m - h + (2 * h) * i / (FELD_RICHTUNGEN - 1);
    const sgn = Math.sin(g), cg = Math.cos(g);
    // Zapfen in Schiffs-Koordinaten (unten: Turm-x → Schiff −x, Turm-y → Schiff −y)
    const o = [t.x + sg * sgn * t.zapfen.z, t.y + sg * t.zapfen.y, t.z + cg * t.zapfen.z];
    const ok = FELD_NICK.some((e) => {
      const d = [sg * sgn * Math.cos(e), sg * Math.sin(e), cg * Math.cos(e)];
      const q = o.map((v, k) => v + d[k] * FELD_WEITE);
      const box = [o.map((v, k) => Math.min(v, q[k])), o.map((v, k) => Math.max(v, q[k]))];
      return !festStrecken(sz, o, d, box).some(([a, b]) => b > 1e-3 && a < FELD_WEITE);
    });
    if (ok) frei++;
  }
  return frei / FELD_RICHTUNGEN;
}

const m1 = (v) => v.toFixed(1).replace('.', ',');
const pz = (v) => Math.round(v * 100);

// ---------------- Höhenfeld für die Rumpf-Sperre (R21: Form im Gefecht) ----------------
export const HOEHENFELD = {
  zelleMin: 0.5,     // m — Probenabstand (WARUM 0,5: Masten/Antennen der Formen sind ≥ 0,5 m dick, Rohre 0,2–0,4 m)
  probenMax: 60000,  // senkrechte Proben höchstens (sonst wächst die Zelle) — hält den Aufbau < 0,5 s auch bei 1000 m
  rand: 0.5,         // m — Aufblasen wie sperre.js RAND (Rohrdicke), senkrecht und waagrecht
};
const hoehenfelder = new WeakMap(); // form → Map(versatz → Feld)

/**
 * Höhenfeld einer (normalisierten) Form für rumpfSperre(turm, quelle) in sperre.js, in SCHIFFS-Koordinaten
 * (Form + versatz, wie formZuSchiff). → { zelle, x0, z0, nx, nz, oben, unten (Float64Array nx·nz), huelle { x0, x1, z0, z1 },
 * weite, hoehe(x, z, oben) → y | null } oder null (keine Plus-Körper).
 * hoehe(…, true) = höchste Oberkante des Materials über (x, z) + rand, hoehe(…, false) = tiefste Unterkante − rand.
 * WARUM senkrechte Geradenproben (festStrecken): dieselbe Rechnung wie die Höhenprobe der Türme — Plus minus Minus,
 * Drehung und Spiegel stimmen von selbst. Raster je Probenpunkt, danach Maximum über (2r + 1)² Nachbarn mit
 * r = ⌈rand / zelle⌉ + 1: Material bis rand neben dem Abfragepunkt zählt sicher mit (Abfrage = nächster Probenpunkt).
 */
export function formHoehenfeld(form, versatz = [0, 0, 0]) {
  let karte = hoehenfelder.get(form);
  if (!karte) hoehenfelder.set(form, karte = new Map());
  const schluessel = versatz.join(',');
  if (karte.has(schluessel)) return karte.get(schluessel);
  const sz = szene(form), plus = sz.filter((kp) => kp.plus);
  if (!plus.length) { karte.set(schluessel, null); return null; }
  let hx0 = Infinity, hx1 = -Infinity, hz0 = Infinity, hz1 = -Infinity;
  for (const kp of plus) { hx0 = Math.min(hx0, kp.h.min[0]); hx1 = Math.max(hx1, kp.h.max[0]); hz0 = Math.min(hz0, kp.h.min[2]); hz1 = Math.max(hz1, kp.h.max[2]); }
  const H = HOEHENFELD, dx = hx1 - hx0, dz = hz1 - hz0;
  const c = Math.max(H.zelleMin, Math.sqrt((dx + 1) * (dz + 1) / H.probenMax));
  const r = Math.ceil(H.rand / c) + 1;            // Nachbar-Radius in Zellen
  const x0 = hx0 - r * c, z0 = hz0 - r * c;       // Rand von r Zellen: die Dehnung reicht über die Hülle hinaus
  const nx = Math.ceil(dx / c) + 2 * r + 1, nz = Math.ceil(dz / c) + 2 * r + 1;
  const ob = new Float64Array(nx * nz).fill(-Infinity), un = new Float64Array(nx * nz).fill(Infinity);
  for (let k = 0; k < nz; k++) {
    const pz = z0 + k * c;
    // WARUM je Zeile vorsortieren: festStrecken prüft sonst für jede Probe die Hüllen aller Körper
    const zeile = sz.filter((kp) => !(kp.h.max[2] < pz || kp.h.min[2] > pz));
    if (!zeile.some((kp) => kp.plus)) continue;
    for (let i = 0; i < nx; i++) {
      const px = x0 + i * c;
      const st = festStrecken(zeile, [px, -W, pz], [0, 1, 0], [[px, -Infinity, pz], [px, Infinity, pz]], true);
      if (!st.length) continue;
      ob[k * nx + i] = st[st.length - 1][1] - W; un[k * nx + i] = st[0][0] - W;
    }
  }
  // Dehnung (getrennt nach x und z) + senkrechter Rand, dann um den Versatz in Schiffs-Koordinaten
  const dehne = (a, max) => {
    const b = new Float64Array(a.length);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      let m = max ? -Infinity : Infinity;
      for (let j = Math.max(0, i - r); j <= Math.min(nx - 1, i + r); j++) { const v = a[k * nx + j]; m = max ? (v > m ? v : m) : (v < m ? v : m); }
      b[k * nx + i] = m;
    }
    const e = new Float64Array(a.length);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      let m = max ? -Infinity : Infinity;
      for (let j = Math.max(0, k - r); j <= Math.min(nz - 1, k + r); j++) { const v = b[j * nx + i]; m = max ? (v > m ? v : m) : (v < m ? v : m); }
      e[k * nx + i] = m;
    }
    return e;
  };
  const vx = versatz[0], vy = versatz[1], vz = versatz[2];
  const oben = dehne(ob, true), unten = dehne(un, false);
  for (let q = 0; q < oben.length; q++) { oben[q] += vy + H.rand; unten[q] += vy - H.rand; }
  const sx0 = x0 + vx, sz0 = z0 + vz;
  const huelleS = { x0: sx0, x1: sx0 + (nx - 1) * c, z0: sz0, z1: sz0 + (nz - 1) * c };
  const feld = {
    zelle: c, x0: sx0, z0: sz0, nx, nz, oben, unten, huelle: huelleS,
    weite: Math.hypot(huelleS.x1 - huelleS.x0, huelleS.z1 - huelleS.z0),
    /** Ober- (oben) bzw. Unterkante an (x, z) in Schiffs-Koordinaten, null = kein Material. */
    hoehe(x, z, o) {
      const i = Math.round((x - sx0) / c), k = Math.round((z - sz0) / c);
      if (i < 0 || i >= nx || k < 0 || k >= nz) return null;
      const v = (o ? oben : unten)[k * nx + i];
      return Number.isFinite(v) ? v : null;
    },
  };
  karte.set(schluessel, feld);
  return feld;
}

/** Montage-Prüfung aller Geschütze einer (normalisierten) Form. */
export function pruefeGeschuetze(form) {
  const sz = szene(form), m = [], schon = new Set();
  const melde = (code, stufe, text, b) => { const k = code + ':' + b.id; if (!schon.has(k)) { schon.add(k); m.push({ code, stufe, text, bauteil: b.id }); } };
  const lagen = [];
  for (const e of bauteilListe(form)) {
    const kat = GESCHUETZE[e.b.typ];
    if (!kat) continue; // Antriebe und Unbekanntes prüft flug.js
    if (Math.abs(e.n[1]) !== 1) {
      melde('seitenmontage', 'fehler', `${kat.name} sitzt an einer Seitenfläche — Geschütze gehen nur auf Ober- oder Unterseiten`, e.b);
      continue;
    }
    const l = geschuetzLage(e, lagen.length, form, sz);
    lagen.push(l);
    const { f, turm: t } = l, name = kat.name;
    if (f.imRumpf) melde('im_rumpf', 'fehler', `${name} steckt im Rumpf — über der Standfläche liegt ein Körper; auf eine freie Fläche setzen`, e.b);
    if (f.anteil < ANTEIL_MIN) melde('ueber_kante', 'warnung', `${name} ragt über die Kante — nur ${pz(f.anteil)} % der Standfläche liegen auf dem Rumpf`, e.b);
    if (f.schuerze - 0.1 > SCHRAEG * TURM.fussR * t.s) melde('schraeg', 'warnung', `${name} steht schräg — ${m1(f.schuerze - 0.1)} m Höhenunterschied unter dem Fuß (der Sockel füllt den Spalt)`, e.b);
    if (!f.imRumpf) {
      const frei = schussfeld(sz, t);
      if (frei < FELD_MIN) melde('kein_schussfeld', 'warnung', `${name} hat kaum Schussfeld — nur ${pz(frei)} % der Richtungen sind auf ${FELD_WEITE} m frei`, e.b);
    }
  }
  // Paare: Drehkränze (zu_dicht / auf_spiegelebene) und Schwenkkreise der Rohre (rohre_kreuzen)
  for (let i = 0; i < lagen.length; i++) for (let j = i + 1; j < lagen.length; j++) {
    const A = lagen[i], B = lagen[j], a = A.turm, b = B.turm;
    if (a.oben !== b.oben) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z), va = A.f.v, vb = B.f.v;
    const selbst = A.eintrag.b === B.eintrag.b;
    const fuss = TURM.fussR * (a.s + b.s);
    // WARUM Höhenbedingung: ein Turm auf hohem Sockel bzw. auf einer Stufe darüber stößt nicht mit dem Kranz an
    const ueberlappt = va < vb + kopfHoehe(b.s, b.sockel) && vb < va + kopfHoehe(a.s, a.sockel);
    if (d < fuss && ueberlappt) {
      if (selbst) {
        const sa = A.eintrag.spiegel ?? [1, 1, 1], sb = B.eintrag.spiegel ?? [1, 1, 1];
        const ebene = ACHSEN.filter((_, k) => sa[k] !== sb[k]).map((x) => `${x} = 0`).join(' / ');
        melde('auf_spiegelebene', 'fehler', `${A.kat.name} liegt zu nah an der Spiegelebene ${ebene} — Original und Spiegelkopie überlappen (${m1(d)} m, nötig ${m1(fuss)} m)`, A.eintrag.b);
      } else {
        melde('zu_dicht', 'fehler', `${A.kat.name} steht zu dicht an Bauteil ${B.eintrag.b.id} (${m1(d)} m, nötig ${m1(fuss)} m) — die Drehkränze überlappen`, A.eintrag.b);
        melde('zu_dicht', 'fehler', `${B.kat.name} steht zu dicht an Bauteil ${A.eintrag.b.id} (${m1(d)} m, nötig ${m1(fuss)} m) — die Drehkränze überlappen`, B.eintrag.b);
      }
      continue;
    }
    const reich = reichweite(a.s) + reichweite(b.s);
    // Rohre liegen in Zapfenhöhe; enger als Rohrmantel beider Türme + 1 m Luft → sie können sich beim Schwenken treffen
    const za = va + a.zapfen.y, zb = vb + b.zapfen.y;
    if (d < reich && Math.abs(za - zb) < TURM.mantelR * (a.s + b.s) + 1) {
      const text = (n, o) => `Rohre von ${n} und Bauteil ${o} können sich beim Schwenken treffen (${m1(d)} m, frei ab ${m1(reich)} m)`;
      melde('rohre_kreuzen', 'warnung', text(A.kat.name, B.eintrag.b.id), A.eintrag.b);
      if (!selbst) melde('rohre_kreuzen', 'warnung', text(B.kat.name, A.eintrag.b.id), B.eintrag.b);
    }
  }
  return m;
}

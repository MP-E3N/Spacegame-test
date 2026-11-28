// ZWECK: Push/Pull der Form-Werkstatt (Runde 18): Fläche eines Körpers am Treffer erkennen, Fläche ziehen, Maß in
//        Zugrichtung, neuen Körper bündig auf eine Fläche setzen. Reine Rechnung: ohne three, ohne DOM, ohne Zufall.
// LIEFERT: flaecheVon(k, p, n, dreieck?) → Fläche · ziehe(k, flaeche, d) → { koerper, d } · flaechenMass(k, flaeche) → m
//          · trefferImKoerper(lage, p, n) → { p, n } · ablegen(huelle, treffer) → pos · MIN (Mindestmaße)
// REGEL (Protokoll R18, Entscheidungen 1–9):
//   Fläche = { art: 'kappe', ende: 0 | 1 } | { art: 'seite', achse: 'x' | 'y', vz: ±1 } | { art: 'kante', j }, immer mit
//            richtung [x, y, z] (Körper-Koordinaten, Einheitsvektor nach außen = Zugrichtung; bei Seite/Kante in der
//            Spantebene, z = 0 — WARUM: gezogen wird je Spant in seiner Ebene, d zählt entlang dieser Richtung).
//   Kappe: Treffer auf einem End-Spant (|z − z_Ende| < 1 cm) und n·(±Z) > 0,7. Nach außen: letzter Abschnitt prismatisch
//          → nur z wandert, sonst Kopie des End-Spants anhängen. Nach innen: z wandert, ≥ 0,1 m zum Nachbarn; ein
//          prismatischer Abschnitt, der genau aufgebraucht wird, verschwindet (WARUM: sonst ginge Hin-und-zurück nicht
//          auf, die angehängte Kopie bliebe als 0,1-m-Stummel stehen).
//   Seite (Körper ohne Umriss p): aus der Profilkante unter dem Treffer (2D-Normale, größte Komponente), b/h + d,
//          x/y + vz·d/2 für alle Spanten; b/h ≥ 0,1 m.
//   Kante j (Körper mit Umriss p): Punkte j, j+1 gleiten entlang der Nachbarkanten (Nachbarflächen bleiben in ihrer
//          Ebene); |sin| < 0,2 → Rückfall auf die Kanten-Normale. Je Spant eigene 2D-Normale, Außenseite aus dem
//          Flächenvorzeichen. Kanten < 6 cm, gekippte Kante (Richtung dreht sich um), Selbstschnitt, b/h < 0,1 m oder
//          > 400 m → d wird geklemmt (Halbierungssuche, 1 mm Abstand zur Grenze). Rückfall-Fälle sind nicht umkehrbar.
//   Grenzen: |d| ≤ 400 m bei Seite/Kante, End-Spant ≤ ±1000 m; NaN/∞ → unverändert, d = 0.
//   Zahl + Enter (E7): die Werkstatt ruft ziehe mit dem Körper VOR dem Zug und der getippten Weite auf.
//   Dreieck-Index (optional) aus koerperGeometrie: erst die Mantel-Dreiecke (je Abschnitt i, je Kante j zwei), dann die
//          Kappen. `fest` → unverändert, d = 0. Eingaben werden nie verändert. Ergebnis nicht normalisiert (E5).
import { profilPunkte, umrissAusPunkten, GRENZEN } from './form.js';

export const MIN = { mass: 0.1, kante: 0.06, abstand: 0.1 };
const KAPPE_Z = 0.01, KAPPE_N = 0.7, SIN_MIN = 0.2;

// ---------------- kleine Rechnungen ----------------
/** Vorzeichenbehaftete Fläche eines Umrisses (positiv = gegen den Uhrzeigersinn). */
function flaecheV(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
/** Außennormale (2D) der Kante a → b eines Umrisses mit Umlaufsinn s (+1 = gegen den Uhrzeigersinn). */
function aussen(a, b, s) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [s * dy / l, -s * dx / l]; }
const umlauf = (p) => (flaecheV(p) < 0 ? -1 : 1);
/** Gleicher Querschnitt (für „prismatisch“)? */
function gleich(a, b) {
  if (a.b !== b.b || a.h !== b.h || (a.x ?? 0) !== (b.x ?? 0) || (a.y ?? 0) !== (b.y ?? 0)) return false;
  if (!!a.p !== !!b.p) return false;
  if (a.p) return a.p.length === b.p.length && a.p.every((q, i) => q[0] === b.p[i][0] && q[1] === b.p[i][1]);
  // Runde 21: eigene Ecken-Maße gehören zum Querschnitt
  return (a.rundung ?? 0) === (b.rundung ?? 0) && (a.fase ?? 0) === (b.fase ?? 0) && JSON.stringify(a.ecken ?? null) === JSON.stringify(b.ecken ?? null);
}
/** Umriss bei z (linear zwischen den Spanten, i-ter zu i-tem Punkt) und Abschnitt-Index. */
function umrissBei(sp, z) {
  let i = 0; while (i < sp.length - 2 && z > sp[i + 1].z) i++;
  const a = profilPunkte(sp[i]), b = profilPunkte(sp[i + 1]), t = Math.min(1, Math.max(0, (z - sp[i].z) / ((sp[i + 1].z - sp[i].z) || 1)));
  return a.map((q, j) => [q[0] + (b[j][0] - q[0]) * t, q[1] + (b[j][1] - q[1]) * t]);
}
/** Abstand des Punkts q zur Strecke a–b (2D). */
function abstand(q, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}

// ---------------- Fläche erkennen ----------------
/** Seiten-/Kanten-Fläche zur Profilkante j (an Stelle z) bestimmen. */
function mantel(k, j, z) {
  const sp = k.spanten, R = umrissBei(sp, z), P = R.length, s = umlauf(R);
  const [nx, ny] = aussen(R[j], R[(j + 1) % P], s);
  if (sp[0].p) return { art: 'kante', j, richtung: [nx, ny, 0] };
  const achse = Math.abs(nx) >= Math.abs(ny) ? 'x' : 'y', vz = (achse === 'x' ? nx : ny) < 0 ? -1 : 1;
  return { art: 'seite', achse, vz, richtung: achse === 'x' ? [vz, 0, 0] : [0, vz, 0] };
}
const kappe = (ende) => ({ art: 'kappe', ende, richtung: [0, 0, ende ? 1 : -1] });

/**
 * Welche Fläche liegt am Treffer? p, n in KÖRPER-Koordinaten (n darf ungenormt sein). dreieck: Index im rohen
 * Körpernetz (koerperGeometrie) — dann eindeutig, auch bei Rundung und Verdrehung. → Fläche oder null (Körper leer).
 */
export function flaecheVon(k, p, n, dreieck) {
  const sp = k?.spanten; if (!sp || sp.length < 2) return null;
  const P = profilPunkte(sp[0]).length, z0 = sp[0].z, z1 = sp[sp.length - 1].z, nl = Math.hypot(n[0], n[1], n[2]) || 1;
  if (Number.isInteger(dreieck) && dreieck >= 0) {
    const mantelZahl = 2 * P * (sp.length - 1);
    if (dreieck < mantelZahl) {
      const i = Math.floor(dreieck / (2 * P)), j = Math.floor((dreieck % (2 * P)) / 2);
      return mantel(k, j, Math.min(sp[i + 1].z, Math.max(sp[i].z, p[2])));
    }
    return kappe(Math.abs(p[2] - z1) < Math.abs(p[2] - z0) ? 1 : 0); // Kappen: vorn und hinten liegen bei z0 / z1
  }
  if (Math.abs(p[2] - z0) < KAPPE_Z && -n[2] / nl > KAPPE_N) return kappe(0);
  if (Math.abs(p[2] - z1) < KAPPE_Z && n[2] / nl > KAPPE_N) return kappe(1);
  // Mantel: nächste Profilkante im Umriss an der Trefferstelle
  const R = umrissBei(sp, Math.min(z1, Math.max(z0, p[2]))), q = [p[0], p[1]];
  let best = 0, bd = Infinity;
  for (let j = 0; j < R.length; j++) { const d = abstand(q, R[j], R[(j + 1) % R.length]); if (d < bd) { bd = d; best = j; } }
  return mantel(k, best, Math.min(z1, Math.max(z0, p[2])));
}

/** Treffer aus Form- in Körper-Koordinaten: Form = S · (m · p + t) → p = mᵀ · (S · p_Form − t); n = mᵀ · S · n. */
export function trefferImKoerper(lage, p, n) {
  const S = lage.spiegel ?? [1, 1, 1], m = lage.m;
  const q = [0, 1, 2].map((i) => S[i] * p[i] - lage.t[i]), r = [0, 1, 2].map((i) => S[i] * n[i]);
  const mt = (v) => [0, 1, 2].map((j) => m[0][j] * v[0] + m[1][j] * v[1] + m[2][j] * v[2]);
  const pk = mt(q), nk = mt(r), l = Math.hypot(...nk) || 1;
  return { p: pk, n: nk.map((v) => v / l) };
}

// ---------------- Ziehen ----------------
/**
 * Runde 21: Kappe mit Kappenkanten-Fase/-Rundung (kf am End-Spant, kanten.js) — die Gruppe (End-Spant + Spanten im
 * Abstand ≤ kf.mass) wandert als Ganzes. WARUM: sonst hinge zieheKappe eine Kopie des GEFASTEN End-Spants an und die
 * Fase würde zur langen Schräge. Nach außen: der Abschnitt davor wächst (nicht prismatisch → Kopie der Gruppen-Basis
 * an ihrer alten Stelle); nach innen höchstens bis 0,1 m an den Nachbarn.
 */
function zieheKappeGruppe(sp, ende, d) {
  let neu = sp.map((s) => ({ ...s })), sg = ende ? 1 : -1;
  const eI = ende ? neu.length - 1 : 0, zE = neu[eI].z, tief = neu[eI].kf.mass + 1e-4;
  const inGruppe = (s) => Math.abs(s.z - zE) <= tief;
  const gruppe = neu.filter(inGruppe), rest = neu.filter((s) => !inGruppe(s));
  if (!rest.length) return { sp: neu, d: 0 };
  const basis = ende ? gruppe[0] : gruppe[gruppe.length - 1], nb = ende ? rest[rest.length - 1] : rest[0];
  if (d >= 0) {
    d = Math.min(d, Math.max(0, GRENZEN.weit - sg * zE));
    if (d === 0) return { sp: neu, d: 0 };
    const { kf, ...b } = basis, kopie = { ...b };
    const mitKopie = !gleich(basis, nb) && neu.length < GRENZEN.spanten;
    for (const s of gruppe) s.z = s.z + sg * d;
    neu = ende ? [...rest, ...(mitKopie ? [kopie] : []), ...gruppe] : [...gruppe, ...(mitKopie ? [kopie] : []), ...rest];
    return { sp: neu, d };
  }
  const weg = Math.max(0, Math.min(-d, Math.abs(basis.z - nb.z) - MIN.abstand));
  for (const s of gruppe) s.z = s.z - sg * weg;
  return { sp: neu, d: -weg };
}

function zieheKappe(sp, ende, d) {
  if (sp[ende ? sp.length - 1 : 0].kf) return zieheKappeGruppe(sp, ende, d);
  const neu = sp.map((s) => ({ ...s })), sg = ende ? 1 : -1;
  const end = () => (ende ? neu.length - 1 : 0), nach = () => (ende ? neu.length - 2 : 1);
  if (d >= 0) {
    if (d === 0) return { sp: neu, d: 0 };
    const e = neu[end()];
    d = Math.min(d, Math.max(0, GRENZEN.weit - sg * e.z)); // nicht über die Grenze der Werkstatt (±1000 m)
    if (gleich(e, neu[nach()]) || neu.length >= GRENZEN.spanten) e.z = e.z + sg * d; // prismatisch (oder kein Platz mehr)
    else { const kopie = { ...e, z: e.z + sg * d }; if (ende) neu.push(kopie); else neu.unshift(kopie); }
    return { sp: neu, d };
  }
  let rest = -d, getan = 0;
  for (;;) {
    const e = neu[end()], nb = neu[nach()], luecke = Math.abs(e.z - nb.z);
    // prismatischer Abschnitt ganz aufgebraucht → End-Spant fällt weg, der Nachbar wird neues Ende
    if (neu.length > 2 && gleich(e, nb) && rest >= luecke - 1e-9) {
      if (ende) neu.pop(); else neu.shift();
      rest -= luecke; getan += luecke;
      if (rest <= 1e-12) break;
      continue;
    }
    const weg = Math.max(0, Math.min(rest, luecke - MIN.abstand));
    e.z = e.z - sg * weg; getan += weg;
    break;
  }
  return { sp: neu, d: -getan };
}

function zieheSeite(sp, achse, vz, d) {
  const feld = achse === 'x' ? 'b' : 'h', mitte = achse === 'x' ? 'x' : 'y';
  const dMin = MIN.mass - Math.min(...sp.map((s) => s[feld])), dMax = GRENZEN.mass - Math.max(...sp.map((s) => s[feld]));
  // nach innen höchstens bis 0,1 m, nach außen höchstens bis 400 m (Grenze der Werkstatt)
  const dd = Math.min(Math.max(d, Math.min(0, dMin)), Math.max(0, dMax));
  // Runde 21: die gemerkte Ursprungsgröße einer Kappenkanten-Fase zieht mit (sonst baut erneutes Bearbeiten falsch zurück)
  const zieh = (s) => ({ ...s, [feld]: s[feld] + dd, [mitte]: (s[mitte] ?? 0) + vz * dd / 2 });
  return { sp: sp.map((s) => (s.kf ? { ...zieh(s), kf: { ...s.kf, vorher: zieh(s.kf.vorher) } } : zieh(s))), d: dd };
}

/**
 * Vorbereitung je Spant für Kante j: Punkte, Umlauf, Fläche, Hülle der unbewegten Punkte und die Gleitrichtungen der
 * beiden Endpunkte (Verschiebung je Meter Zugweite). WARUM vorab: die Halbierungssuche probiert bis zu 20 Weiten — dabei
 * bewegen sich nur zwei Punkte; alles andere bleibt und wird nicht neu gerechnet (Ziel < 0,2 ms je Zug).
 */
function kantenPlan(s, j) {
  const abs = profilPunkte(s), P = abs.length, o = umlauf(abs);
  const j1 = (j + 1) % P, jv = (j - 1 + P) % P, jn = (j + 2) % P;
  const [nx, ny] = aussen(abs[j], abs[j1], o);
  // Punkt gleitet entlang der Nachbarkante: Verschiebung t·u mit (t·u)·n = d → je Meter u / (u·n); fast parallel → Normale
  const gleit = (q, von) => {
    const ux = q[0] - von[0], uy = q[1] - von[1], l = Math.hypot(ux, uy) || 1, c = (ux * nx + uy * ny) / l;
    return Math.abs(c) < SIN_MIN ? [nx, ny] : [ux / l / c, uy / l / c];
  };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P; i++) if (i !== j && i !== j1) { const [x, y] = abs[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { abs, P, o, j, j1, jv, jn, A: flaecheV(abs), box: [x0, x1, y0, y1], ga: gleit(abs[j], abs[jv]), gb: gleit(abs[j1], abs[jn]) };
}
const kreuz2 = (p, q) => p[0] * q[1] - q[0] * p[1];
/**
 * Bewegte Punkte (a = neuer Punkt j, b = neuer Punkt j+1) gültig? Nur die drei betroffenen Kanten werden geprüft:
 * Länge ≥ 6 cm, kein Kippen (Richtung dreht sich nicht um — WARUM: sonst stülpt sich der Loft um, das Netz wird
 * undicht, Prüfer R18), kein Schnitt mit einer anderen Kante; dazu Umlauf bleibt und b/h zwischen 0,1 m und 400 m.
 */
function zugOk(pl, a, b) {
  const { abs, P, j, j1, jv, jn } = pl;
  if (!Number.isFinite(a[0] + a[1] + b[0] + b[1])) return false;
  const kanten = P === 3 ? [[abs[jv], a, jv, j], [a, b, j, j1], [b, abs[jv], j1, jv]] : [[abs[jv], a, jv, j], [a, b, j, j1], [b, abs[jn], j1, jn]];
  for (const [p, q, i, k] of kanten) {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    if (Math.hypot(dx, dy) < MIN.kante) return false;
    const ax = abs[k][0] - abs[i][0], ay = abs[k][1] - abs[i][1];
    if (dx * ax + dy * ay <= 0) return false; // gekippt
  }
  const [x0, x1, y0, y1] = pl.box, bx0 = Math.min(x0, a[0], b[0]), bx1 = Math.max(x1, a[0], b[0]), by0 = Math.min(y0, a[1], b[1]), by1 = Math.max(y1, a[1], b[1]);
  if (bx1 - bx0 < MIN.mass || by1 - by0 < MIN.mass || bx1 - bx0 > GRENZEN.mass || by1 - by0 > GRENZEN.mass) return false;
  // Fläche neu aus der alten plus den geänderten Gliedern der Trapezformel (nur Kanten jv→j, j→j1, j1→jn)
  const nn = P === 3 ? abs[jv] : abs[jn];
  const A = pl.A + (kreuz2(abs[jv], a) + kreuz2(a, b) + kreuz2(b, nn) - kreuz2(abs[jv], abs[j]) - kreuz2(abs[j], abs[j1]) - kreuz2(abs[j1], nn)) / 2;
  if ((A < 0 ? -1 : 1) !== pl.o || Math.abs(A) < 1e-6) return false;
  if (P > 3) for (const [p, q, i] of kanten) for (let f = 0; f < P; f++) {
    const f1 = (f + 1) % P;
    if (f === i || f1 === i || f === (i + 1) % P || f === jv || f === j || f === j1) continue; // eigene und Nachbarkanten
    if (schneiden(p, q, abs[f], abs[f1])) return false;
  }
  if (P > 3 && P !== 4 && schneiden(...kanten[0].slice(0, 2), ...kanten[2].slice(0, 2))) return false; // die beiden Nachbarkanten untereinander
  return true;
}
function schneiden(a, b, c, d) {
  const kr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = kr(c, d, a), d2 = kr(c, d, b), d3 = kr(a, b, c), d4 = kr(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}
const verschoben = (pl, d) => [[pl.abs[pl.j][0] + pl.ga[0] * d, pl.abs[pl.j][1] + pl.ga[1] * d], [pl.abs[pl.j1][0] + pl.gb[0] * d, pl.abs[pl.j1][1] + pl.gb[1] * d]];
function zieheKante(sp, j, d) {
  const plaene = sp.map((s) => kantenPlan(s, j));
  const ok = (dd) => plaene.every((pl) => { const [a, b] = verschoben(pl, dd); return zugOk(pl, a, b); });
  d = Math.max(-GRENZEN.mass, Math.min(GRENZEN.mass, d)); // 1e9 → 400 m (größer kann kein Umriss werden)
  let dd = d;
  if (!ok(d)) {
    // WARUM Halbierung: die zulässige Weite hängt von Nachbarkanten, Gegenseite und allen Spanten ab — keine Formel.
    // 20 Schritte: bei 400 m Anlauf auf 0,4 mm genau; danach 1 mm Abstand zur Grenze (Rundung in umrissAusPunkten)
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (ok(d * m)) lo = m; else hi = m; }
    dd = Math.sign(d) * Math.max(0, Math.abs(d * lo) - 0.001);
    if (!dd || !ok(dd)) return { sp: sp.map((s) => ({ ...s })), d: 0 };
  }
  return { sp: sp.map((s, i) => {
    const pl = plaene[i], [a, b] = verschoben(pl, dd), abs = pl.abs.map((q) => [...q]);
    abs[j] = a; abs[pl.j1] = b;
    return { ...s, ...umrissAusPunkten(abs) };
  }), d: dd };
}

/** Fläche um d Meter nach außen ziehen (negativ = hinein) → { koerper (neu), d (angewandt, nach Klemmung) }. */
export function ziehe(k, f, d) {
  if (!k || !f || !Number.isFinite(d) || k.fest || !k.spanten || k.spanten.length < 2) return { koerper: k, d: 0 };
  let r;
  if (f.art === 'kappe') r = zieheKappe(k.spanten, f.ende, d);
  else if (f.art === 'seite') r = zieheSeite(k.spanten, f.achse, f.vz, d);
  else if (f.art === 'kante' && k.spanten[0].p) r = zieheKante(k.spanten, f.j, d);
  else return { koerper: k, d: 0 };
  return { koerper: { ...k, spanten: r.sp }, d: r.d + 0 };
}

/** Maß in Zugrichtung (m): Kappe = Länge, Seite = größte Breite/Höhe, Kante = Ausdehnung des Umrisses entlang der Kanten-Normalen. */
export function flaechenMass(k, f) {
  const sp = k?.spanten; if (!sp?.length || !f) return 0;
  if (f.art === 'kappe') return sp[sp.length - 1].z - sp[0].z;
  if (f.art === 'seite') return Math.max(...sp.map((s) => (f.achse === 'x' ? s.b : s.h)));
  if (f.art === 'kante') {
    let m = 0;
    for (const s of sp) {
      const abs = profilPunkte(s), P = abs.length, [nx, ny] = aussen(abs[f.j % P], abs[(f.j + 1) % P], umlauf(abs));
      const pr = abs.map((q) => q[0] * nx + q[1] * ny); m = Math.max(m, Math.max(...pr) - Math.min(...pr));
    }
    return m;
  }
  return 0;
}

// ---------------- Ablegen ----------------
const raster = (v) => Math.round(v * 2) / 2 + 0;
/**
 * Neuer Körper bündig auf eine Fläche. huelle = huelle(neu) bei pos 0 (Form-Koordinaten); treffer = { p, n } in Form-
 * Koordinaten (n wird auf die Hauptachse gerastet). → pos: längs n berührt die Hülle die Fläche von außen (exakt), quer
 * dazu liegt die Hüllen-Mitte auf dem 0,5-m-Raster am Treffer. Schräge Flächen: Spalt wird hingenommen (R18, E8).
 */
export function ablegen(huelle, treffer) {
  const n = treffer.n, a = [0, 1, 2].reduce((b, i) => (Math.abs(n[i]) > Math.abs(n[b]) ? i : b), 1), vz = n[a] < 0 ? -1 : 1;
  return [0, 1, 2].map((i) => {
    // WARUM auf 0,1 mm runden (Projektleitung R18): Strahl-Treffer tragen Rechenrauschen (5,999999999 statt 6) in die Daten
    if (i === a) return Math.round((treffer.p[i] - (vz > 0 ? huelle.min[i] : huelle.max[i])) * 1e4) / 1e4 + 0;
    return raster(treffer.p[i]) - (huelle.min[i] + huelle.max[i]) / 2 + 0;
  });
}

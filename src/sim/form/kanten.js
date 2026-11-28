// ZWECK: Kanten der Form-Werkstatt (Runde 21, Nutzer: „Kanten auch manuell bearbeiten können, also auswählen und die Fase
//        angeben, Rundung oder so — Beispiel Inventor“). Kanten eines Körpers aufzählen und mit Fase (Abstand in m) oder
//        Rundung (Radius in m) versehen. Reine Rechnung: ohne three, ohne DOM, ohne Zufall.
// LIEFERT: kantenVon(k) → [{ id, art: 'laengs' | 'kappe', punkte: [[x, y, z], …] (Körper-Koordinaten), jetzt }]
//          · fase(k, ids, abstand) → { koerper, mass } · rundung(k, ids, radius) → { koerper, mass }
//          · KANTEN_SEITEN (Profilpunkte der Kappenkanten) · stufenFuer(radius)
// REGEL (Protokoll R21, Entscheidungen 1–2):
//   Kanten-IDs (stabil, solange sich die Art des Körpers nicht ändert):
//     L0…L3  Längskante an Ecke i des Normprofils über die GANZE Länge (alle Spanten) — Ecke 0 = (+x, +y), 1 = (−x, +y),
//            2 = (−x, −y), 3 = (+x, −y) in Körper-Koordinaten. Maß steht je Spant in spant.ecken[i] = { f } | { r }.
//     K<e><s> Kappenkante an Ende e (0 = kleinstes z, 1 = größtes z), Seite s: o = +y, u = −y, l = +x, r = −x. Fase/Rundung
//            über ECHTE Spanten: der End-Spant schrumpft an diesen Seiten, davor 1 (Fase) bzw. bis 4 (Rundung) Spanten im
//            Abstand ≤ Maß; der End-Spant trägt kf = { seiten, art, mass, vorher: { b, h, x, y } } (form.js). Erneut
//            bearbeiten baut erst zurück (vorher) und setzt dann neu: Seiten = alte ∪ gewählte, Maß und Art = neu
//            (kleinste Version: ein Maß je Kappe). Maß 0 = gewählte Seiten entfernen.
//     K<e>P<j> (Runde 22) Kappenkante an Ende e zwischen Kappe und Umriss-Seite j (Punkt j → j+1), nur mit Umriss p.
//            Wie K<e><s>, aber die Seite wird durch Einrücken der Umriss-Punkte gebildet (Seite parallel nach innen,
//            Nachbarseiten bleiben in ihrer Ebene, Punktzahl gleich — ziehen.js rueckeUmrissSeite); kf.seiten = 'P<j>',
//            kf.vorher hat zusätzlich p. Klemmen: Selbstschnitt/Kippen wie beim Ziehen → kleinstes Maß aller Seiten.
//     P<j>   Ecke j eines eigenen Umrisses p (nur dort).
//            Fase ersetzt den Punkt in ALLEN Spanten durch 2 Punkte, Rundung durch 5 (Bogen); höchstens 64 Punkte.
//            WARUM danach nicht stabil: die folgenden Punkte rücken auf — mehrere Ecken werden von hinten nach vorn
//            bearbeitet, die Auswahl muss danach neu getroffen werden.
//   Klemmen je Spant: Ecke ≤ kleinere halbe Seite − 3 cm, Kappe ≤ Abschnittslänge − 0,1 m und Restmaß ≥ 0,1 m, Umriss-Ecke
//   ≤ 45 % der kürzeren Nachbarkante. mass = das KLEINSTE tatsächlich angewendete Maß (0 = nichts geändert).
//   Eingaben werden nie verändert. Ergebnis nicht normalisiert (wie ziehen.js); Zahlen auf 1 mm (Umriss 1e-6).
import { profilPunkte, umrissAusPunkten, GRENZEN, PROFIL_N } from './form.js';
import { rueckeUmrissSeite } from './ziehen.js';

const ECKE = PROFIL_N / 4, MIN_EINZUG = 0.03, MIN_MASS = 0.1, MIN_ABSTAND = 0.1, MIN_STUFE = 0.06, MAX_PUNKTE = 64;
const r3 = (x) => Math.round(x * 1000) / 1000 + 0;
const ab3 = (x) => Math.floor(x * 1000 + 1e-9) / 1000 + 0; // abrunden: geklemmtes Maß darf die Grenze nicht überschreiten
/** Profilpunkte der Kappenkanten (Strecke zwischen den Ecken an dieser Seite) im Normprofil. */
export const KANTEN_SEITEN = { o: [ECKE - 1, ECKE], r: [2 * ECKE - 1, 2 * ECKE], u: [3 * ECKE - 1, 3 * ECKE], l: [4 * ECKE - 1, 0] };
const SEITEN = ['o', 'u', 'l', 'r'];

/** Rundung einer Kappenkante: so viele Zwischenschritte, dass zwei Spanten ≥ 6 cm auseinander liegen (pruefe: spanten_gleich). */
export function stufenFuer(radius) {
  for (const n of [4, 3, 2]) if (radius * (1 - Math.sin(Math.PI / 2 * (n - 1) / n)) >= MIN_STUFE) return n;
  return 1;
}

// ---------------- Kanten aufzählen ----------------
const eckMass = (s, i) => { const e = s.ecken?.[i]; return e?.r > 0 ? { art: 'rundung', mass: e.r } : e?.f > 0 ? { art: 'fase', mass: e.f } : null; };

/** Alle wählbaren Kanten eines Körpers; punkte = Linienzug zum Zeichnen, jetzt = vorhandene Fase/Rundung oder null. */
export function kantenVon(k) {
  const sp = k?.spanten; if (!Array.isArray(sp) || sp.length < 2) return [];
  const ringe = sp.map((s) => profilPunkte(s)), aus = [];
  if (sp[0].p) {
    const P = ringe[0].length;
    for (let j = 0; j < P; j++) aus.push({ id: 'P' + j, art: 'laengs', j, punkte: ringe.map((R, i) => [R[j][0], R[j][1], sp[i].z]), jetzt: null });
    for (const ende of [0, 1]) {
      const si = ende ? sp.length - 1 : 0, R = ringe[si], kf = sp[si].kf;
      for (let j = 0; j < P; j++) {
        const a = R[j], b = R[(j + 1) % P];
        aus.push({ id: 'K' + ende + 'P' + j, art: 'kappe', ende, j, punkte: [[a[0], a[1], sp[si].z], [b[0], b[1], sp[si].z]],
          jetzt: kf?.seiten.includes('P' + j) ? { art: kf.art, mass: kf.mass } : null });
      }
    }
    return aus;
  }
  for (let i = 0; i < 4; i++) {
    // Mitte der Ecke (zwischen ihrem 4. und 5. Punkt): liegt bei Fase auf der Fasenfläche, bei scharfer Ecke auf der Ecke
    const punkte = ringe.map((R, s) => { const a = R[i * ECKE + ECKE / 2 - 1], b = R[i * ECKE + ECKE / 2]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, sp[s].z]; });
    aus.push({ id: 'L' + i, art: 'laengs', ecke: i, punkte, jetzt: eckMass(sp[0], i) });
  }
  for (const ende of [0, 1]) {
    const si = ende ? sp.length - 1 : 0, R = ringe[si], kf = sp[si].kf;
    for (const seite of SEITEN) {
      const [a, b] = KANTEN_SEITEN[seite];
      aus.push({ id: 'K' + ende + seite, art: 'kappe', ende, seite, punkte: [[R[a][0], R[a][1], sp[si].z], [R[b][0], R[b][1], sp[si].z]],
        jetzt: kf?.seiten.includes(seite) ? { art: kf.art, mass: kf.mass } : null });
    }
  }
  return aus;
}

// ---------------- Längskanten (Normprofil) ----------------
function laengs(sp, ecken, art, a) {
  let mass = Infinity;
  const neu = sp.map((s) => {
    const e = [0, 1, 2, 3].map((i) => s.ecken?.[i] ?? null);
    const grenze = Math.min(s.b, s.h) / 2 - MIN_EINZUG;
    for (const i of ecken) {
      if (!(a > 0)) { e[i] = null; continue; }
      const m = ab3(Math.max(MIN_EINZUG, Math.min(a, grenze)));
      mass = Math.min(mass, m);
      e[i] = art === 'rundung' ? { r: m } : { f: m };
    }
    const { ecken: _, ...rest } = s;
    return e.some(Boolean) ? { ...rest, ecken: e } : rest;
  });
  return { sp: neu, mass: a > 0 ? mass : 0 };
}

// ---------------- Kappenkanten (Normprofil) ----------------
const innen = (s, seiten, d) => {
  // Seite schrumpft um d: Breite/Höhe kleiner, Mitte rückt von der Seite weg
  let { b, h, x = 0, y = 0 } = s;
  if (seiten.includes('o')) { h -= d; y -= d / 2; }
  if (seiten.includes('u')) { h -= d; y += d / 2; }
  if (seiten.includes('l')) { b -= d; x -= d / 2; }
  if (seiten.includes('r')) { b -= d; x += d / 2; }
  return { b, h, x, y };
};

function kappe(sp, ende, gewaehlt, art, a) {
  let l = sp.map((s) => ({ ...s }));
  const endI = () => (ende ? l.length - 1 : 0);
  const alt = l[endI()].kf;
  if (alt) { // zurückbauen: Spanten der Gruppe weg, End-Spant wieder in alter Größe
    const zE = l[endI()].z;
    l = l.filter((s, i) => i === endI() || Math.abs(s.z - zE) > alt.mass + 1e-4);
    const e = l[endI()]; Object.assign(e, alt.vorher); delete e.kf;
  }
  const alteSeiten = alt?.seiten ?? [];
  const seiten = a > 0 ? SEITEN.filter((x) => alteSeiten.includes(x) || gewaehlt.includes(x)) : SEITEN.filter((x) => alteSeiten.includes(x) && !gewaehlt.includes(x));
  const wunsch = a > 0 ? a : alt?.mass ?? 0, artNeu = a > 0 ? art : alt?.art ?? art;
  if (!seiten.length || !(wunsch > 0) || l.length < 2) return { sp: l, mass: 0, geaendert: !!alt };
  const e = l[endI()], nb = l[ende ? l.length - 2 : 1], luecke = Math.abs(e.z - nb.z);
  const nV = seiten.filter((x) => x === 'o' || x === 'u').length, nH = seiten.filter((x) => x === 'l' || x === 'r').length;
  const m = ab3(Math.min(wunsch, luecke - MIN_ABSTAND, nV ? (Math.min(e.h, nb.h) - MIN_MASS) / nV : Infinity, nH ? (Math.min(e.b, nb.b) - MIN_MASS) / nH : Infinity));
  if (!(m >= 0.01)) return { sp: sp.map((s) => ({ ...s })), mass: 0, geaendert: false };
  let n = artNeu === 'rundung' ? stufenFuer(m) : 1;
  while (n > 1 && l.length + n > GRENZEN.spanten) n--; // WARUM: Grenze 24 Spanten je Körper (form.js)
  if (l.length + n > GRENZEN.spanten) return { sp: sp.map((s) => ({ ...s })), mass: 0, geaendert: false };
  const sg = ende ? 1 : -1, zB = e.z - sg * m, lz = e.z - nb.z;
  const bei = (z) => { const t = (z - nb.z) / lz, f = (q) => (nb[q] ?? 0) + ((e[q] ?? 0) - (nb[q] ?? 0)) * t; return { b: f('b'), h: f('h'), x: f('x'), y: f('y') }; };
  const { kf: _, ...basis } = e, neu = [];
  for (let i = 0; i <= n; i++) {
    const th = artNeu === 'rundung' ? (i / n) * Math.PI / 2 : i ? Math.PI / 2 : 0;
    const z = i === n ? e.z : r3(zB + sg * m * (artNeu === 'rundung' ? Math.sin(th) : 0));
    const ein = artNeu === 'rundung' ? m * (1 - Math.cos(th)) : i ? m : 0;
    const d = innen(i === n ? e : bei(z), seiten, ein);
    neu.push({ ...basis, z, b: r3(d.b), h: r3(d.h), x: r3(d.x), y: r3(d.y) });
  }
  neu[n].kf = { seiten, art: artNeu, mass: m, vorher: { b: e.b, h: e.h, x: e.x ?? 0, y: e.y ?? 0 } };
  l = ende ? [...l.slice(0, -1), ...neu] : [...neu.reverse(), ...l.slice(1)];
  return { sp: l, mass: m, geaendert: true };
}

// ---------------- Kappenkanten an Umriss-Seiten (Runde 22) ----------------
const PJ = /^P\d+$/, nr = (x) => +x.slice(1);
/** Umriss-Seiten js eines Spants um d einrücken → { spant, d (kleinstes angewandtes) }. */
function einruecken(s, js, d) {
  let t = s, min = d;
  for (const j of js) { const r = rueckeUmrissSeite(t, j, -d); min = Math.min(min, -r.d); t = r.spant; }
  return { spant: t, d: min };
}
function kappeUmriss(sp, ende, gewaehlt, art, a) {
  let l = sp.map((s) => ({ ...s }));
  const endI = () => (ende ? l.length - 1 : 0), unveraendert = () => ({ sp: sp.map((s) => ({ ...s })), mass: 0, geaendert: false });
  const alt = l[endI()].kf;
  if (alt) { // zurückbauen wie bei kappe()
    const zE = l[endI()].z;
    l = l.filter((s, i) => i === endI() || Math.abs(s.z - zE) > alt.mass + 1e-4);
    const e = l[endI()]; Object.assign(e, alt.vorher); delete e.kf;
  }
  const P = l[endI()].p.length;
  const alte = (alt?.seiten ?? []).filter((x) => PJ.test(x) && nr(x) < P), gew = gewaehlt.filter((j) => j < P).map((j) => 'P' + j);
  const seiten = (a > 0 ? [...new Set([...alte, ...gew])] : alte.filter((x) => !gew.includes(x))).sort((x, y) => nr(x) - nr(y));
  const wunsch = a > 0 ? a : alt?.mass ?? 0, artNeu = a > 0 ? art : alt?.art ?? art;
  if (!seiten.length || !(wunsch > 0) || l.length < 2) return { sp: l, mass: 0, geaendert: !!alt };
  const e = l[endI()], nb = l[ende ? l.length - 2 : 1], js = seiten.map(nr);
  let m = ab3(Math.min(wunsch, Math.abs(e.z - nb.z) - MIN_ABSTAND));
  // WARUM mehrfach probieren: jede Seite kann am Selbstschnitt anders klemmen — das kleinste Maß gilt für alle
  for (let i = 0; i < 4 && m >= 0.01; i++) { const r = einruecken(e, js, m); if (r.d >= m - 1e-6) break; m = ab3(r.d - 0.001); }
  if (!(m >= 0.01) || einruecken(e, js, m).d < m - 1e-6) return unveraendert();
  let n = artNeu === 'rundung' ? stufenFuer(m) : 1;
  while (n > 1 && l.length + n > GRENZEN.spanten) n--;
  if (l.length + n > GRENZEN.spanten) return unveraendert();
  const sg = ende ? 1 : -1, zB = e.z - sg * m, A = profilPunkte(nb), E = profilPunkte(e), lz = e.z - nb.z;
  const { kf: _, ...basis } = e, neu = [];
  for (let i = 0; i <= n; i++) {
    const th = artNeu === 'rundung' ? (i / n) * Math.PI / 2 : i ? Math.PI / 2 : 0;
    const z = i === n ? e.z : r3(zB + sg * m * (artNeu === 'rundung' ? Math.sin(th) : 0));
    const ein = artNeu === 'rundung' ? m * (1 - Math.cos(th)) : i ? m : 0;
    const t = (z - nb.z) / lz;
    const roh = i === n ? basis : { ...basis, z, ...umrissAusPunkten(A.map((q, j) => [q[0] + (E[j][0] - q[0]) * t, q[1] + (E[j][1] - q[1]) * t])) };
    neu.push(ein > 1e-9 ? { ...einruecken(roh, js, ein).spant, z } : { ...roh, z });
  }
  neu[n].kf = { seiten, art: artNeu, mass: m, vorher: { b: e.b, h: e.h, x: e.x ?? 0, y: e.y ?? 0, p: e.p.map((q) => [...q]) } };
  l = ende ? [...l.slice(0, -1), ...neu] : [...neu.reverse(), ...l.slice(1)];
  return { sp: l, mass: m, geaendert: true };
}

// ---------------- Ecken eines eigenen Umrisses ----------------
const norm = (v) => { const l = Math.hypot(v[0], v[1]); return l > 1e-12 ? [v[0] / l, v[1] / l] : [0, 0]; };

/** Punkt j eines Umrisses (absolut) ersetzen → { punkte, mass } oder null (keine echte Ecke). */
function eckeErsetzen(abs, j, art, a) {
  const P = abs.length, V = abs[j], A = abs[(j - 1 + P) % P], B = abs[(j + 1) % P];
  const lA = Math.hypot(A[0] - V[0], A[1] - V[1]), lB = Math.hypot(B[0] - V[0], B[1] - V[1]);
  const u1 = norm([A[0] - V[0], A[1] - V[1]]), u2 = norm([B[0] - V[0], B[1] - V[1]]);
  const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  if (lA < 1e-6 || lB < 1e-6 || th > Math.PI - 0.01) return null; // gerade durchlaufend: keine Ecke
  const tMax = 0.45 * Math.min(lA, lB);
  if (art !== 'rundung') {
    const t = Math.min(a, tMax);
    return { punkte: [[V[0] + u1[0] * t, V[1] + u1[1] * t], [V[0] + u2[0] * t, V[1] + u2[1] * t]], mass: t };
  }
  const tan = Math.tan(th / 2), t = Math.min(a / tan, tMax), r = t * tan;
  const bi = norm([u1[0] + u2[0], u1[1] + u2[1]]), dc = r / Math.sin(th / 2), C = [V[0] + bi[0] * dc, V[1] + bi[1] * dc];
  const T1 = [V[0] + u1[0] * t, V[1] + u1[1] * t], T2 = [V[0] + u2[0] * t, V[1] + u2[1] * t];
  const f1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
  let df = Math.atan2(T2[1] - C[1], T2[0] - C[0]) - f1;
  while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI; // kurzer Bogen
  const punkte = [0, 1, 2, 3, 4].map((i) => [C[0] + r * Math.cos(f1 + df * i / 4), C[1] + r * Math.sin(f1 + df * i / 4)]);
  return { punkte, mass: r };
}

function umrissEcken(sp, js, art, a) {
  let l = sp.map((s) => ({ ...s })), mass = Infinity, getan = 0;
  for (const j of [...js].sort((x, y) => y - x)) { // von hinten: vordere Indizes bleiben gültig
    const P = l[0].p.length, plus = art === 'rundung' ? 4 : 1;
    if (j >= P || P + plus > MAX_PUNKTE) continue;
    const je = l.map((s) => eckeErsetzen(profilPunkte(s), j, art, a));
    if (je.some((x) => !x)) continue;
    l = l.map((s, i) => {
      const abs = profilPunkte(s), neu = { ...s, ...umrissAusPunkten([...abs.slice(0, j), ...je[i].punkte, ...abs.slice(j + 1)]) };
      if (!s.kf) return neu;
      // Runde 22: Kappenkanten-Marker mitführen — Seiten ab j rücken um die neuen Punkte auf, der gemerkte Umriss bekommt
      // dieselbe Ecke (WARUM: sonst passte er nicht mehr, und das Zurückbauen zerstörte die Form)
      const va = profilPunkte(s.kf.vorher), ve = eckeErsetzen(va, j, art, a);
      if (!ve) { const { kf, ...rest } = neu; return rest; }
      const vn = umrissAusPunkten([...va.slice(0, j), ...ve.punkte, ...va.slice(j + 1)]), plus = je[i].punkte.length - 1;
      return { ...neu, kf: { ...s.kf, seiten: s.kf.seiten.map((x) => (nr(x) >= j ? 'P' + (nr(x) + plus) : x)), vorher: { b: vn.b, h: vn.h, x: vn.x, y: vn.y, p: vn.p } } };
    });
    mass = Math.min(mass, ...je.map((x) => x.mass)); getan++;
  }
  return { sp: l, mass: getan ? r3(mass) : 0 };
}

// ---------------- Öffentlich ----------------
function bearbeite(k, ids, art, a) {
  const sp = k?.spanten;
  if (!sp || sp.length < 2 || k.fest || !Array.isArray(ids) || !ids.length || !Number.isFinite(a)) return { koerper: k, mass: 0 };
  a = Math.max(0, Math.min(a, GRENZEN.mass / 2));
  if (sp[0].p) {
    let l = sp, mass = Infinity, geaendert = false;
    // WARUM erst die Kappen, dann die Ecken: Ecken fügen Punkte ein, die Seiten-Nummern der Auswahl gelten vorher
    for (const ende of [0, 1]) {
      const js = [...new Set(ids.filter((x) => x.startsWith('K' + ende + 'P') && /^\d+$/.test(x.slice(3))).map((x) => +x.slice(3)))];
      if (!js.length) continue;
      const r = kappeUmriss(l, ende, js, art, a);
      if (r.geaendert) { l = r.sp; geaendert = true; if (r.mass) mass = Math.min(mass, r.mass); }
    }
    const js = [...new Set(ids.filter((x) => PJ.test(x)).map(nr))];
    if (js.length && a > 0) { const r = umrissEcken(l, js, art, a); if (r.mass) { l = r.sp; geaendert = true; mass = Math.min(mass, r.mass); } }
    return geaendert ? { koerper: { ...k, spanten: l }, mass: Number.isFinite(mass) ? mass : 0 } : { koerper: k, mass: 0 };
  }
  let l = sp, mass = Infinity, geaendert = false;
  // WARUM erst die Kappen, dann die Längskanten: neue Kappen-Spanten übernehmen sonst die alten Ecken-Maße nicht
  for (const ende of [0, 1]) {
    const seiten = SEITEN.filter((s) => ids.includes('K' + ende + s));
    if (!seiten.length) continue;
    const r = kappe(l, ende, seiten, art, a);
    if (r.geaendert) { l = r.sp; geaendert = true; if (r.mass) mass = Math.min(mass, r.mass); }
  }
  const ecken = [0, 1, 2, 3].filter((i) => ids.includes('L' + i));
  if (ecken.length) { const r = laengs(l, ecken, art, a); l = r.sp; geaendert = true; if (r.mass) mass = Math.min(mass, r.mass); }
  if (!geaendert) return { koerper: k, mass: 0 };
  return { koerper: { ...k, spanten: l }, mass: Number.isFinite(mass) ? mass : 0 };
}

/** Fase mit gleichem Abstand (m) an den Kanten ids → { koerper, mass } (mass = kleinstes angewendetes Maß). */
export const fase = (k, ids, abstand) => bearbeite(k, ids, 'fase', abstand);
/** Rundung mit Radius (m) an den Kanten ids → { koerper, mass }. */
export const rundung = (k, ids, radius) => bearbeite(k, ids, 'rundung', radius);

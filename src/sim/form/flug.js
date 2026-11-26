// ZWECK: Antriebe der Form-Werkstatt (Runde 19) und Flugwerte einer selbst gebauten Form: Masse, Schwerpunkt, Trägheit,
//        Schub, Drehmomente → ein Wertesatz für erstelleSchiffSim (src/sim/schiff.js) plus Prüfliste „flugtauglich“.
// LIEFERT: ANTRIEBE = { triebwerk_s, triebwerk_m, triebwerk_l, steuer } · antriebArt(eintrag) → 'haupt' | 'steuer' | null
//          · massenwerte(form, katalog) → { masse, schwerpunkt, traegheit: [Ix, Iy, Iz], formMasse, laenge, unbekannt }
//          · flugwerte(form, katalog) → { werte (Schlüssel wie WERTE.bollwerk), masse (t), schwerpunkt [x,y,z],
//            schubpunkt [x,y,z] | null, schub (kN), meldungen: [{ code, stufe, text, bauteil?, koerper? }] }
//          · EICHUNG (Konstanten der Abstimmung, für Tests und Anzeige) · bezugsform('bollwerk' | 'ambos') (E6, für Tests)
// REGEL: Rein rechnend — ohne three, ohne DOM, ohne Zufall; gleiche Form → bitgleiche Werte (Koop).
//        Einheiten: m, t, kN, s. kN / t = m/s², kN·m / (t·m²) = rad/s². Form-Koordinaten wie das Schiff:
//        +Z Bug, +X Backbord, +Y oben. Haupttriebwerk sitzt am Heck, Düse nach −Z (n = [0, 0, −1]), Schub nach +Z.
//        Masse = Form (Plus − Minus, ≥ 0) · DICHTE + Masse ALLER Bauteile samt Spiegelkopien (Protokoll R19, E4).
//        Grenzen (E5): jeder Wert zwischen „halbes Bollwerk“ und Ambos, vMax ≤ 85 (Nutzer-Urteil R1: „viel zu schnell“).
// EICHUNG (E6): Quader 255 × 21 × 15 m mit 4 × triebwerk_l + 4 × steuer ≈ WERTE.bollwerk,
//               Quader 150 × 14 × 10 m mit 2 × triebwerk_m + 4 × steuer ≈ WERTE.ambos.
import { DICHTE, normalisiere, koerperListe, koerperMatrix, profilPunkte, huelle, bauteilListe } from './form.js';
import { WERTE, KOLLISION } from '../werte.js';

/**
 * Antriebe. WARUM triebwerk_l kaum stärker als _m: die beiden Bezugsschiffe (E6) verlangen es — das Bollwerk (≈ 3,7-fache
 * Masse) hat 4 L, der Ambos 2 M und soll trotzdem 1,6-mal so stark beschleunigen. L ist dafür ein großer Block mit mehr
 * Schub je Einbauplatz, M hat mehr Schub je Tonne. Steuer = Manöverdüsen-Block mit Düsen in alle Richtungen.
 */
export const ANTRIEBE = {
  triebwerk_s: { art: 'antrieb', name: 'Haupttriebwerk S', masse: 40, schub: 3500, r: 2.2, flaeche: ['hinten'] },
  triebwerk_m: { art: 'antrieb', name: 'Haupttriebwerk M', masse: 100, schub: 8000, r: 3.4, flaeche: ['hinten'] },
  triebwerk_l: { art: 'antrieb', name: 'Haupttriebwerk L', masse: 220, schub: 9500, r: 4.6, flaeche: ['hinten'] },
  steuer: { art: 'antrieb', name: 'Manöverdüsen-Block', masse: 25, schub: 5000, r: 1.2, flaeche: ['alle'] },
};

/** 'haupt' (schiebt nach +Z, nur am Heck), 'steuer' (Manöverdüsen) oder null (kein Antrieb). */
export const antriebArt = (e) => (e?.art !== 'antrieb' ? null : e.flaeche?.includes('hinten') ? 'haupt' : 'steuer');

const B = WERTE.bollwerk, A = WERTE.ambos;
/** Abstimmung — WARUM hier gesammelt: Prüfer und Werkstatt-Anzeige lesen dieselben Zahlen. */
export const EICHUNG = {
  vProWurzelA: 28,         // vMax = 28 · √aVor (Bollwerk 5 → 63, Ambos 8 → 79); WARUM Wurzel: schwere Schiffe nicht doppelt bestraft
  rueckAnteil: 0.6,        // aRueck = 0,6 · aVor (Bremsdüsen im Triebwerk)
  vRueckAnteil: 0.25, vQuerAnteil: 0.2,
  querAnteil: 0.5,         // aQuer = 0,5 · aVor, wenn die Manöverdüsen das tragen (sonst anteilig weniger)
  daempferFaktor: 0.95,    // aDaempfer = 0,95 · vMax · gierMax (Lernbuch R5: sonst wächst Drift in Kurven)
  drehExp: 0.5,            // drehBeschl = K · (τ / I)^0,5 — WARUM Wurzel: ein langes Schiff rollt rein physikalisch ~25-mal
                           // leichter, als es giert; das Bollwerk soll nur ~3,7-mal so schnell rollen
  drehK: { nicken: 0, gieren: 0, rollen: 0 }, // unten aus der Bollwerk-Bezugsform berechnet
  drehMaxFaktor: { nicken: 1.08, gieren: 1.09, rollen: 0.68 }, // drehMax / drehBeschl wie bei Bollwerk/Ambos
  hpBezug: { masse: 7406, hp: B.hpMax, exp: 0.53 }, // hpMax = 5000 · (m / 7406 t)^0,53 → Ambos (1980 t) ≈ 2500
  versatzHebel: 0.25,      // m: Schubpunkt so weit neben dem Schwerpunkt → Warnung schub_versatz
  versatzFehler: 0.5,      // ab 50 % des Steuer-Drehmoments (je Achse) → Fehler (E3)
  zuSchwach: 1.5,          // m/s²: darunter „zu schwach“ (Fehler)
  steuerNah: 0.15,         // Manöverdüsen im Mittel näher als 15 % der Länge am Schwerpunkt → Warnung
};

// ---------------- Massen-Momente eines Körpers ----------------
/** Fläche und Momente eines Polygons: [A, ∫x, ∫y, ∫x², ∫y², ∫xy] (vorzeichenrichtig für jeden Umlaufsinn). */
function polyMomente(p) {
  let a = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0;
    a += c; sx += (x0 + x1) * c; sy += (y0 + y1) * c;
    xx += (x0 * x0 + x0 * x1 + x1 * x1) * c; yy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    xy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  const s = a < 0 ? -1 : 1;
  return [s * a / 2, s * sx / 6, s * sy / 6, s * xx / 12, s * yy / 12, s * xy / 24];
}
// Gauß-Legendre mit 3 Punkten: exakt bis Grad 5 — WARUM: beim linearen Loft sind die zweiten Momente Grad 4 in z
const GL = [[0.5 - Math.sqrt(0.15), 5 / 18], [0.5, 8 / 18], [0.5 + Math.sqrt(0.15), 5 / 18]];

/** Volumen V, erstes Moment s = ∫r dV, zweites Moment C = ∫r·rᵀ dV (3×3) eines Körpers in Körper-Koordinaten. */
function koerperMomente(k) {
  let V = 0; const s = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 1; i < k.spanten.length; i++) {
    const a = profilPunkte(k.spanten[i - 1]), b = profilPunkte(k.spanten[i]);
    const z0 = k.spanten[i - 1].z, h = k.spanten[i].z - z0;
    for (const [t, g] of GL) {
      const z = z0 + t * h, w = g * h;
      const [A0, Sx, Sy, Pxx, Pyy, Pxy] = polyMomente(a.map((q, j) => [q[0] + (b[j][0] - q[0]) * t, q[1] + (b[j][1] - q[1]) * t]));
      V += w * A0; s[0] += w * Sx; s[1] += w * Sy; s[2] += w * z * A0;
      C[0][0] += w * Pxx; C[1][1] += w * Pyy; C[2][2] += w * z * z * A0;
      C[0][1] += w * Pxy; C[0][2] += w * z * Sx; C[1][2] += w * z * Sy;
    }
  }
  C[1][0] = C[0][1]; C[2][0] = C[0][2]; C[2][1] = C[1][2];
  return { V, s, C };
}

/** Momente in Form-Koordinaten: p = Q·r + u mit Q = S·M, u = S·t (S = Spiegel-Vorzeichen). */
function inForm({ V, s, C }, lage) {
  const S = lage.spiegel ?? [1, 1, 1];
  const Q = lage.m.map((z, i) => z.map((v) => v * S[i])), u = lage.t.map((v, i) => v * S[i]);
  const qs = Q.map((z) => z[0] * s[0] + z[1] * s[1] + z[2] * s[2]);
  const QC = Q.map((z) => [0, 1, 2].map((j) => z[0] * C[0][j] + z[1] * C[1][j] + z[2] * C[2][j]));
  const C2 = [0, 1, 2].map((i) => [0, 1, 2].map((j) =>
    QC[i][0] * Q[j][0] + QC[i][1] * Q[j][1] + QC[i][2] * Q[j][2] + qs[i] * u[j] + u[i] * qs[j] + V * u[i] * u[j]));
  return { V, s: qs.map((v, i) => v + V * u[i]), C: C2 };
}

/**
 * Masse, Schwerpunkt und Hauptträgheiten (um die Schiffsachsen durch den Schwerpunkt).
 * WARUM Minus einfach abziehen: exakt, solange der Minus-Körper ganz im Plus-Körper steckt; ragt er heraus, wird zu viel
 * abgezogen (Prüfliste meldet negative Masse als masse_null). Überlappende Plus-Körper zählen doppelt (keine Vereinigung).
 */
export function massenwerte(roh, katalog = {}) {
  const form = normalisiere(roh);
  form.koerper = form.koerper.filter((k) => k.spanten.length >= 2);
  let m = 0; const s = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const plus = (f, x) => { m += f * x.V; for (let i = 0; i < 3; i++) { s[i] += f * x.s[i]; for (let j = 0; j < 3; j++) C[i][j] += f * x.C[i][j]; } };
  const zmin = [], zmax = [];
  for (const { k, lage } of koerperListe(form)) {
    plus((k.op === 'plus' ? 1 : -1) * DICHTE, inForm(koerperMomente(k), lage));
    if (k.op === 'plus') { const h = huelle(k, lage); zmin.push(h.min); zmax.push(h.max); }
  }
  const formMasse = m;
  if (m <= 0) { m = 0; s.fill(0); C.forEach((z) => z.fill(0)); } // WARUM: negative Masse ergäbe Unsinn bei Schwerpunkt/Trägheit
  const unbekannt = [];
  for (const e of bauteilListe(form)) {
    const d = katalog[e.b.typ];
    if (!d) { if (!e.kopie) unbekannt.push(e.b); continue; }
    const mb = d.masse ?? 0, p = e.p;
    m += mb; for (let i = 0; i < 3; i++) { s[i] += mb * p[i]; for (let j = 0; j < 3; j++) C[i][j] += mb * p[i] * p[j]; }
  }
  const c = m > 0 ? s.map((v) => v / m) : [0, 0, 0];
  const Cc = C.map((z, i) => z.map((v, j) => v - m * c[i] * c[j]));
  const traegheit = [Cc[1][1] + Cc[2][2], Cc[0][0] + Cc[2][2], Cc[0][0] + Cc[1][1]].map((v) => Math.max(v, 0));
  const laenge = zmin.length ? Math.max(...[0, 1, 2].map((i) => Math.max(...zmax.map((q) => q[i])) - Math.min(...zmin.map((q) => q[i])))) : 0;
  return { masse: m, schwerpunkt: c, traegheit, formMasse, laenge, unbekannt, form };
}

// ---------------- Flugwerte ----------------
const r3 = (x) => Math.round(x * 1000) / 1000 + 0;
const klemme = (x, a, b) => Math.min(b, Math.max(a, x));
/** Zwischen „halbes Bollwerk“ und Ambos (E5); WARUM min/max: bei manchen Größen ist das Bollwerk der größere Wert. */
const grenze = (x, b, a) => klemme(x, Math.min(0.5 * b, a), Math.max(0.5 * b, a));
/** Log-Interpolation Bollwerk ↔ Ambos über die Wendigkeit w (0 = Bollwerk, 1 = Ambos) — bleibt immer positiv. */
const eich = (b, a, w) => b * Math.pow(a / b, w);

/** Roh-Drehbeschleunigung τ/I je Achse für Massen + Bauteilliste (auch für die Eichung unten). */
function drehRoh(mw, steuer) {
  const c = mw.schwerpunkt, tau = [0, 0, 0];
  for (const { p, F } of steuer) {
    const r = p.map((v, i) => v - c[i]);
    // WARUM Abstand zur Achse: der Block hat Düsen in alle Richtungen und schiebt immer senkrecht zum Hebel
    tau[0] += F * Math.hypot(r[1], r[2]); tau[1] += F * Math.hypot(r[0], r[2]); tau[2] += F * Math.hypot(r[0], r[1]);
  }
  return { tau, alpha: tau.map((t, i) => (mw.traegheit[i] > 0 ? t / mw.traegheit[i] : 0)) };
}

const ACHSE = ['nicken', 'gieren', 'rollen'];
const NAME = { nicken: 'Nicken', gieren: 'Gieren', rollen: 'Rollen' };

export function flugwerte(roh, katalog = ANTRIEBE) {
  const mw = massenwerte(roh, katalog), { form } = mw;
  const meldungen = [];
  const melde = (code, stufe, text, extra = {}) => meldungen.push({ code, stufe, text, ...extra });
  for (const b of mw.unbekannt) melde('unbekannt', 'warnung', `Bauteil ${b.id}: unbekannter Typ „${b.typ}“ — zählt nicht mit`, { bauteil: b.id });

  // --- Antriebe sammeln (Spiegelkopien mit) ---
  const haupt = [], steuer = [], falsch = new Set();
  for (const e of bauteilListe(form)) {
    const d = katalog[e.b.typ], art = antriebArt(d);
    if (art === 'steuer') steuer.push({ p: e.p, F: d.schub, b: e.b });
    else if (art === 'haupt') {
      if (e.n[0] === 0 && e.n[1] === 0 && e.n[2] === -1) haupt.push({ p: e.p, F: d.schub, b: e.b });
      else if (!falsch.has(e.b.id)) { falsch.add(e.b.id); melde('antrieb_flaeche', 'fehler', `${d.name} (Bauteil ${e.b.id}) muss mit der Düse nach hinten zeigen — sitzt auf einer anderen Fläche und schiebt nicht`, { bauteil: e.b.id }); }
    }
  }
  const M = mw.masse, c = mw.schwerpunkt;
  const schub = haupt.reduce((a, h) => a + h.F, 0);
  const schubpunkt = schub > 0 ? [0, 1, 2].map((i) => r3(haupt.reduce((a, h) => a + h.F * h.p[i], 0) / schub)) : null;

  if (mw.formMasse <= 0) melde('masse_null', 'fehler', mw.formMasse < 0 ? 'Minus-Körper schneiden mehr weg, als da ist — die Form hat keine Masse' : 'Die Form hat keine Masse — mindestens ein Plus-Körper nötig');
  if (!haupt.length) melde('kein_antrieb', 'fehler', 'Kein Haupttriebwerk am Heck — ohne Antrieb fliegt nichts (Bauteil „Haupttriebwerk“ auf die Heckfläche setzen)');
  const aRoh = M > 0 ? schub / M : 0;
  if (haupt.length && aRoh < EICHUNG.zuSchwach) melde('zu_schwach', 'fehler', `Zu schwach: ${aRoh.toFixed(1)} m/s² Beschleunigung (mindestens ${EICHUNG.zuSchwach}) — mehr Triebwerke oder weniger Masse`);
  if (!steuer.length) melde('keine_steuerduesen', 'warnung', 'Keine Manöverdüsen — das Schiff dreht und versetzt nur träge (Notbetrieb)');
  else if (mw.laenge > 0) {
    const mittel = steuer.reduce((a, s) => a + Math.hypot(...s.p.map((v, i) => v - c[i])), 0) / steuer.length;
    if (mittel < EICHUNG.steuerNah * mw.laenge) melde('steuer_am_schwerpunkt', 'warnung', `Manöverdüsen sitzen nah am Schwerpunkt (im Mittel ${mittel.toFixed(0)} m) — weit vorn und hinten drehen sie viel besser`, { bauteil: steuer[0].b.id });
  }

  // --- Fahrt ---
  const aVor = grenze(aRoh, B.aVor, A.aVor);
  const w = Math.log(aVor / B.aVor) / Math.log(A.aVor / B.aVor); // Wendigkeit: 0 = Bollwerk, 1 = Ambos
  const vMax = grenze(EICHUNG.vProWurzelA * Math.sqrt(aVor), B.vMax, A.vMax);
  const steuerF = steuer.reduce((a, s) => a + s.F, 0);
  const deckung = M > 0 ? klemme(steuerF / (EICHUNG.querAnteil * aVor * M), 0, 1) : 0;
  const aQuer = grenze(EICHUNG.querAnteil * aVor * deckung, B.aQuer, A.aQuer);

  // --- Drehung + Schubversatz ---
  const { tau, alpha } = drehRoh(mw, steuer);
  // Versatz: Schub parallel zu +Z am Hebel (x, y) → Drehmoment um X (nicken) aus y, um Y (gieren) aus x
  const versatz = [haupt.reduce((a, h) => a + h.F * (h.p[1] - c[1]), 0), haupt.reduce((a, h) => a + h.F * (h.p[0] - c[0]), 0), 0].map(Math.abs);
  const drehBeschl = {}, drehMax = {};
  let schlimmst = 0, schlimmAchse = null, hebel = 0;
  ACHSE.forEach((ax, i) => {
    // WARUM Mindestmaß: Rundungsreste dürfen bei symmetrischen Schiffen keine Meldung auslösen
    const anteil = versatz[i] <= schub * EICHUNG.versatzHebel ? 0 : tau[i] > 0 ? versatz[i] / tau[i] : Infinity;
    const h = schub > 0 ? versatz[i] / schub : 0;
    // Achse für die Meldung: die mit dem größten Anteil, bei gleichem Anteil die mit dem längeren Hebel
    if (anteil > schlimmst || (anteil === schlimmst && h > hebel)) schlimmAchse = ax;
    schlimmst = Math.max(schlimmst, anteil); hebel = Math.max(hebel, h);
    const roh = EICHUNG.drehK[ax] * Math.pow(alpha[i], EICHUNG.drehExp) * klemme(1 - anteil, 0, 1);
    drehBeschl[ax] = r3(grenze(roh, B.drehBeschl[ax], A.drehBeschl[ax]));
    drehMax[ax] = r3(grenze(drehBeschl[ax] * EICHUNG.drehMaxFaktor[ax], B.drehMax[ax], A.drehMax[ax]));
  });
  // WARUM Warnung schon ab dem Hebel: starke Manöverdüsen gleichen fast jeden Versatz aus — schief gebaut ist es trotzdem
  if (hebel > EICHUNG.versatzHebel) {
    const fehler = schlimmst >= EICHUNG.versatzFehler;
    const text = `Schub greift ${hebel.toFixed(1)} m neben dem Schwerpunkt an (${NAME[schlimmAchse]}) — ${Number.isFinite(schlimmst) ? 'braucht ' + Math.round(schlimmst * 100) + ' % der Manöverdüsen' : 'ohne Manöverdüsen nicht auszugleichen'}`
      + (fehler ? ': das Schiff dreht sich unter Schub weg' : ', kostet Wendigkeit') + ' — Triebwerke symmetrisch setzen';
    melde('schub_versatz', fehler ? 'fehler' : 'warnung', text, haupt.length ? { bauteil: haupt[0].b.id } : {});
  }

  const hp = EICHUNG.hpBezug.hp * Math.pow(Math.max(M, 1) / EICHUNG.hpBezug.masse, EICHUNG.hpBezug.exp);
  const werte = {
    vMax: r3(vMax),
    vRueck: r3(grenze(EICHUNG.vRueckAnteil * vMax, B.vRueck, A.vRueck)),
    vQuer: r3(grenze(EICHUNG.vQuerAnteil * vMax, B.vQuer, A.vQuer)),
    nachbrenner: B.nachbrenner,
    aVor: r3(aVor),
    aRueck: r3(grenze(EICHUNG.rueckAnteil * aVor, B.aRueck, A.aRueck)),
    aQuer: r3(aQuer),
    aDaempfer: r3(grenze(EICHUNG.daempferFaktor * vMax * drehMax.gieren, B.aDaempfer, A.aDaempfer)),
    regler: r3(eich(B.regler, A.regler, w)),
    drehMax, drehBeschl,
    drehRegler: r3(eich(B.drehRegler, A.drehRegler, w)),
    hebelRate: r3(eich(B.hebelRate, A.hebelRate, w)),
    hebelMin: B.hebelMin,
    // WARUM eigene Grenzen: beim Bollwerk ist hp der größere Wert — halbes Ambos … doppeltes Bollwerk
    hpMax: Math.round(klemme(hp, 0.5 * A.hpMax, 2 * B.hpMax)),
    ...KOLLISION,
  };
  return { werte, masse: r3(M), schwerpunkt: c.map(r3), schubpunkt, schub, meldungen };
}

// ---------------- Eichung an der Bollwerk-Bezugsform (E6) ----------------
/** Bezugsformen (Protokoll R19, E6) — auch für Tests. */
export function bezugsform(art) {
  const Q = (L, b, h) => ({ id: 0, typ: 'quader', op: 'plus', mat: 'rumpf', pos: [0, 0, 0], dreh: [0, 0, 0], spiegel: [],
    spanten: [{ z: -L / 2, b, h, rundung: 0, fase: 0 }, { z: L / 2, b, h, rundung: 0, fase: 0 }] });
  const T = (id, typ, p, n) => ({ id, typ, p, n, spiegel: [] });
  if (art === 'ambos') return { name: 'Ambos-artig', koerper: [Q(150, 14, 10)], andock: [], bauteile: [
    T(1, 'triebwerk_m', [3, 0, -75], [0, 0, -1]), T(2, 'triebwerk_m', [-3, 0, -75], [0, 0, -1]),
    T(3, 'steuer', [0, 5, 65], [0, 1, 0]), T(4, 'steuer', [0, -5, 65], [0, -1, 0]),
    T(5, 'steuer', [0, 5, -65], [0, 1, 0]), T(6, 'steuer', [0, -5, -65], [0, -1, 0])] };
  return { name: 'Bollwerk-artig', koerper: [Q(255, 21, 15)], andock: [], bauteile: [
    ...[[5, 4], [-5, 4], [5, -4], [-5, -4]].map(([x, y], i) => T(i + 1, 'triebwerk_l', [x, y, -127.5], [0, 0, -1])),
    T(5, 'steuer', [0, 7.5, 110], [0, 1, 0]), T(6, 'steuer', [0, -7.5, 110], [0, -1, 0]),
    T(7, 'steuer', [0, 7.5, -110], [0, 1, 0]), T(8, 'steuer', [0, -7.5, -110], [0, -1, 0])] };
}
// WARUM aus der Bezugsform gerechnet statt eingetippt: ändert jemand DICHTE oder die Antriebe, bleibt das Bollwerk geeicht
{
  const mw = massenwerte(bezugsform('bollwerk'), ANTRIEBE);
  const st = bauteilListe(mw.form).filter((e) => antriebArt(ANTRIEBE[e.b.typ]) === 'steuer').map((e) => ({ p: e.p, F: ANTRIEBE[e.b.typ].schub }));
  const { alpha } = drehRoh(mw, st);
  ACHSE.forEach((ax, i) => { EICHUNG.drehK[ax] = B.drehBeschl[ax] / Math.pow(alpha[i], EICHUNG.drehExp); });
}

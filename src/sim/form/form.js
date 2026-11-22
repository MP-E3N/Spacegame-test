// ZWECK: Form-Werkstatt (Runde 16) — Datenmodell selbst modellierter Formen, Profil-Mathematik (eckig ↔ gefast ↔ rund)
//        und Umwandlung einer Form in ein Werft-Modul. Rein rechnend: ohne three, ohne DOM, ohne Zufall.
// LIEFERT: PROFIL_N · profilPunkte(spant) · VORLAGEN · neuerKoerper(vorlage, id) · normalisiere(form) · pruefe(form)
//          · koerperMatrix(k) · koerperListe(form) (mit Spiegelkopien) · huelle(k) · volumen(k) · formZuModul(form)
//          · formId(name) · DICHTE · VERSION
// REGEL (Protokoll R16):
//   Form   { name, version, art, koerper: [Körper], andock: [Punkt wie Werft E1/E2/E9] }
//   Körper { id, typ, op: 'plus'|'minus', mat, pos: [x,y,z], dreh: [rx,ry,rz] (Grad, Reihenfolge X→Y→Z), spiegel,
//            spanten: [Spant] (z aufsteigend, mind. 2) }
//   Spant  { z, b, h, x?, y?, rundung (0..1), fase (0..1) } — b/h = VOLLE Breite/Höhe (anders als TEILE der Werft!)
//   Körper-Koordinaten: Loft entlang +Z, Querschnitt in X/Y. Form-Koordinaten wie das Schiff: +Z Bug, +X Backbord, +Y oben.
//   spiegel: true → zusätzliche Kopie an der Ebene x = 0 (Schiffe sind symmetrisch; spart die Hälfte der Arbeit).

export const VERSION = 1;
export const PROFIL_N = 32;              // Punkte je Querschnitt (4 Ecken × 8) — gleich für alle Spanten → Lofts morphen sauber
const ECKE = PROFIL_N / 4;
const MIN_EINZUG = 0.03;                 // m — WARUM: ganz scharfe Ecken ergäben doppelte Punkte (entartete Dreiecke, CSG stolpert)
export const DICHTE = 0.08;              // t je m³ umbauten Raums (Rumpf ist hohl) — abgeglichen mit rumpf_m_lang (≈ 940 t)

/**
 * Querschnitt eines Spants als geschlossener Umlauf (gegen den Uhrzeigersinn, Start rechts oben), PROFIL_N Punkte.
 * Jede Ecke: Einzug e = max(rundung, fase) · min(b, h)/2; Form zwischen Fase (gerade) und Rundung (Viertelkreis)
 * gemischt im Verhältnis rundung : fase. rundung 1 bei b = h → Kreis; fase 0,3 → Achteck wie NORM der Werft.
 */
export function profilPunkte(s) {
  const w = s.b / 2, h = s.h / 2, m = Math.min(w, h);
  const r = klemme(s.rundung ?? 0), f = klemme(s.fase ?? 0);
  const e = Math.max(MIN_EINZUG, Math.max(r, f) * m);
  const mix = r + f > 0 ? r / (r + f) : 0; // 1 = Bogen, 0 = Fase
  const ox = s.x ?? 0, oy = s.y ?? 0, aus = [];
  const zeichen = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = zeichen[i], cx = sx * (w - e), cy = sy * (h - e);
    const a0 = i * Math.PI / 2, a1 = a0 + Math.PI / 2;
    const p0 = [cx + e * Math.cos(a0), cy + e * Math.sin(a0)], p1 = [cx + e * Math.cos(a1), cy + e * Math.sin(a1)];
    for (let j = 0; j < ECKE; j++) {
      const t = j / (ECKE - 1), a = a0 + t * Math.PI / 2;
      const bogen = [cx + e * Math.cos(a), cy + e * Math.sin(a)], gerade = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      aus.push([ox + gerade[0] + (bogen[0] - gerade[0]) * mix, oy + gerade[1] + (bogen[1] - gerade[1]) * mix]);
    }
  }
  return aus;
}
const klemme = (x, a = 0, b = 1) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : 0));

/** Fläche eines Querschnitts (Gaußsche Trapezformel). */
export function profilFlaeche(s) {
  const p = profilPunkte(s); let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a) / 2;
}

// ---------------- Vorlagen (Palette der Werkstatt) ----------------
const S = (z, b, h, rundung = 0, fase = 0, y = 0, x = 0) => ({ z, b, h, rundung, fase, ...(y && { y }), ...(x && { x }) });
export const VORLAGEN = {
  quader: { name: 'Quader', spanten: [S(-5, 10, 6), S(5, 10, 6)] },
  platte: { name: 'Panzerplatte', spanten: [S(-6, 8, 1, 0, 0.5), S(6, 8, 1, 0, 0.5)] },
  trapez: { name: 'Trapez', spanten: [S(-5, 12, 6, 0, 0.2), S(5, 6, 4, 0, 0.2)] },
  keil: { name: 'Keil', spanten: [S(-6, 10, 8, 0, 0.1), S(6, 10, 1, 0, 0.1, -3.5)] },
  zylinder: { name: 'Zylinder', spanten: [S(-5, 6, 6, 1), S(5, 6, 6, 1)] },
  kegel: { name: 'Kegelstumpf', spanten: [S(-4, 8, 8, 1), S(4, 4, 4, 1)] },
  rumpf: { name: 'Rumpf (eckig → rund)', spanten: [S(-20, 16, 12, 0, 0.3), S(-6, 18, 13, 0, 0.3), S(8, 16, 12, 0.5, 0.2), S(20, 10, 8, 1, 0)] },
  // WARUM Anschluss-Vorlagen: passen exakt auf die Normquerschnitte der Werft (M w10/h8, L w18/h13, fase 0,3; dort HALBE Maße)
  anschluss_m: { name: 'Rumpf-Anschluss M', spanten: [S(-10, 20, 16, 0, 0.3), S(10, 20, 16, 0, 0.3)] },
  anschluss_l: { name: 'Rumpf-Anschluss L', spanten: [S(-10, 36, 26, 0, 0.3), S(10, 36, 26, 0, 0.3)] },
};

export function neuerKoerper(vorlage, id, { pos = [0, 0, 0], op = 'plus', mat = 'rumpf' } = {}) {
  const v = VORLAGEN[vorlage] ?? VORLAGEN.quader;
  return { id, typ: VORLAGEN[vorlage] ? vorlage : 'quader', op, mat, pos: [...pos], dreh: [0, 0, 0], spiegel: false, spanten: v.spanten.map((s) => ({ ...s })) };
}

// ---------------- Prüfen / Normalisieren ----------------
const MATERIALIEN = ['rumpf', 'dunkel', 'metall', 'duese', 'schacht', 'warn'];
const ARTEN = ['kommando', 'bug', 'rumpf', 'uebergang', 'heck', 'hangar', 'anbau', 'turm'];
export const GRENZEN = { koerper: 64, spanten: 24, mass: 400 };

/** Fehlende Felder ergänzen, Zahlen klemmen, Spanten nach z sortieren. Ändert die Eingabe nicht. */
export function normalisiere(form) {
  const k = Array.isArray(form?.koerper) ? form.koerper : [];
  return {
    name: String(form?.name ?? 'Form').slice(0, 40), version: VERSION,
    art: ARTEN.includes(form?.art) ? form.art : 'anbau',
    koerper: k.slice(0, GRENZEN.koerper).map((x, i) => ({
      id: Number.isInteger(x?.id) ? x.id : i,
      typ: String(x?.typ ?? 'quader'), op: x?.op === 'minus' ? 'minus' : 'plus',
      mat: MATERIALIEN.includes(x?.mat) ? x.mat : 'rumpf',
      pos: vec(x?.pos), dreh: vec(x?.dreh).map((g) => ((g % 360) + 360) % 360), spiegel: !!x?.spiegel,
      spanten: (Array.isArray(x?.spanten) ? x.spanten : []).slice(0, GRENZEN.spanten).map((s) => ({
        z: zahl(s?.z), b: klemme(zahl(s?.b, 1), 0.1, GRENZEN.mass), h: klemme(zahl(s?.h, 1), 0.1, GRENZEN.mass),
        x: zahl(s?.x), y: zahl(s?.y), rundung: klemme(s?.rundung), fase: klemme(s?.fase),
      })).sort((a, b) => a.z - b.z),
    })),
    andock: (Array.isArray(form?.andock) ? form.andock : []).map((p, i) => ({ ...p, id: String(p?.id ?? 'p' + i) })),
  };
}
const zahl = (x, d = 0) => (Number.isFinite(x) ? x : d);
const vec = (v) => [0, 1, 2].map((i) => zahl(v?.[i]));

/** Meldungen wie die Werft: { code, stufe, text, id? }. */
export function pruefe(form) {
  const m = [], f = (code, text, id) => m.push({ code, stufe: 'fehler', text, ...(id !== undefined && { id }) });
  const w = (code, text, id) => m.push({ code, stufe: 'warnung', text, ...(id !== undefined && { id }) });
  if (!form.koerper.length) w('leer', 'Noch kein Körper — links eine Vorlage wählen');
  if (!form.koerper.some((k) => k.op === 'plus')) f('kein_plus', 'Mindestens ein Körper muss „Plus“ sein (Minus schneidet nur aus)');
  const ids = new Set();
  for (const k of form.koerper) {
    if (ids.has(k.id)) f('id_doppelt', `Körper-Nummer ${k.id} doppelt`, k.id);
    ids.add(k.id);
    if (k.spanten.length < 2) f('zu_wenig_spanten', 'Ein Körper braucht mindestens 2 Spanten', k.id);
    for (let i = 1; i < k.spanten.length; i++) if (k.spanten[i].z - k.spanten[i - 1].z < 0.05) f('spanten_gleich', 'Zwei Spanten liegen aufeinander', k.id);
  }
  if (!form.andock.length) w('kein_punkt', 'Keine Andockpunkte — in der Werft nur als Startteil nutzbar');
  return m;
}

// ---------------- Lage eines Körpers ----------------
const RAD = Math.PI / 180;
/** 3×3-Drehmatrix (zeilenweise) aus Euler-Winkeln in Grad, Reihenfolge X, dann Y, dann Z (wie three 'XYZ'). */
export function drehMatrix([rx, ry, rz]) {
  const [a, b, c] = [rx * RAD, ry * RAD, rz * RAD];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // three Euler 'XYZ': M = Rx · Ry · Rz
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
/** { m, t, spiegel } — Form-Punkt = (spiegel ? Sx : I) · (m · p + t), Sx = Spiegelung an x = 0. */
export const koerperMatrix = (k, gespiegelt = false) => ({ m: drehMatrix(k.dreh), t: k.pos, spiegel: gespiegelt });
export function wendeK(lage, p) {
  const q = [0, 1, 2].map((i) => lage.m[i][0] * p[0] + lage.m[i][1] * p[1] + lage.m[i][2] * p[2] + lage.t[i]);
  if (lage.spiegel) q[0] = -q[0];
  return q;
}
/** Alle Körper samt Spiegelkopien: [{ k, lage }]. */
export const koerperListe = (form) => form.koerper.flatMap((k) => [{ k, lage: koerperMatrix(k) }, ...(k.spiegel ? [{ k, lage: koerperMatrix(k, true) }] : [])]);

/** Achsparallele Hülle eines Körpers in Form-Koordinaten (alle Profilpunkte aller Spanten). */
export function huelle(k, lage = koerperMatrix(k)) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const s of k.spanten) for (const [x, y] of profilPunkte(s)) {
    const p = wendeK(lage, [x, y, s.z]);
    for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
  }
  return { min, max };
}
/** Volumen eines Körpers (Querschnittsflächen trapezförmig über z gemittelt — genau genug für die Masse). */
export function volumen(k) {
  let v = 0;
  for (let i = 1; i < k.spanten.length; i++) v += (profilFlaeche(k.spanten[i - 1]) + profilFlaeche(k.spanten[i])) / 2 * (k.spanten[i].z - k.spanten[i - 1].z);
  return v;
}

// ---------------- Form → Werft-Modul ----------------
export const formId = (name) => 'form_' + String(name).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');

/**
 * Werft-Modul aus einer Form (Werft E1–E9). Geometrie liefert die Grafik (src/grafik/form/*) über die Modul-Id.
 * Hüllquader und Kugeln nur aus Plus-Körpern; Masse = Volumen (Plus − Minus) · DICHTE.
 */
export function formZuModul(roh) {
  const form = normalisiere(roh);
  const plus = koerperListe(form).filter((x) => x.k.op === 'plus');
  const quader = plus.map(({ k, lage }) => huelle(k, lage));
  const kugeln = quader.map((q) => {
    const c = [0, 1, 2].map((i) => (q.min[i] + q.max[i]) / 2), d = [0, 1, 2].map((i) => (q.max[i] - q.min[i]) / 2);
    return { x: c[0], y: c[1], z: c[2], r: Math.max(0.5, Math.hypot(...d) * 0.8) };
  });
  const vol = koerperListe(form).reduce((s, { k }) => s + (k.op === 'plus' ? 1 : -1) * volumen(k), 0);
  const andock = form.andock.map((p) => {
    const n = vec(p.n), u = p.u ? vec(p.u) : (Math.abs(n[1]) === 1 ? [0, 0, 1] : [0, 1, 0]);
    return { id: p.id, p: vec(p.p), n, u, groesse: p.groesse ?? 'S', art: p.art ?? 'anbau', ...(p.stecker && { stecker: true }),
      dreh: Array.isArray(p.dreh) ? p.dreh : (p.art ?? 'anbau') === 'rumpf' ? [0, 2] : [0, 1, 2, 3] };
  });
  return { id: formId(form.name), name: form.name, art: form.art, eigen: true, teile: [], quader, kugeln, andock,
    werte: { masse: Math.round(Math.max(0, vol) * DICHTE) } };
}

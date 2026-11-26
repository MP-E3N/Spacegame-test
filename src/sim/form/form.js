// ZWECK: Form-Werkstatt (Runde 16) — Datenmodell selbst modellierter Formen, Profil-Mathematik (eckig ↔ gefast ↔ rund)
//        und Umwandlung einer Form in ein Werft-Modul. Rein rechnend: ohne three, ohne DOM, ohne Zufall.
// LIEFERT: PROFIL_N · profilPunkte(spant) · VORLAGEN · neuerKoerper(vorlage, id) · normalisiere(form) · pruefe(form)
//          · koerperMatrix(k) · koerperListe(form) (mit Spiegelkopien) · huelle(k) · volumen(k) · formZuModul(form)
//          · formId(name) · koerperSchluessel(k) · DICHTE · VERSION
//          Runde 17: skizzenKoerper (Fläche zeichnen → ziehen) · alsPunkte · setzePunkt · fuegePunktEin · loeschePunkt
//          (Punkte an Kanten) · umrissAusPunkten · spiegelKoerper (eigene Spiegelkopie) · eulerAusMatrix · ACHSEN · NAMEN
//          Runde 17b: verschiebePunkte · fuegeSpantEin · loescheSpant · klappeKoerper (Umklappen) · Körper-Feld fest (fixiert)
// REGEL (Protokoll R16):
//   Form   { name, version, art, koerper: [Körper], andock: [Punkt wie Werft E1/E2/E9] }
//   Körper { id, typ, op: 'plus'|'minus', mat, pos: [x,y,z], dreh: [rx,ry,rz] (Grad, Reihenfolge X→Y→Z), spiegel,
//            spanten: [Spant] (z aufsteigend, mind. 2) }
//   Spant  { z, b, h, x?, y?, rundung (0..1), fase (0..1), p? } — b/h = VOLLE Breite/Höhe (anders als TEILE der Werft!)
//          p (Runde 17): eigener Umriss [[u, v], …] (3–64 Punkte), relativ zum Spant: Punkt = (x + u·b, y + v·h);
//          die Werkstatt hält u, v im Bereich −0,5 … 0,5 (Umriss füllt b × h genau). Mit p gelten rundung/fase nicht.
//          Hat Spant 0 ein p, haben ALLE Spanten eines mit gleich vielen Punkten (i-ter Punkt → i-ter Punkt im Loft).
//   Körper-Koordinaten: Loft entlang +Z, Querschnitt in X/Y. Form-Koordinaten wie das Schiff: +Z Bug, +X Backbord, +Y oben.
//   spiegel: [] | ['x'] | ['x', 'z'] … → verbundene Kopien an den Ebenen x = 0 / y = 0 / z = 0 (alle Kombinationen:
//            zwei Ebenen = 3 Kopien). Altes true = ['x']. Schiffe sind symmetrisch; spart die Hälfte der Arbeit.

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
  if (s.p) { const ox = s.x ?? 0, oy = s.y ?? 0; return s.p.map(([u, v]) => [ox + u * s.b, oy + v * s.h]); } // eigener Umriss (R17)
  const w = zahl(s.b, 1) / 2, h = zahl(s.h, 1) / 2, m = Math.min(w, h);
  const r = klemme(s.rundung ?? 0), f = klemme(s.fase ?? 0);
  // WARUM ≤ m − MIN_EINZUG: sonst fallen Eck-Ende und nächster Eck-Anfang zusammen (Zylinder: Kanten der Länge 0, Prüfer R16)
  const e = Math.min(m - MIN_EINZUG, Math.max(MIN_EINZUG, Math.max(r, f) * m));
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
export const GRENZEN = { koerper: 64, spanten: 24, mass: 400, weit: 1000 };

/** Fehlende Felder ergänzen, Zahlen klemmen, Spanten nach z sortieren. Ändert die Eingabe nicht. */
export function normalisiere(form) {
  const k = Array.isArray(form?.koerper) ? form.koerper : [];
  return {
    name: String(form?.name ?? 'Form').normalize('NFC').slice(0, 40), version: Number.isInteger(form?.version) ? form.version : VERSION,
    art: ARTEN.includes(form?.art) ? form.art : 'anbau',
    koerper: k.slice(0, GRENZEN.koerper).map((x, i) => ({
      id: Number.isInteger(x?.id) ? x.id : i,
      typ: String(x?.typ ?? 'quader'), op: x?.op === 'minus' ? 'minus' : 'plus',
      mat: MATERIALIEN.includes(x?.mat) ? x.mat : 'rumpf',
      pos: vec(x?.pos).map((v) => klemme(v, -GRENZEN.weit, GRENZEN.weit)), dreh: vec(x?.dreh).map((g) => ((g % 360) + 360) % 360), spiegel: spiegelAchsen(x?.spiegel), ...(x?.fest === true && { fest: true }),
      spanten: umrisse((Array.isArray(x?.spanten) ? x.spanten : []).slice(0, GRENZEN.spanten).map((s) => ({
        z: klemme(zahl(s?.z), -GRENZEN.weit, GRENZEN.weit), b: klemme(zahl(s?.b, 1), 0.1, GRENZEN.mass), h: klemme(zahl(s?.h, 1), 0.1, GRENZEN.mass),
        x: klemme(zahl(s?.x), -GRENZEN.mass, GRENZEN.mass), y: klemme(zahl(s?.y), -GRENZEN.mass, GRENZEN.mass), rundung: klemme(s?.rundung), fase: klemme(s?.fase), ...(s?.p !== undefined && { p: s.p }),
      })).sort((a, b) => a.z - b.z)),
    })),
    andock: (Array.isArray(form?.andock) ? form.andock : []).slice(0, 32).map((p, i) => andockPunkt(p, i)),
  };
}
const zahl = (x, d = 0) => (Number.isFinite(x) ? x : d);
const raster = (v) => Math.round(v * 2) / 2 + 0; // + 0: kein −0
/** Eigener Umriss gültig? Liste aus 3–64 Paaren endlicher Zahlen. */
const umrissOk = (p) => Array.isArray(p) && p.length >= 3 && p.length <= 64 && p.every((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]));
const rp = (x) => Math.round(x * 1e6) / 1e6 + 0; // Umriss-Anteile auf 1e-6 (bei 400 m Breite 0,4 mm)
/**
 * Umrisse eines Körpers säubern (Runde 17): Spant 0 entscheidet. Hat er ein gültiges p, bekommen alle Spanten eins mit
 * gleicher Punktzahl (fehlt/passt nicht → Kopie von Spant 0); Umlauf gegen den Uhrzeigersinn (sonst alle umdrehen —
 * WARUM alle: die Zuordnung i-ter Punkt → i-ter Punkt im Loft bleibt erhalten). Ohne p bei Spant 0: alle p weg.
 */
function umrisse(spanten) {
  const p0 = spanten[0]?.p;
  if (!umrissOk(p0)) return spanten.map(({ p, ...s }) => s);
  const n = p0.length, norm = (p) => p.map(([u, v]) => [rp(klemme(u, -1, 1)), rp(klemme(v, -1, 1))]);
  let liste = spanten.map((s) => ({ ...s, p: norm(umrissOk(s.p) && s.p.length === n ? s.p : p0) }));
  if (flaecheV(liste[0].p) < 0) liste = liste.map((s) => ({ ...s, p: [...s.p].reverse() }));
  return liste;
}
/** Vorzeichenbehaftete Fläche (positiv = gegen den Uhrzeigersinn). */
function flaecheV(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
/** Verbundene Spiegelebenen: true → ['x'] (alt), sonst Teilmenge von x, y, z in fester Reihenfolge. */
export const ACHSEN = ['x', 'y', 'z'];
const spiegelAchsen = (s) => (s === true ? ['x'] : Array.isArray(s) ? ACHSEN.filter((a) => s.includes(a)) : []);

/** Achse mit dem größten Anteil (Vorzeichen bleibt); [0,0,0] → +Z. */
function einrasten(v) {
  const a = vec(v), i = [0, 1, 2].reduce((b, j) => (Math.abs(a[j]) > Math.abs(a[b]) ? j : b), 2), aus = [0, 0, 0];
  aus[i] = a[i] < 0 ? -1 : 1;
  return aus;
}
/**
 * Andockpunkt säubern (Prüfer R16): p aufs 0,5-m-Raster, n und u auf Achsen eingerastet, u ⟂ n (sonst Standard),
 * Größe/Art aus der Werft-Liste, Stecker nur bei art ≠ rumpf, dreh nur 0..3.
 */
function andockPunkt(p, i) {
  const n = einrasten(p?.n);
  let u = p?.u ? einrasten(p.u) : null;
  if (!u || u.every((x, j) => Math.abs(x) === Math.abs(n[j]))) u = Math.abs(n[1]) === 1 ? [0, 0, 1] : [0, 1, 0];
  const art = ['rumpf', 'anbau', 'turm'].includes(p?.art) ? p.art : 'anbau';
  const dreh = (Array.isArray(p?.dreh) ? p.dreh : art === 'rumpf' ? [0, 2] : [0, 1, 2, 3]).filter((d) => [0, 1, 2, 3].includes(d));
  return { id: String(p?.id ?? 'p' + i).slice(0, 20), p: vec(p?.p).map((x) => raster(klemme(x, -GRENZEN.weit, GRENZEN.weit))), n, u,
    groesse: ['S', 'M', 'L'].includes(p?.groesse) ? p.groesse : 'S', art, ...(p?.stecker && art !== 'rumpf' && { stecker: true }),
    dreh: dreh.length ? dreh : [0] };
}
const vec = (v) => [0, 1, 2].map((i) => zahl(v?.[i]));

/** Meldungen wie die Werft: { code, stufe, text, id? }. */
export function pruefe(form) {
  const m = [], f = (code, text, id) => m.push({ code, stufe: 'fehler', text, ...(id !== undefined && { id }) });
  const w = (code, text, id) => m.push({ code, stufe: 'warnung', text, ...(id !== undefined && { id }) });
  if (form.version > VERSION) f('version', `Form-Version ${form.version} ist neuer als diese Werkstatt (${VERSION})`);
  if (!form.koerper.length) w('leer', 'Noch kein Körper — links eine Vorlage wählen');
  if (!form.koerper.some((k) => k.op === 'plus')) f('kein_plus', 'Mindestens ein Körper muss „Plus“ sein (Minus schneidet nur aus)');
  const ids = new Set();
  for (const k of form.koerper) {
    if (ids.has(k.id)) f('id_doppelt', `Körper-Nummer ${k.id} doppelt`, k.id);
    ids.add(k.id);
    if (k.spanten.length < 2) f('zu_wenig_spanten', 'Ein Körper braucht mindestens 2 Spanten', k.id);
    for (let i = 1; i < k.spanten.length; i++) if (k.spanten[i].z - k.spanten[i - 1].z < 0.05) f('spanten_gleich', 'Zwei Spanten liegen aufeinander', k.id);
    // WARUM (Runde 17): ein Umriss, dessen Kanten sich kreuzen, ergibt Kappen und Loft mit Löchern — meist ein zu weit gezogener Punkt
    if (k.spanten.some((s) => s.p && kreuzt(s.p))) w('umriss_kreuzt', `Körper ${k.id}: Umriss-Kanten kreuzen sich — Punkt zurückziehen`, k.id);
  }
  // WARUM: ein Minus-Körper, der keinen Plus-Körper berührt, schneidet nichts aus — meist ein Versehen (Schiffbauer R16)
  const plus = koerperListe(form).filter((x) => x.k.op === 'plus').map(({ k, lage }) => huelle(k, lage));
  for (const { k, lage } of koerperListe(form).filter((x) => x.k.op === 'minus')) {
    const h = huelle(k, lage);
    if (!plus.some((p) => [0, 1, 2].every((i) => h.min[i] < p.max[i] && p.min[i] < h.max[i]))) w('minus_trifft_nichts', 'Ein Minus-Körper berührt keinen Plus-Körper und schneidet nichts aus', k.id);
  }
  // WARUM (Prüfer R16): ein Körper, der über die Ebene eines Rumpf-Andockpunkts hinausragt, steckt in der Werft im
  // Nachbarteil — die Überschneidungsprüfung der Werft nimmt die Fuge aus und sieht das nicht
  for (const p of form.andock.filter((a) => a.art === 'rumpf')) {
    const ebene = p.p[0] * p.n[0] + p.p[1] * p.n[1] + p.p[2] * p.n[2];
    for (const { k, lage } of koerperListe(form).filter((x) => x.k.op === 'plus')) {
      const h = huelle(k, lage), weit = [0, 1, 2].reduce((sum, i) => sum + (p.n[i] > 0 ? h.max[i] : p.n[i] < 0 ? h.min[i] : 0) * p.n[i], 0);
      if (weit > ebene + 0.01) { w('ragt_ueber_fuge', `Körper ${k.id} ragt ${(weit - ebene).toFixed(1)} m über die Rumpf-Andockfläche „${p.id}“ — steckt in der Werft im Nachbarteil`, k.id); break; }
    }
  }
  if (!form.andock.length) w('kein_punkt', 'Keine Andockpunkte — in der Werft nur als Startteil nutzbar');
  return m;
}

/** Kreuzen sich zwei nicht benachbarte Kanten des geschlossenen Umrisses? */
function kreuzt(p) {
  const n = p.length, o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
    if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
  }
  return false;
}

// ---------------- Lage eines Körpers ----------------
const RAD = Math.PI / 180;
/** cos/sin in Grad; Vielfache von 90° exakt (WARUM: Fugen und Hüllquader der Werft brauchen exakte Lagen, Prüfer R16). */
function cosSin(g) {
  const q = ((g % 360) + 360) % 360;
  if (q % 90 === 0) return [[1, 0], [0, 1], [-1, 0], [0, -1]][q / 90];
  return [Math.cos(q * RAD), Math.sin(q * RAD)];
}
/** 3×3-Drehmatrix (zeilenweise) aus Euler-Winkeln in Grad, Reihenfolge X, dann Y, dann Z (wie three 'XYZ'). */
export function drehMatrix([rx, ry, rz]) {
  const [ca, sa] = cosSin(rx), [cb, sb] = cosSin(ry), [cc, sc] = cosSin(rz);
  // three Euler 'XYZ': M = Rx · Ry · Rz
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
/**
 * { m, t, spiegel } — Form-Punkt = S · (m · p + t). spiegel = null (keine Spiegelung) oder Vorzeichen [sx, sy, sz]
 * (S = diag). gespiegelt: false | true (= an x = 0, alt) | Achsen ['x', 'z'] …
 */
export function koerperMatrix(k, gespiegelt = false) {
  const achsen = gespiegelt === true ? ['x'] : Array.isArray(gespiegelt) ? gespiegelt : [];
  return { m: drehMatrix(k.dreh), t: k.pos, spiegel: achsen.length ? ACHSEN.map((a) => (achsen.includes(a) ? -1 : 1)) : null };
}
export function wendeK(lage, p) {
  const q = [0, 1, 2].map((i) => lage.m[i][0] * p[0] + lage.m[i][1] * p[1] + lage.m[i][2] * p[2] + lage.t[i]);
  if (lage.spiegel) for (let i = 0; i < 3; i++) q[i] *= lage.spiegel[i];
  return q;
}
/** Alle nicht leeren Teilmengen der Spiegelachsen (x → [x]; x, z → [x], [z], [x, z]). */
const teilmengen = (a) => a.reduce((l, x) => [...l, ...l.map((t) => [...t, x])], [[]]).slice(1);
/** Alle Körper samt Spiegelkopien: [{ k, lage }]. */
export const koerperListe = (form) => form.koerper.flatMap((k) => [{ k, lage: koerperMatrix(k) },
  ...teilmengen(spiegelAchsen(k.spiegel)).map((t) => ({ k, lage: koerperMatrix(k, t) }))]);

/** Schlüssel für Zwischenspeicher der Körper-Geometrie (nur was die Form des Lofts bestimmt). */
export const koerperSchluessel = (k) => JSON.stringify(k.spanten);

/** Achsparallele Hülle eines Körpers in Form-Koordinaten (alle Profilpunkte aller Spanten). */
export function huelle(k, lage = koerperMatrix(k)) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const s of k.spanten) for (const [x, y] of profilPunkte(s)) {
    const p = wendeK(lage, [x, y, s.z]);
    for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
  }
  return { min, max };
}
/**
 * Volumen eines Körpers — exakt für den linearen Loft (Prismatoid: h/6 · (A₁ + 4·A_mitte + A₂), A_mitte aus den
 * gemittelten Profilpunkten). WARUM nicht Trapezregel: überschätzte Kegel/Trapeze um bis zu 7 % (Prüfer R16).
 */
export function volumen(k) {
  let v = 0;
  for (let i = 1; i < k.spanten.length; i++) {
    const a = profilPunkte(k.spanten[i - 1]), b = profilPunkte(k.spanten[i]);
    const m = a.map((p, j) => [(p[0] + b[j][0]) / 2, (p[1] + b[j][1]) / 2]);
    v += (k.spanten[i].z - k.spanten[i - 1].z) / 6 * (flaeche(a) + 4 * flaeche(m) + flaeche(b));
  }
  return v;
}
function flaeche(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }

// ---------------- Runde 17: Skizze, Punkte an Kanten, eigene Spiegelkopie ----------------
export const NAMEN = { skizze: 'Skizze', ...Object.fromEntries(Object.entries(VORLAGEN).map(([k, v]) => [k, v.name])) };
const r3 = (x) => Math.round(x * 1000) / 1000 + 0;
const MIN_MASS = 0.1; // m — wie normalisiere (b, h ≥ 0,1)

/** Absolute Umrisspunkte (Körper-XY) → Spant-Felder { b, h, x, y, p } mit p im Bereich −0,5 … 0,5 (Umriss füllt b × h). */
export function umrissAusPunkten(abs) {
  const xs = abs.map((q) => q[0]), ys = abs.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const b = Math.max(MIN_MASS, x1 - x0), h = Math.max(MIN_MASS, y1 - y0), x = (x0 + x1) / 2, y = (y0 + y1) / 2;
  return { b: r3(b), h: r3(h), x: r3(x), y: r3(y), p: abs.map(([u, v]) => [rp((u - x) / b), rp((v - y) / h)]) };
}

/** Euler-Winkel in Grad (Reihenfolge XYZ wie drehMatrix) aus einer Drehmatrix; nahe ganze Grad werden ganz. */
export function eulerAusMatrix(m) {
  const sb = Math.max(-1, Math.min(1, m[0][2])), b = Math.asin(sb);
  let a, c;
  if (Math.abs(sb) < 0.9999999) { a = Math.atan2(-m[1][2], m[2][2]); c = Math.atan2(-m[0][1], m[0][0]); }
  else { a = Math.atan2(m[2][1], m[1][1]); c = 0; }
  return [a, b, c].map((w) => { const g = w / RAD, r = Math.round(g); return (((Math.abs(g - r) < 1e-6 ? r : r3(g)) % 360) + 360) % 360; });
}

/**
 * Körper aus einer gezeichneten Fläche (Skizze → ziehen). punkte: [[s, t], …] in der Zeichenebene (s entlang ex,
 * t entlang ey), Ebene = Punkte mit n · P = d. tiefe: Zuglänge entlang n (negativ = vom Betrachter weg, „nach hinten“).
 * ex, ey, n bilden ein Rechtssystem (n = ex × ey) auf den Achsen. Körper-X/Y = ex/ey, Körper-Z = n.
 */
export function skizzenKoerper({ punkte, ex, ey, n, d = 0, tiefe, id, op = 'plus', mat = 'rumpf' }) {
  const u = umrissAusPunkten(punkte), z0 = Math.min(0, tiefe), z1 = Math.max(0, tiefe);
  const m = [0, 1, 2].map((i) => [ex[i], ey[i], n[i]]); // Spalten = Körperachsen in Form-Koordinaten
  const pos = [0, 1, 2].map((i) => r3(ex[i] * u.x + ey[i] * u.y + n[i] * d));
  const spant = (z) => ({ z: r3(z), b: u.b, h: u.h, x: 0, y: 0, rundung: 0, fase: 0, p: u.p.map((q) => [...q]) });
  return { id, typ: 'skizze', op, mat, pos, dreh: eulerAusMatrix(m), spiegel: [], spanten: [spant(z0), spant(z1)] };
}

/**
 * Körper auf Punkte umstellen (Punkte an Kanten bearbeiten): jeder Spant bekommt seinen Umriss als p. Alle Ecken scharf
 * → 4 Punkte, nur Fasen → 8, sonst die 32 Profilpunkte. Hat der Körper schon Punkte, bleibt er unverändert.
 */
export function alsPunkte(k) {
  if (k.spanten[0]?.p) return k;
  const scharf = k.spanten.every((s) => !(s.rundung > 0) && !(s.fase > 0)), fase = k.spanten.every((s) => !(s.rundung > 0));
  return { ...k, spanten: k.spanten.map((s) => {
    const ox = s.x ?? 0, oy = s.y ?? 0, w = s.b / 2, h = s.h / 2, alle = profilPunkte(s);
    // WARUM eigene Ecken bei „scharf“: profilPunkte zieht jede Ecke um 3 cm ein (MIN_EINZUG) — hier sollen echte Ecken entstehen
    const abs = scharf ? [[w, h], [-w, h], [-w, -h], [w, -h]].map(([a, c]) => [ox + a, oy + c])
      : fase ? [0, 7, 8, 15, 16, 23, 24, 31].map((i) => alle[i]) : alle; // Fasen: Anfang und Ende jeder Ecke
    return { ...s, rundung: 0, fase: 0, ...umrissAusPunkten(abs) };
  }) };
}

/**
 * Punkt j des Spants i auf die Körper-Lage [x, y] setzen. alle: dieselbe Änderung auf alle Spanten (gleiche Form,
 * jeweils in deren Größe) — sonst nur dieser Spant (Übergänge, Verdrehung). Rückgabe: neuer Körper.
 */
export function setzePunkt(k, i, j, [x, y], alle = false) {
  const s = k.spanten[i], abs = profilPunkte(s).map((q) => [...q]); abs[j] = [x, y];
  const neu = umrissAusPunkten(abs);
  return { ...k, spanten: k.spanten.map((t, l) => {
    if (l === i) return { ...t, ...neu };
    if (!alle) return t;
    const fb = t.b / s.b, fh = t.h / s.h;
    return { ...t, p: neu.p.map((q) => [...q]), b: r3(Math.max(MIN_MASS, neu.b * fb)), h: r3(Math.max(MIN_MASS, neu.h * fh)),
      x: r3((t.x ?? 0) + (neu.x - (s.x ?? 0)) * fb), y: r3((t.y ?? 0) + (neu.y - (s.y ?? 0)) * fh) };
  }) };
}
/** Neuer Punkt in der Mitte der Kante j → j+1, in allen Spanten (Form bleibt gleich). Höchstens 64 Punkte. */
export function fuegePunktEin(k, j) {
  if (!k.spanten[0]?.p || k.spanten[0].p.length >= 64) return k;
  return { ...k, spanten: k.spanten.map((s) => { const p = s.p, a = p[j], b = p[(j + 1) % p.length];
    return { ...s, p: [...p.slice(0, j + 1), [rp((a[0] + b[0]) / 2), rp((a[1] + b[1]) / 2)], ...p.slice(j + 1)] }; }) };
}
/** Punkt j in allen Spanten löschen (mindestens 3 bleiben); Umrisse danach wieder auf b × h eingepasst. */
export function loeschePunkt(k, j) {
  if (!k.spanten[0]?.p || k.spanten[0].p.length <= 3) return k;
  return { ...k, spanten: k.spanten.map((s) => ({ ...s, ...umrissAusPunkten(profilPunkte(s).filter((_, l) => l !== j)) })) };
}

/**
 * Punkte in Körper-Koordinaten verschieben (Runde 17b, Ziehen in jeder geraden Ansicht). liste: [{ i (Spant), j (Punkt),
 * d: [dx, dy, dz] }]. dx/dy verschieben den Punkt im Querschnitt, dz verschiebt den GANZEN Spant längs (ein Spant ist
 * eben) — gemittelt über seine Einträge, geklemmt zwischen die Nachbarspanten (≥ 0,1 m Abstand, Reihenfolge bleibt).
 */
export function verschiebePunkte(k, liste) {
  const je = new Map();
  for (const e of liste) { if (!je.has(e.i)) je.set(e.i, []); je.get(e.i).push(e); }
  const sp = k.spanten;
  return { ...k, spanten: sp.map((s, i) => {
    const l = je.get(i); if (!l) return s;
    const abs = profilPunkte(s).map((q) => [...q]);
    for (const { j, d } of l) if (abs[j]) { abs[j][0] += d[0]; abs[j][1] += d[1]; }
    const dz = l.reduce((a, e) => a + (e.d[2] ?? 0), 0) / l.length;
    const lo = i > 0 ? sp[i - 1].z + 0.1 : -GRENZEN.weit, hi = i < sp.length - 1 ? sp[i + 1].z - 0.1 : GRENZEN.weit;
    return { ...s, ...umrissAusPunkten(abs), z: r3(Math.min(hi, Math.max(lo, s.z + dz))) };
  }) };
}
/** Neuer Spant zwischen Spant i und i+1 (gemittelt, Form bleibt gleich) — „Punkt an einer Längskante setzen“. */
export function fuegeSpantEin(k, i) {
  const a = k.spanten[i], b = k.spanten[i + 1];
  if (!a || !b || k.spanten.length >= GRENZEN.spanten) return k;
  const m = (x, y) => r3(((x ?? 0) + (y ?? 0)) / 2);
  const neu = { z: m(a.z, b.z), b: m(a.b, b.b), h: m(a.h, b.h), x: m(a.x, b.x), y: m(a.y, b.y), rundung: m(a.rundung, b.rundung), fase: m(a.fase, b.fase),
    ...(a.p && { p: a.p.map((q, j) => [rp((q[0] + b.p[j][0]) / 2), rp((q[1] + b.p[j][1]) / 2)]) }) };
  // WARUM Umriss aus den gemittelten ABSOLUTEN Punkten: verschiedene b/h der Nachbarn würden die Mitte sonst verzerren
  if (a.p) Object.assign(neu, umrissAusPunkten(profilPunkte(a).map((q, j) => [(q[0] + profilPunkte(b)[j][0]) / 2, (q[1] + profilPunkte(b)[j][1]) / 2])));
  return { ...k, spanten: [...k.spanten.slice(0, i + 1), neu, ...k.spanten.slice(i + 1)] };
}
/** Spant i löschen (mindestens 2 bleiben). */
export const loescheSpant = (k, i) => (k.spanten.length <= 2 ? k : { ...k, spanten: k.spanten.filter((_, l) => l !== i) });

/**
 * Körper an Ort und Stelle umklappen (Runde 17b, „Spiegelung am Objekt selbst“): gespiegelt an der Ebene durch die
 * Mitte seiner eigenen Hülle. Verbundene Spiegelungen und „fest“ bleiben.
 */
export function klappeKoerper(k, achse) {
  const a = ACHSEN.indexOf(achse), neu = spiegelKoerper(k, achse, k.id);
  const h0 = huelle(k), h1 = huelle(neu), mitte = (h) => (h.min[a] + h.max[a]) / 2;
  neu.pos = neu.pos.map((v, i) => (i === a ? r3(v + mitte(h0) - mitte(h1)) : v));
  return { ...neu, spiegel: k.spiegel, ...(k.fest && { fest: true }) };
}

/**
 * Eigenständige Spiegelkopie an der Ebene achse = 0 (x, y oder z). WARUM nicht einfach die Drehung spiegeln: eine
 * Spiegelung ist keine Drehung. Darum wird der Körper in sich an seiner X-Achse gespiegelt (Profil x → −x, Punkt-
 * reihenfolge umgedreht = Umlauf bleibt gegen den Uhrzeigersinn) und dann gedreht: R' = S · R · Sx hat det +1.
 */
export function spiegelKoerper(k, achse, id) {
  const a = ACHSEN.indexOf(achse), R = drehMatrix(k.dreh);
  const m = R.map((zeile, i) => zeile.map((v, j) => v * (i === a ? -1 : 1) * (j === 0 ? -1 : 1)));
  return { ...k, id, spiegel: [], pos: k.pos.map((v, i) => r3(i === a ? -v : v)), dreh: eulerAusMatrix(m),
    spanten: k.spanten.map((s) => ({ ...s, x: r3(-(s.x ?? 0)), ...(s.p && { p: s.p.map(([u, v]) => [rp(-u), v]).reverse() }) })) };
}

// ---------------- Form → Werft-Modul ----------------
export const formId = (name) => 'form_' + (String(name).normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'unbenannt'); // NFC wie normalisiere(); leerer Name → form_unbenannt

/**
 * Werft-Modul aus einer Form (Werft E1–E9). Geometrie liefert die Grafik (src/grafik/form/*) über die Modul-Id.
 * Hüllquader und Kugeln nur aus Plus-Körpern; Masse = Volumen (Plus − Minus) · DICHTE.
 */
export function formZuModul(roh) {
  const form = normalisiere(roh);
  form.koerper = form.koerper.filter((k) => k.spanten.length >= 2); // WARUM: sonst Infinity-Quader/NaN-Kugel in der Werft (Prüfer R16)
  const plus = koerperListe(form).filter((x) => x.k.op === 'plus');
  const quader = plus.map(({ k, lage }) => huelle(k, lage));
  const kugeln = quader.map((q) => {
    const c = [0, 1, 2].map((i) => (q.min[i] + q.max[i]) / 2), d = [0, 1, 2].map((i) => (q.max[i] - q.min[i]) / 2);
    return { x: c[0], y: c[1], z: c[2], r: Math.max(0.5, Math.hypot(...d) * 0.8) };
  });
  const vol = koerperListe(form).reduce((s, { k }) => s + (k.op === 'plus' ? 1 : -1) * volumen(k), 0);
  const andock = form.andock;
  return { id: formId(form.name), name: form.name, art: form.art, eigen: true, teile: [], quader, kugeln, andock,
    duesen: [], werte: { masse: Math.round(Math.max(0, vol) * DICHTE) } };
}

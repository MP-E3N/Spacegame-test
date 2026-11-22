// ZWECK: Schiffs-Baukasten (Runde 15): Entwurf (Baum aus Modulen an Andockpunkten) → Lagen aller Teile, freie Punkte,
//        Meldungen (Fehler/Warnungen), Werte. Rein rechnend: ohne three, ohne DOM, ohne Zufall (CLAUDE.md Regel 1).
// LIEFERT: baue(entwurf, katalog) · andockLage(elternLage, pE, pK, dreh) · kandidaten(bau, katalog, modulId)
//          · LAGEN (24 Drehungen) · EINHEIT · wende(lage, p) · dreheV(m, v) · migriere(entwurf)
//          · naechsteNr(entwurf) · loesche(entwurf, nr) · VERSION
// REGEL (Protokoll R15, E1–E6, E9): Punkt { id, p, n, u, groesse, art, dreh: [..], stecker? } — bei art ≠ rumpf passt
//        nur Buchse (Elternteil) an Stecker (Kind). Andocken: R·n_K = −n_E, R·u_K = u_E,
//        danach `dreh` Vierteldrehungen um n_E (rechtsdrehend). Matrix m zeilenweise, ganzzahlig, det +1.
//        Lage { m, t }: Welt = m·p + t. Ein Teil je Punkt; deckungsgleiche passende Punkte fremder Teile = verbunden.
//        Fehler machen den Entwurf „nicht flugfähig“, er bleibt aber speicherbar (Starfield-Lehre aus der Recherche).

export const VERSION = 1;
export const EINHEIT = { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
const FUGE = 1e-3;   // m — so nah müssen zwei Punkte liegen, um als verbunden zu gelten (Ring-Schluss)
const SCHRUMPF = 0.5; // m — Hüllquader werden je Seite so weit geschrumpft (E5), WARUM: Fasen und Fugen berühren sich

// ---------------- Vektoren / Matrizen (klein, ohne Objekte in heißen Schleifen — hier keine heißen Schleifen) --------
const kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punkt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (a) => [-a[0], -a[1], -a[2]];
const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// WARUM `+ 0`: macht aus −0 eine 0 → Lagen vergleichen sich per JSON gleich
const sauber = (v) => v.map((x) => x + 0);
export const dreheV = (m, v) => sauber([punkt(m[0], v), punkt(m[1], v), punkt(m[2], v)]);
const mal = (a, b) => a.map((zeile) => [0, 1, 2].map((j) => zeile[0] * b[0][j] + zeile[1] * b[1][j] + zeile[2] * b[2][j] + 0));
/** Matrix aus drei Spaltenvektoren. */
const ausSpalten = (a, b, c) => [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]];
const transponiert = (m) => [0, 1, 2].map((i) => [m[0][i], m[1][i], m[2][i]]);
const det = (m) => punkt(m[0], kreuz(m[1], m[2]));
/** Vierteldrehung um die Einheitsachse a: Q = a·aᵀ + [a]× (cos 90° = 0, sin 90° = 1). */
const viertel = (a) => [
  [a[0] * a[0], a[0] * a[1] - a[2], a[0] * a[2] + a[1]],
  [a[1] * a[0] + a[2], a[1] * a[1], a[1] * a[2] - a[0]],
  [a[2] * a[0] - a[1], a[2] * a[1] + a[0], a[2] * a[2]],
];
export const wende = (lage, p) => plus(dreheV(lage.m, p), lage.t);

/** Alle 24 Drehungen des Würfels (vorzeichenbehaftete Permutationsmatrizen mit det +1). */
export const LAGEN = (() => {
  const perm = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], aus = [];
  for (const p of perm) for (let s = 0; s < 8; s++) {
    const m = [0, 1, 2].map((i) => { const z = [0, 0, 0]; z[p[i]] = (s >> i) & 1 ? -1 : 1; return z; });
    if (det(m) === 1) aus.push(m);
  }
  return aus;
})();

/**
 * Lage des Kindes, wenn sein Punkt pK am Punkt pE des Elternteils (Lage elternLage) andockt.
 * @returns { m, t } — Kindpunkt liegt exakt auf dem Elternpunkt, Kind-n zeigt gegen Eltern-n.
 */
export function andockLage(elternLage, pE, pK, dreh = 0) {
  const nE = dreheV(elternLage.m, pE.n), uE = dreheV(elternLage.m, pE.u);
  const ziel = ausSpalten(neg(nE), uE, kreuz(neg(nE), uE));
  const quelle = ausSpalten(pK.n, pK.u, kreuz(pK.n, pK.u));
  let m = mal(ziel, transponiert(quelle)); // WARUM transponiert = invers: Spalten orthonormal
  const q = viertel(nE);
  for (let i = 0; i < ((dreh % 4) + 4) % 4; i++) m = mal(q, m);
  const t = minus(wende(elternLage, pE.p), dreheV(m, pK.p));
  return { m, t: sauber(t) };
}

// ---------------- Entwurf-Helfer (für Editor und Tests) ----------------
/** Ältere Formate anheben. Gibt { entwurf, fehler? } zurück, ändert die Eingabe nicht. */
export function migriere(entwurf) {
  const v = entwurf?.version ?? 1;
  if (!Number.isInteger(v) || v > VERSION) return { entwurf, fehler: `Entwurf-Version ${v} ist neuer als diese Werft (${VERSION})` };
  // Kette für spätere Formate: if (v === 1) { … v = 2 } …
  return { entwurf: { ...entwurf, version: VERSION } };
}
export const naechsteNr = (entwurf) => entwurf.teile.reduce((m, t) => Math.max(m, t.nr), -1) + 1;
/** Neuer Entwurf ohne Teil nr und ohne alle seine Nachkommen. */
export function loesche(entwurf, nr) {
  const weg = new Set([nr]);
  let mehr = true;
  while (mehr) { mehr = false; for (const t of entwurf.teile) if (t.an && weg.has(t.an.nr) && !weg.has(t.nr)) { weg.add(t.nr); mehr = true; } }
  return { ...entwurf, teile: entwurf.teile.filter((t) => !weg.has(t.nr)) };
}

/** Modul im Katalog suchen — auch unter alter Id (`ersetzt`, Prüfer-Vorschlag für umbenannte Module). */
function findeModul(katalog, id) {
  if (katalog[id]) return katalog[id];
  for (const m of Object.values(katalog)) if (m.ersetzt?.includes(id)) return m;
  return null;
}
/** Passt Punkt b (Kind) an Punkt a (Eltern)? Gleiche Größe + Art; außer bei Rumpfflächen nur Buchse an Stecker (E9). */
const passt = (a, b) => a.groesse === b.groesse && a.art === b.art && (a.art === 'rumpf' || (!a.stecker && !!b.stecker));
/** Ring-Schluss: Reihenfolge der beiden Punkte egal. */
const passtBeide = (a, b) => passt(a, b) || passt(b, a);

/** Hüllquader eines Moduls in Weltlage (achsparallel exakt, weil Lagen 90°-Drehungen sind). */
function weltQuader(lage, q, schrumpf) {
  const a = wende(lage, q.min), b = wende(lage, q.max);
  return { min: [0, 1, 2].map((i) => Math.min(a[i], b[i]) + schrumpf), max: [0, 1, 2].map((i) => Math.max(a[i], b[i]) - schrumpf) };
}
const ueberlapp = (a, b) => [0, 1, 2].every((i) => a.min[i] < b.max[i] && b.min[i] < a.max[i]);

/**
 * Entwurf zusammenbauen.
 * @returns {{ teile: {nr, modul, lage}[], freiePunkte: object[], verbunden: [nr, nr][], kugeln, tuerme, duesen,
 *            werte, laenge, breite, hoehe, meldungen: {code, stufe, text, nr?}[], flugfaehig: boolean }}
 */
export function baue(entwurf, katalog) {
  const meldungen = [];
  const fehler = (code, text, nr) => meldungen.push({ code, stufe: 'fehler', text, ...(nr !== undefined && { nr }) });
  const warnung = (code, text, nr) => meldungen.push({ code, stufe: 'warnung', text, ...(nr !== undefined && { nr }) });
  const leer = { teile: [], freiePunkte: [], verbunden: [], kugeln: [], tuerme: [], duesen: [], werte: { masse: 0, panzer: 0, schub: 0, besatzung: 0, teile: 0 },
    laenge: 0, breite: 0, hoehe: 0, meldungen, flugfaehig: false };

  const mig = migriere(entwurf);
  if (mig.fehler) { fehler('version', mig.fehler); return leer; }
  const roh = Array.isArray(entwurf?.teile) ? entwurf.teile : [];

  // --- nr eindeutig, Module bekannt ---
  const nachNr = new Map();
  // WARUM sortiert: Ergebnis darf nicht von der Listenreihenfolge abhängen (Prüfer R15) — Startteil = kleinste nr,
  // bei doppelter nr gewinnt das Teil mit dem kleineren JSON-Text
  const sortiert = [...roh].map((t) => [t, JSON.stringify(t) ?? '']).sort((a, b) => (a[0]?.nr ?? 0) - (b[0]?.nr ?? 0) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map((x) => x[0]);
  for (const t of sortiert) {
    if (!Number.isInteger(t?.nr)) { fehler('nr_doppelt', 'Teil ohne gültige Nummer'); continue; }
    if (nachNr.has(t.nr)) { fehler('nr_doppelt', `Nummer ${t.nr} kommt doppelt vor`, t.nr); continue; }
    nachNr.set(t.nr, t);
  }
  const wurzeln = [...nachNr.values()].filter((t) => !t.an);
  if (wurzeln.length === 0 && nachNr.size) fehler('wurzel', 'Kein Startteil (jedes Teil hängt an einem anderen)');
  for (const w of wurzeln.slice(1)) fehler('wurzel', `Mehr als ein Startteil — Teil ${w.nr} hängt an nichts`, w.nr);

  // --- Baum von der Wurzel aus legen (Reihenfolge der Liste egal) ---
  const kinder = new Map();
  for (const t of nachNr.values()) if (t.an) { if (!kinder.has(t.an.nr)) kinder.set(t.an.nr, []); kinder.get(t.an.nr).push(t); }
  const gelegt = new Map(); // nr → { nr, modul, lage, belegt: Set }
  const kanten = [];
  const lege = (t, lage) => {
    const modul = findeModul(katalog, t.modul);
    gelegt.set(t.nr, { nr: t.nr, modul: modul.id, def: modul, lage, belegt: new Set(t.punkt ? [t.punkt] : []) });
  };
  const offen = [];
  if (wurzeln[0]) {
    if (findeModul(katalog, wurzeln[0].modul)) { lege(wurzeln[0], EINHEIT); offen.push(wurzeln[0].nr); }
    else fehler('modul_unbekannt', `Unbekanntes Modul „${wurzeln[0].modul}“`, wurzeln[0].nr);
  }
  while (offen.length) {
    const eltern = gelegt.get(offen.shift());
    for (const k of (kinder.get(eltern.nr) ?? []).sort((a, b) => a.nr - b.nr)) {
      const modul = findeModul(katalog, k.modul);
      if (!modul) { fehler('modul_unbekannt', `Unbekanntes Modul „${k.modul}“`, k.nr); continue; }
      const pE = eltern.def.andock.find((p) => p.id === k.an.punkt), pK = modul.andock.find((p) => p.id === k.punkt);
      if (!pE || !pK) { fehler('punkt_unbekannt', `Andockpunkt „${!pE ? k.an.punkt : k.punkt}“ gibt es nicht`, k.nr); continue; }
      if (eltern.belegt.has(pE.id)) { fehler('punkt_belegt', `Andockpunkt „${pE.id}“ an Teil ${eltern.nr} ist schon belegt`, k.nr); continue; }
      const dreh = k.dreh ?? 0;
      if (!passt(pE, pK)) fehler('passt_nicht', `${modul.name} passt nicht an diesen Punkt (${pK.groesse}/${pK.art} an ${pE.groesse}/${pE.art})`, k.nr);
      else if (!(pK.dreh ?? [0]).includes(dreh)) fehler('dreh_verboten', `${modul.name}: diese Drehung ist hier nicht erlaubt`, k.nr);
      eltern.belegt.add(pE.id);
      lege(k, andockLage(eltern.lage, pE, pK, dreh));
      kanten.push([eltern.nr, k.nr]);
      offen.push(k.nr);
    }
  }
  // --- nicht gelegte Teile erklären: Zyklus oder fehlender Elternteil ---
  for (const t of nachNr.values()) {
    if (gelegt.has(t.nr) || !t.an || meldungen.some((m) => m.nr === t.nr)) continue;
    const gesehen = new Set([t.nr]); let x = t, zyklus = false;
    while (x?.an) { if (gesehen.has(x.an.nr)) { zyklus = true; break; } gesehen.add(x.an.nr); x = nachNr.get(x.an.nr); }
    if (zyklus) fehler('zyklus', `Teil ${t.nr} hängt im Kreis an sich selbst`, t.nr);
    else if (!x || !nachNr.has(t.an.nr) || meldungen.some((m) => gesehen.has(m.nr))) fehler('eltern_fehlt', `Teil ${t.nr} hängt an einem Teil, das fehlt`, t.nr);
  }

  // --- freie Punkte und Ring-Schluss ---
  const teile = [...gelegt.values()].sort((a, b) => a.nr - b.nr);
  let frei = [];
  for (const g of teile) for (const p of g.def.andock) {
    if (g.belegt.has(p.id)) continue;
    frei.push({ nr: g.nr, punkt: p.id, p: wende(g.lage, p.p), n: dreheV(g.lage.m, p.n), u: dreheV(g.lage.m, p.u), groesse: p.groesse, art: p.art, stecker: !!p.stecker, dreh: p.dreh ?? [0] });
  }
  const zu = new Set();
  for (let i = 0; i < frei.length; i++) for (let j = i + 1; j < frei.length; j++) {
    const a = frei[i], b = frei[j];
    if (a.nr === b.nr || zu.has(i) || zu.has(j) || !passtBeide(a, b) || punkt(a.n, b.n) !== -1) continue;
    const d = minus(a.p, b.p);
    if (punkt(d, d) < FUGE * FUGE) { zu.add(i); zu.add(j); kanten.push([a.nr, b.nr]); }
  }
  frei = frei.filter((_, i) => !zu.has(i));
  for (const f of frei) if (f.art === 'rumpf') warnung('offen_rumpf', `Offene Rumpf-Andockfläche „${f.punkt}“ an Teil ${f.nr}`, f.nr);

  // --- Überschneidung (Hüllquader, Nachbarn ausgenommen) ---
  const nachbar = new Set(kanten.map(([a, b]) => Math.min(a, b) + ':' + Math.max(a, b)));
  const quader = teile.map((g) => (g.def.quader ?? []).map((q) => weltQuader(g.lage, q, SCHRUMPF)));
  for (let i = 0; i < teile.length; i++) for (let j = i + 1; j < teile.length; j++) {
    if (nachbar.has(teile[i].nr + ':' + teile[j].nr)) continue;
    if (quader[i].some((a) => quader[j].some((b) => ueberlapp(a, b)))) {
      fehler('ueberschneidung', `${teile[j].def.name} (Teil ${teile[j].nr}) ragt in ${teile[i].def.name} (Teil ${teile[i].nr})`, teile[j].nr);
    }
  }

  // --- Pflichtteile ---
  const zahl = (art) => teile.filter((g) => g.def.art === art).length;
  if (teile.length) {
    if (!zahl('kommando')) fehler('kein_kommando', 'Kein Kommandomodul — ohne Brücke fliegt nichts');
    if (zahl('kommando') > 1) warnung('mehrere_kommando', 'Mehr als ein Kommandomodul');
    if (!zahl('heck')) fehler('kein_heck', 'Kein Heck mit Triebwerken');
    if (!zahl('turm')) warnung('kein_turm', 'Keine Geschütztürme');
  }

  // --- Werte, Maße, Weltdaten ---
  const werte = { masse: 0, panzer: 0, schub: 0, besatzung: 0, teile: teile.length };
  for (const g of teile) for (const k of ['masse', 'panzer', 'schub', 'besatzung']) werte[k] += g.def.werte?.[k] ?? 0;
  const roheQuader = teile.flatMap((g) => (g.def.quader ?? []).map((q) => weltQuader(g.lage, q, 0)));
  const ausdehnung = (i) => roheQuader.length ? Math.max(...roheQuader.map((q) => q.max[i])) - Math.min(...roheQuader.map((q) => q.min[i])) : 0;

  return {
    teile: teile.map((g) => ({ nr: g.nr, modul: g.modul, lage: g.lage })),
    freiePunkte: frei,
    verbunden: kanten,
    kugeln: teile.flatMap((g) => (g.def.kugeln ?? []).map((k) => { const p = wende(g.lage, [k.x, k.y, k.z]); return { x: p[0], y: p[1], z: p[2], r: k.r, nr: g.nr }; })),
    tuerme: teile.filter((g) => g.def.turm).map((g) => ({ nr: g.nr, typ: g.def.turm.typ, s: g.def.turm.s, lage: g.lage })),
    duesen: teile.flatMap((g) => (g.def.duesen ?? []).map((d) => ({ p: wende(g.lage, d.p), r: d.r, nr: g.nr }))),
    werte, laenge: ausdehnung(2), breite: ausdehnung(0), hoehe: ausdehnung(1),
    meldungen,
    flugfaehig: teile.length > 0 && !meldungen.some((m) => m.stufe === 'fehler'),
  };
}

/**
 * Alle Möglichkeiten, Modul `modulId` an den freien Punkten eines gebauten Schiffs anzudocken (für Geist und Klick).
 * @returns {{ an: {nr, punkt}, punkt, dreh: number[], frei }[]} — `dreh` = erlaubte Drehungen, Lage per andockLage().
 */
export function kandidaten(bau, katalog, modulId) {
  const modul = findeModul(katalog, modulId);
  if (!modul) return [];
  const aus = [];
  for (const f of bau.freiePunkte) for (const pK of modul.andock) {
    if (passt(f, pK)) aus.push({ an: { nr: f.nr, punkt: f.punkt }, punkt: pK.id, dreh: pK.dreh ?? [0], frei: f });
  }
  return aus;
}

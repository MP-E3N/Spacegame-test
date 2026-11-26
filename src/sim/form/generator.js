// ZWECK: Schiffsgenerator der Form-Werkstatt (Runde 20). Aus Seed und wenigen Reglern entsteht eine ganz normale
//        Werkstatt-Form (Körper + Bauteile), voll editierbar und schon beim Bau flugtauglich. Vom a1studmuffin-Generator
//        ist nur der Ablauf übernommen: Rumpf in Abschnitten „ziehen“ → Rücken/Seitenblöcke → Aufbauten → Geschütze
//        oben/unten, Triebwerke hinten.
// LIEFERT: GENERATOR_VERSION · KLASSEN · GENERATOR_REGLER (je { name, min, max, schritt, standard, tipp, text(v, einst) })
//          · standardEinstellung(klasse) → einst · generiere(einst) → normalisierte Form { name, version, art: 'rumpf',
//          koerper, andock: [], bauteile } · grundmuster(einst) → { bug, profil, bruecke, seiten, ruecken } (Anzeige/Tests)
// REGEL: Rein rechnend: kein three, kein DOM, kein Math.random (zufall aus src/sim/zufall.js). Gleiche einst ergibt
//        bitgleiches JSON, und normalisiere(generiere(e)) ändert nichts. Ungültige Eingaben werden geklemmt, nie geworfen.
//        Stil Schwarmfront: kantig, gepanzert, keine Fenster, keine runden Tanks, keine Ausleger (Seitenblöcke und
//        Hangars sitzen IN der Hülle).
//        Klassencharakter (Spieltest R20, v2): eigene Silhouette je Klasse.
//          - Korvette: kurzer, dicker Keil
//          - Fregatte: Mittelweg mit Rückenaufbau
//          - Träger: flacher, breiter Flugdeck-Block mit Hangardecks und großen Öffnungen
//        Vielfalt: der Seed wählt das Grundmuster (Bug, Querschnittsverlauf, Brückenlage, Seitenblöcke, Rücken) und
//        variiert es dann.
//        Flugtauglich per Bau (Protokoll R20):
//          - spiegelsymmetrisch zu x = 0
//          - Haupttriebwerke auf der flachen Heckfläche des Antriebsblocks in Schwerpunkt-Höhe (gerechnet mit
//            massenwerte, dann gesetzt)
//          - Türme nur auf ebenen Decks, Abstände gegen zu_dicht und rohre_kreuzen
//          - Selbsttest mit pruefeGeschuetze; was meldet, fliegt raus
//        Budget: ≤ 28 Körper-Einträge, ≤ 40 inkl. Spiegelkopien, ≤ 5 Minus, ≤ 48 Bauteile.
//        Zahlen auf 1 mm gerundet, dreh nur 0/270°.
//        Teilströme: jede Stufe hat ihren eigenen Zufallsstrom, damit z. B. „aufbauten“ den Hauptrumpf nicht neu würfelt.
//        Dicht verschweißen (Spieltest R20): Körper überlappen um „krumme“ Maße (0,437 m statt 0,4 m). WARUM: auf dem
//        mm-Raster fielen sonst Flächen und Kanten verschiedener Körper zusammen, und das CSG ließ Splitter-Risse stehen.
import { normalisiere, volumen, DICHTE, VERSION } from './form.js';
import { massenwerte, ANTRIEBE } from './flug.js';
import { GESCHUETZE, pruefeGeschuetze } from './geschuetze.js';
import { BAUTEILE } from './bauteile.js';
import { TURM } from '../schiffe/turm.js';
import { zufall } from '../zufall.js';

export const GENERATOR_VERSION = 2;

/**
 * Grundwerte je Klasse; die Regler wirken relativ dazu. breite = Grundbreite / Länge, hoehe = Höhe / Breite.
 * Listen (buege, profile, bruecken, seitenMuster) = Grundmuster, aus denen der Seed wählt. ruecken = Anteil der Seeds
 * mit Rückenaufbau. WARUM diese Maße: die Masse (DICHTE 0,08 t/m³) muss mit höchstens 5 Triebwerken der Klasse auf
 * ≥ 1,6 m/s² kommen (zu_schwach ab 1,5).
 */
export const KLASSEN = {
  korvette: { name: 'Korvette', laenge: [60, 110], breite: 0.2, hoehe: 0.72, abschnitte: [2, 4],
    buege: ['jaeger', 'keil', 'spitz', 'stumpf'], profile: ['buckel', 'keilform', 'gleich', 'mittelschiff'],
    bruecken: ['hinten', 'mitte'], seitenMuster: ['hinten', 'keine', 'mitte'], seitenBreite: [0.1, 0.18], ruecken: 0.35,
    hangar: false, kommando: [0.35, 0.55], massstab: 0.7, deckMitte: true,
    tuerme: 6, aufbauten: 5, triebwerke: 2, groessen: ['triebwerk_s', 'triebwerk_m'], mitte: 'flak' },
  fregatte: { name: 'Fregatte', laenge: [120, 200], breite: 0.13, hoehe: 0.82, abschnitte: [3, 5],
    buege: ['keil', 'hammer', 'schnabel', 'stumpf', 'spitz'], profile: ['gleich', 'buckel', 'mittelschiff', 'eingezogen', 'keilform'],
    bruecken: ['hinten', 'mitte', 'vorn'], seitenMuster: ['zwei', 'mitte', 'hinten', 'vorn'], seitenBreite: [0.12, 0.24], ruecken: 1,
    hangar: false, kommando: [0.3, 0.45], massstab: 1, deckMitte: true,
    tuerme: 10, aufbauten: 7, triebwerke: 3, groessen: ['triebwerk_m', 'triebwerk_l'], mitte: 'schwer' },
  traeger: { name: 'Träger', laenge: [220, 340], breite: 0.12, hoehe: 0.3, abschnitte: [3, 6],
    buege: ['stumpf', 'hammer', 'schnabel', 'keil'], profile: ['gleich', 'mittelschiff', 'eingezogen'],
    bruecken: ['hinten', 'mitte', 'vorn'], seitenMuster: ['mitte', 'zwei', 'hinten'], seitenBreite: [0.18, 0.26], ruecken: 0,
    hangar: true, kommando: [0.6, 1.0], massstab: 1.4, deckMitte: false, heckMin: 2,
    tuerme: 14, aufbauten: 9, triebwerke: 4, groessen: ['triebwerk_l'], mitte: 'flak' },
};

/**
 * Bugformen: Spanten nach dem letzten Abschnitt als [t (Anteil der Buglänge), Breite ×, Deck sinkt um × h, Kiel steigt
 * um × h]; lb = Buglänge als Anteil der Schiffslänge.
 */
const BUEGE = {
  keil: { lb: [0.15, 0.22], sp: [[0.5, 0.72, 0, 0.35], [1, 0.4, 0.08, 0.6]] },
  jaeger: { lb: [0.3, 0.4], sp: [[0.45, 0.7, 0.12, 0.25], [1, 0.3, 0.42, 0.42]] },
  hammer: { lb: [0.14, 0.2], sp: [[0.12, 0.84, 0.12, 0.12], [0.22, 1.06, 0.05, 0.07], [0.85, 1.06, 0.05, 0.07], [1, 0.78, 0.2, 0.26]] },
  schnabel: { lb: [0.2, 0.28], sp: [[0.3, 0.76, 0.36, 0.05], [1, 0.46, 0.62, 0.1]] },
  stumpf: { lb: [0.08, 0.12], sp: [[0.4, 0.9, 0.05, 0.12], [1, 0.64, 0.18, 0.3]] },
  spitz: { lb: [0.2, 0.3], sp: [[0.5, 0.66, 0.18, 0.18], [1, 0.26, 0.42, 0.42]] },
};
/** Querschnittsverlauf über die Abschnitte (u = 0 Heck … 1 vorn) → [Breite, Deckhöhe, Kieltiefe] (je ≈ 0,7 … 1). */
const PROFILE = {
  gleich: () => [0.95, 0.95, 0.95],
  buckel: (u) => [0.9 + 0.1 * Math.sin(Math.PI * u), 0.72 + 0.32 * Math.sin(Math.PI * u), 0.85 + 0.12 * Math.sin(Math.PI * u)],
  mittelschiff: (u) => [0.76 + 0.26 * Math.sin(Math.PI * u), 0.88 + 0.1 * Math.sin(Math.PI * u), 0.9],
  eingezogen: (u) => [0.84 + 0.18 * Math.sin(Math.PI * Math.min(1, 0.3 + u)), 0.86 + 0.12 * u, 0.92],
  keilform: (u) => [1 - 0.22 * u, 1 - 0.2 * u, 1 - 0.12 * u],
};
const BRUECKEN = { hinten: [-0.36, -0.08], mitte: [-0.14, 0.14], vorn: [0.08, 0.3] };

const mix = (a, b, t) => a + (b - a) * t;
const r3 = (x) => Math.round(x * 1000) / 1000 + 0; // 1 mm, kein −0
const stufe = (v) => (v <= 0 ? 'keine' : v < 0.34 ? 'wenig' : v < 0.67 ? 'mittel' : 'viel');
const klasseVon = (e) => (Object.hasOwn(KLASSEN, e?.klasse) ? e.klasse : 'fregatte');
const wahl = (liste, t) => liste[Math.min(liste.length - 1, Math.floor(t * liste.length))];

/** Regler-Tabelle — eine Quelle, die Seite baut daraus die Regler (Lehre R11). */
export const GENERATOR_REGLER = {
  laenge: { name: 'Länge', min: 0, max: 1, schritt: 0.05, standard: 0.5, tipp: 'Länge im Bereich der Klasse',
    text: (v, e) => `${Math.round(mix(...KLASSEN[klasseVon(e)].laenge, v))} m` },
  breite: { name: 'Breite', min: 0.7, max: 1.3, schritt: 0.05, standard: 1, tipp: 'Rumpfbreite (die Höhe wächst mit)',
    text: (v) => `${Math.round(v * 100)} %` },
  kantigkeit: { name: 'Kantigkeit', min: 0, max: 1, schritt: 0.05, standard: 0.6,
    tipp: 'hoch = scharfe Kanten und mehr Stufen, niedrig = breite Fasen',
    text: (v) => (v < 0.2 ? 'weich' : v < 0.45 ? 'gefast' : v < 0.75 ? 'kantig' : 'sehr kantig') },
  aufbauten: { name: 'Aufbauten', min: 0, max: 1, schritt: 0.05, standard: 0.5, tipp: 'Kästen, Aufbaustufe, Rillen, Panzerplatten', text: stufe },
  geschuetze: { name: 'Geschütze', min: 0, max: 1, schritt: 0.05, standard: 0.5, tipp: 'Turmdichte (0 = keine Türme)', text: stufe },
  triebwerke: { name: 'Triebwerke', min: 1, max: 5, schritt: 1, standard: 3,
    tipp: 'Anzahl der Haupttriebwerke — Größe aus der Klasse, bei zu viel Masse größer bzw. mehr',
    text: (v) => `${Math.round(v)} ×` },
};

export function standardEinstellung(klasse) {
  const k = klasseVon({ klasse });
  return { seed: 1, klasse: k, laenge: 0.5, breite: 1, kantigkeit: 0.6, aufbauten: 0.5, geschuetze: 0.5, triebwerke: KLASSEN[k].triebwerke };
}

/** Eingabe klemmen — nie werfen. */
function saeubere(einst) {
  const klasse = klasseVon(einst), std = standardEinstellung(klasse);
  const s = Number(einst?.seed);
  const e = { seed: Number.isFinite(s) ? Math.min(999999, Math.max(1, Math.round(s))) : 1, klasse };
  for (const [k, r] of Object.entries(GENERATOR_REGLER)) {
    const v = Number(einst?.[k]);
    e[k] = Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : std[k];
  }
  e.triebwerke = Math.round(e.triebwerke);
  return e;
}

// ---------------- Zufall je Stufe ----------------
const STROM = { masse: 1, rumpf: 2, seiten: 3, kommando: 4, tuerme: 5, aufbauten: 6, antrieb: 7, muster: 8, ruecken: 9 };
/** Eigener Strom je Stufe. WARUM Mischfunktion statt seed + n: zufall() zählt nur hoch — nahe Startwerte ergäben
 *  verschobene Kopien derselben Folge. */
function strom(seed, name) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(STROM[name] + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return zufall(h >>> 0);
}

/** Grundmuster eines Seeds (nur vom Seed und der Klasse abhängig — die Regler variieren es nur). */
function muster(e, kl) {
  const R = strom(e.seed, 'muster');
  const [a, b, c, d, f] = [R(), R(), R(), R(), R()];
  return { bug: wahl(kl.buege, a), profil: wahl(kl.profile, b), bruecke: wahl(kl.bruecken, c), seiten: wahl(kl.seitenMuster, d), ruecken: f < kl.ruecken };
}
export function grundmuster(einst) { const e = saeubere(einst); return muster(e, KLASSEN[e.klasse]); }

// ---------------- Bausteine ----------------
/** Fase-Einzug wie profilPunkte (form.js). WARUM nachgebaut: Turm- und Triebwerksplätze brauchen die flache Breite. */
const einzug = (b, h, rundung, fase) => { const m = Math.min(b, h) / 2; return Math.min(m - 0.03, Math.max(0.03, Math.max(rundung, fase) * m)); };
const spant = (z, b, h, y, x, g) => ({ z: r3(z), b: r3(b), h: r3(h), x: r3(x), y: r3(y), rundung: g.rundung, fase: g.fase });
const koerper = (typ, spanten, { op = 'plus', mat = 'rumpf', pos = [0, 0, 0], dreh = [0, 0, 0], spiegel = [] } = {}) =>
  ({ typ, op, mat, pos: pos.map(r3), dreh, spiegel, spanten });

const REICH = Math.hypot(TURM.zapfenZ + TURM.rohrZ + TURM.rohrL / 2, TURM.rohrX); // Kranzachse → Mündung je s = 1
const RAND = 0.3;   // m Luft zwischen Turmring und Flächenkante
const NOETIG = 1.6; // m/s² Ziel-Beschleunigung (Fehler zu_schwach ab 1,5)
const EIN = 0.437;  // m Einsenk-/Überlappmaß — krumm gegen zusammenfallende Flächen (Dateikopf)

// ---------------- 1) Hauptrumpf ----------------
/**
 * Hauptrumpf als EIN Körper: Abschnitte mit konstantem Querschnitt (ebene Decks für Türme), dazwischen kurze Stufen
 * (Kantigkeit hoch) bzw. lange Schrägen; der Querschnittsverlauf folgt dem Profil des Grundmusters, vorn die Bugform.
 */
function baueRumpf(e, kl, mu) {
  const R = strom(e.seed, 'rumpf'), Rm = strom(e.seed, 'masse');
  const L = r3(mix(kl.laenge[0], kl.laenge[1], e.laenge));
  const B = L * kl.breite * e.breite * (0.92 + 0.16 * Rm());
  const H = B * kl.hoehe * (0.9 + 0.2 * Rm());
  const k = e.kantigkeit, bug = BUEGE[mu.bug], prof = PROFILE[mu.profil];
  const g = { fase: r3(0.45 - 0.4 * k), rundung: r3(Math.max(0, 0.2 * (1 - 4 * k))) };
  const nSec = kl.abschnitte[0] + Math.round(k * (kl.abschnitte[1] - kl.abschnitte[0]));
  const D = r3(Math.max(8, 0.05 * L));               // Antriebsblock (WARUM ≥ 8: Triebwerksgehäuse bis 6 m tief, R19)
  const zHeck = r3(-L / 2), zs = zHeck + 1.313, zBug = r3(L / 2);
  const Lb = L * mix(bug.lb[0], bug.lb[1], R());
  const ue = mix(4, 0.6, k) * (0.8 + 0.4 * R());       // Übergang zwischen Abschnitten
  const zE = zBug - Lb;
  const roh = [];
  for (let i = 0; i < nSec; i++) {
    const [pb, pt, pd] = prof(nSec > 1 ? i / (nSec - 1) : 0.5);
    roh.push({ w: 0.6 + 0.8 * R(), fb: pb * (0.94 + 0.08 * R()), ft: pt * (0.93 + 0.1 * R()), fd: pd * (0.93 + 0.1 * R()) });
  }
  const fbMax = Math.max(...roh.map((s) => s.fb));   // WARUM: der breiteste Abschnitt hat genau die Grundbreite
  // Heckstück: so lang wie der Antriebsblock (+ 1,5 m), danach ein Übergang auf den Querschnitt von Abschnitt 0
  const zHE = zHeck + D + 1.5, tH = mix(3, 1.2, k);
  const minL = roh.map((_, i) => (i === 0 ? zHE + tH - zs + 7 : 6)), frei = zE - zs - (nSec - 1) * ue;
  const extra = Math.max(0, frei - minL.reduce((a, b) => a + b, 0)), sw = roh.reduce((a, s) => a + s.w, 0);
  // Heckabschnitt groß genug für die eingestellten Triebwerke (kleinste Größe der Klasse) — WARUM: sonst steht der
  // Antriebsblock seitlich über (Spieltest R20: „Fremdkörper“). Hängt nur von Klasse und Regler „triebwerke“ ab,
  // nicht von der Masse, damit „aufbauten“ den Rumpf nicht verändert (Teilstrom).
  // heckMin: so viele Triebwerke braucht die Klasse mindestens (Träger: 1 L ist immer zu schwach) — WARUM: sonst wäre
  // das Heck bei Regler 1 schmaler als bei 2, obwohl beide Male 2 Triebwerke sitzen (aVor fiele um 0,1 %)
  const heck = heckBedarf(Math.max(e.triebwerke, kl.heckMin ?? 1), ANTRIEBE[kl.groessen[0]].r, g);
  const secs = [], spanten = [];
  let z = zs, heckS = null;
  roh.forEach((s, i) => {
    const za = r3(z), zb = r3(i === nSec - 1 ? zE : z + minL[i] + extra * s.w / sw);
    z = zb + ue;
    let top = r3(H / 2 * s.ft), bot = r3(-H / 2 * s.fd), b = r3(B * s.fb / fbMax);
    const h = r3(top - bot), y = r3((top + bot) / 2);
    const ez = einzug(b, h, g.rundung, g.fase);
    if (i === 0) {
      // WARUM nur das Heckstück verbreitern (nicht den ganzen Abschnitt): sonst wöge jedes Triebwerk mehr Rumpf mit,
      // als es schiebt, und „mehr Triebwerke“ machte das Schiff langsamer
      const wahlH = heck.find((x) => x.b <= b && x.h <= h) ?? heck.reduce((p2, x) => (Math.max(x.b, b) * Math.max(x.h, h) < Math.max(p2.b, b) * Math.max(p2.h, h) ? x : p2));
      const sb = r3(Math.max(b, wahlH.b)), sh = r3(Math.max(h, wahlH.h));
      heckS = { b: sb, h: sh, y, top: y + sh / 2, bot: y - sh / 2 };
      spanten.push(spant(za, sb, sh, y, 0, g), spant(zHE, sb, sh, y, 0, g), spant(zHE + tH, b, h, y, 0, g), spant(zb, b, h, y, 0, g));
      secs.push({ i, za: r3(zHE + tH), zb, b, h, y, top: y + h / 2, bot: y - h / 2, e: ez, hw: b / 2 - ez });
      return;
    }
    secs.push({ i, za, zb, b, h, y, top: y + h / 2, bot: y - h / 2, e: ez, hw: b / 2 - ez });
    spanten.push(spant(za, b, h, y, 0, g), spant(zb, b, h, y, 0, g));
  });
  const l = secs[nSec - 1];
  for (const [t, fb, ft, fd] of bug.sp) {
    const top = l.top - ft * l.h, bot = Math.min(top - 1.2, l.bot + fd * l.h);
    spanten.push(spant(zE + t * Lb, l.b * fb, top - bot, (top + bot) / 2, 0, g));
  }
  return { L, B, H, g, k, D, zHeck, zHE: r3(zHE + tH), heck: heckS, zBug, zE, Lb, ue, secs, nSec, koerper: koerper('rumpf', spanten) };
}
/** Mindestmaße (volle Breite/Höhe) des Heckabschnitts je Triebwerks-Anordnung (Fase eingerechnet, 0,5 m Spiel in der Höhe). */
function heckBedarf(n, rad, g) {
  const R = rad * 1.2 + 0.15;
  return anordnungen(n, rad).map((lay) => {
    const w = Math.max(...lay.map((p) => Math.abs(p.x))) + R, h = Math.max(...lay.map((p) => Math.abs(p.dy))) + R + 0.5;
    const f = Math.max(g.rundung, g.fase) * Math.min(w, h); // grob: Fasen-Einzug bei diesen Maßen
    return { b: 2 * (w + EIN + f * 0.6), h: 2 * (h + EIN + f * 0.6) };
  });
}
/** Abschnitte, die den Bereich [z0, z1] berühren (Übergänge eingeschlossen). */
const beruehrt = (r, z0, z1) => r.secs.filter((s) => s.za - r.ue < z1 && s.zb + r.ue > z0);

// ---------------- 2) Rücken (Fregatte, manche Korvetten) ----------------
/** Langer, gestufter Rückenaufbau mittig auf dem Deck — ebene Oberseite für die schweren Türme. */
function baueRuecken(e, kl, r, mu) {
  const R = strom(e.seed, 'ruecken'), [a, b, c, d, f] = [R(), R(), R(), R(), R()];
  if (!mu.ruecken) return null;
  const ms = kl.massstab, lo = r.zHE + 4.5, hi = r.zE - 6, len = (hi - lo) * mix(0.45, 0.75, b);
  const z0 = lo + (hi - lo - len) * mix(0, 0.6, a), z1 = z0 + len;
  const ber = beruehrt(r, z0, z1);
  const bs = Math.min(r.B * mix(0.32, 0.5, c), Math.min(...ber.map((s) => 2 * s.hw)) - 1);
  const hs = r.H * (kl.hangar ? 0.2 : mix(0.22, 0.38, d)), unten = Math.min(...ber.map((s) => s.top)) - EIN;
  if (bs < 4 || len < 20) return null;
  const ra = mix(3, 8, f) * ms, rv = Math.min(len * 0.2, mix(4, 9, f) * ms), g = r.g;
  const k = koerper('trapez', [spant(z0, bs * 0.7, hs * 0.6, unten + hs * 0.3, 0, g), spant(z0 + ra, bs, hs, unten + hs / 2, 0, g),
    spant(z1 - rv, bs, hs, unten + hs / 2, 0, g), spant(z1, bs * 0.75, hs * 0.55, unten + hs * 0.275, 0, g)]);
  const eh = einzug(bs, hs, g.rundung, g.fase);
  return { koerper: k, x: bs / 2, z0, z1, deck: { za: z0 + ra, zb: z1 - rv, top: unten + hs, hw: bs / 2 - eh, b: bs } };
}

// ---------------- 3) Seitenblöcke / Hangardecks ----------------
/** Gespiegelte Blöcke, in die Hülle eingesetzt (keine Ausleger), unter Deck und über Kiel. Träger: Hangardecks mit
 *  großer Öffnung vorn und langer Hangar-Galerie in der Außenwand. */
function baueSeiten(e, kl, r, mu) {
  const R = strom(e.seed, 'seiten');
  const wuerfe = [[R(), R(), R(), R(), R()], [R(), R(), R(), R(), R()]]; // WARUM fest: Folge unabhängig vom Muster
  const lo = r.zHE + 1.5, hi = r.zE - 2, sp = hi - lo;
  const plaetze = { keine: [], hinten: [[0, 0.5]], vorn: [[0.45, 1]], mitte: [[0.1, 0.9]], zwei: [[0, 0.46], [0.54, 1]] }[mu.seiten];
  const aus = { koerper: [], minus: [], bereiche: [] };
  plaetze.forEach(([p0, p1], j) => {
    const [a, b, c, d, f] = wuerfe[j];
    const pl = (p1 - p0) * sp, len = pl * mix(kl.hangar ? 0.8 : 0.6, 0.95, a);
    const z0 = lo + p0 * sp + (pl - len) * b, z1 = z0 + len;
    const ber = beruehrt(r, z0, z1);
    if (!ber.length || len < 8) return;
    const minHalb = Math.min(...ber.map((s) => s.b / 2));
    const topLim = Math.min(...ber.map((s) => s.top - s.e)) - 0.313, botLim = Math.max(...ber.map((s) => s.bot + s.e)) + 0.313;
    if (topLim - botLim < 2) return;
    const wo = r.B * mix(kl.seitenBreite[0], kl.seitenBreite[1], c);
    const hb = (topLim - botLim) * (kl.hangar ? 1 : mix(0.65, 1, d)), yc = kl.hangar ? (topLim + botLim) / 2 : botLim + hb / 2 + (topLim - botLim - hb) * f;
    const xIn = minHalb - 0.83, bb = wo + 0.83, cx = xIn + bb / 2, g = r.g;
    let spn;
    if (kl.hangar) {
      const t1 = Math.min(6, len * 0.06);
      spn = [spant(z0, bb * 0.7, hb * 0.85, yc, xIn + bb * 0.35, g), spant(z0 + t1, bb, hb, yc, cx, g), spant(z1, bb, hb, yc, cx, g)];
    } else {
      const t0 = Math.min(3, len * 0.15) * (0.5 + f), t1 = Math.min(4, len * 0.2);
      spn = [spant(z0, bb * 0.6, hb * 0.8, yc, xIn + bb * 0.3, g), spant(z0 + t0, bb, hb, yc, cx, g),
        spant(z1 - t1, bb, hb, yc, cx, g), spant(z1, bb * 0.5, hb * 0.75, yc, xIn + bb * 0.25, g)];
    }
    aus.koerper.push(koerper(kl.hangar ? 'quader' : 'trapez', spn, { spiegel: ['x'] }));
    aus.bereiche.push([z0, z1]);
    if (kl.hangar) {
      // Hangar-Öffnung vorn (0,61 m über die Stirn hinaus — WARUM: keine deckungsgleiche Fläche fürs CSG) …
      const gm = { rundung: 0, fase: 0.05 }, tief = Math.min(22, 0.3 * len), bm = 0.72 * wo, hm = 0.62 * hb;
      const xm = xIn + 0.83 + wo * 0.5, ym = yc - 0.08 * hb;
      aus.minus.push(koerper('quader', [spant(z1 - tief, bm, hm, ym, xm, gm), spant(z1 + 0.61, bm, hm, ym, xm, gm)],
        { op: 'minus', mat: 'schacht', spiegel: ['x'] }));
      // … und eine lange Hangar-Galerie in der Außenwand (von der Seite gut zu sehen)
      const xa = xIn + bb, gz0 = z0 + len * 0.14, gz1 = z1 - len * 0.18, gh = 0.5 * hb, gt = Math.min(3.1, wo * 0.3);
      if (gz1 - gz0 > 8) aus.minus.push(koerper('quader', [spant(gz0, gt + 0.61, gh, ym, xa - gt / 2 + 0.305, gm), spant(gz1, gt + 0.61, gh, ym, xa - gt / 2 + 0.305, gm)],
        { op: 'minus', mat: 'schacht', spiegel: ['x'] }));
    }
  });
  return aus;
}

// ---------------- 4) Kommandoblock ----------------
/** Gepanzerter Block ohne Glas, abgeschrägte Stirn; sitzt auf dem Rücken, wenn es einen gibt, sonst auf dem Deck. */
function baueKommando(e, kl, r, mu, ruecken) {
  const R = strom(e.seed, 'kommando'), [a, b, c, d, f] = [R(), R(), R(), R(), R()];
  const zMin = r.zHE + 4.5, zMax = r.zE - 6, [w0, w1] = BRUECKEN[mu.bruecke].map((t) => t * r.L);
  const decks = ruecken ? [{ ...ruecken.deck, auf: 'ruecken' }] : r.secs.map((s) => ({ za: s.za, zb: s.zb, top: s.top, hw: s.hw, b: s.b, auf: 'rumpf' }));
  const cand = decks.map((s) => ({ s, lo: Math.max(s.za + 0.5, zMin), hi: Math.min(s.zb - 0.5, zMax) })).filter((x) => x.hi - x.lo >= 5 && x.s.hw > 1.5);
  if (!cand.length) return null;
  // Fenster der Brückenlage: Teilstück des Decks darin, sonst das nächstgelegene Deck
  const im = cand.map((x) => ({ ...x, lo: Math.max(x.lo, w0), hi: Math.min(x.hi, w1) })).filter((x) => x.hi - x.lo >= 5);
  const dist = (x) => Math.max(0, w0 - x.hi, x.lo - w1);
  const liste = im.length ? im : [cand.reduce((p, x) => (dist(x) < dist(p) ? x : p))];
  const { s, lo, hi } = wahl(liste, a);
  const lk = Math.min(hi - lo, Math.max(5, r.L * mix(0.1, 0.17, b) * (ruecken ? 0.7 : 1))), z0 = lo + (hi - lo - lk) * c, z1 = z0 + lk;
  const bk = Math.min(s.b * mix(0.42, 0.6, d) * (ruecken ? 1.2 : 1), 2 * s.hw - 1), hk = r.H * mix(kl.kommando[0], kl.kommando[1], f);
  const unten = s.top - EIN, front = Math.min(0.3 * lk, 4), g = r.g;
  const k = koerper('trapez', [spant(z0, bk, hk, unten + hk / 2, 0, g), spant(z1 - front, bk, hk, unten + hk / 2, 0, g),
    spant(z1, bk * 0.8, hk * 0.55, unten + hk * 0.275, 0, g)]);
  const ek = einzug(bk, hk, g.rundung, g.fase);
  return { koerper: k, x: bk / 2, z0, z1, flach: [z0, z1 - front], oben: unten + hk, hw: bk / 2 - ek, bk, hk, auf: s.auf };
}

// ---------------- Zonen (Platzprüfung auf Deck/Kiel) ----------------
/** Abstand Punkt → Rechteck in x/z (0 = drin). */
const abstandRecht = (x, z, q) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1));
const rechteckeUeber = (a, b, luft) => a.x0 < b.x1 + luft && b.x0 < a.x1 + luft && a.z0 < b.z1 + luft && b.z0 < a.z1 + luft;
/** Rechteck samt Spiegelkopie. */
const gespiegelt = (q) => (q.x0 >= 0 ? [q, { ...q, x0: -q.x1, x1: -q.x0 }] : [q]);

// ---------------- 5) Steuerdüsen + Türme ----------------
function steuerPlaetze(r) {
  const s0 = r.secs[0], sl = r.secs[r.nSec - 1], zr = r.zHE + 2.5, zv = sl.zb - 2.5;
  return [
    { typ: 'steuer', p: [0, sl.top, zv], n: [0, 1, 0] }, { typ: 'steuer', p: [0, sl.bot, zv], n: [0, -1, 0] },
    { typ: 'steuer', p: [0, s0.top, zr], n: [0, 1, 0] }, { typ: 'steuer', p: [0, s0.bot, zr], n: [0, -1, 0] },
  ];
}

/**
 * Kandidaten für Türme auf allen ebenen Decks (Rumpf oben/unten, Rücken oben), nach Zufall geordnet, dann gierig
 * angenommen. WARUM Annahme über ALLE Kandidaten und erst danach die ersten k: so wächst die Turmliste mit dem Regler
 * nur (Präfix), und keine Wahl hängt vom Reglerwert ab.
 */
function waehleTuerme(e, kl, r, kom, ruecken, steuer) {
  const R = strom(e.seed, 'tuerme'), kand = [];
  const blockVorn = r.zHE - 1.5; // Turmring + 1,5 m Luft enden so am Ende des Heckstücks
  const decks = [...r.secs.flatMap((s) => [{ ...s, y: s.top, fl: 1, rumpf: true }, { ...s, y: s.bot, fl: -1, rumpf: true }]),
    ...(ruecken ? [{ ...ruecken.deck, y: ruecken.deck.top, fl: 1, rumpf: false }] : [])];
  for (const s of decks) {
    const reihe = (typ, x, schritt) => {
      const sR = GESCHUETZE[typ].turm.s, rr = TURM.fussR * sR;
      const lo = Math.max(s.za + rr + RAND, blockVorn + rr + 1.5), hi = s.zb - rr - RAND;
      const w = R(); // immer würfeln (feste Folge)
      if (hi < lo || Math.abs(x) + rr + RAND > s.hw) return;
      const n = Math.floor((hi - lo) / schritt) + 1, start = lo + (hi - lo - (n - 1) * schritt) * w;
      for (let i = 0; i < n; i++) kand.push({ typ, s: sR, rr, x: r3(x), y: s.y, z: r3(start + i * schritt), fl: s.fl, prio: R() });
    };
    // Mitte: schwerer Turm bzw. Flak, bei schmalem Deck PDC; Träger-Flugdeck bleibt in der Mitte frei
    const mitteFrei = s.rumpf && s.fl > 0 && (!kl.deckMitte || ruecken);
    const mtyp = kl.mitte === 'schwer' && s.fl > 0 ? 'schwer' : 'flak';
    const mt = TURM.fussR * GESCHUETZE[mtyp].turm.s + RAND <= s.hw ? mtyp : 'pdc';
    if (!mitteFrei) reihe(mt, 0, 2 * REICH * GESCHUETZE[mt].turm.s + 0.5);
    else R();
    // Kanten: Paar PDC (Spiegel x), Abstand zur eigenen Kopie gegen rohre_kreuzen
    const sp = GESCHUETZE.pdc.turm.s, xp = s.hw - TURM.fussR * sp - RAND;
    if (xp >= REICH * sp + 0.15) reihe('pdc', xp, 2 * REICH * sp + 0.5);
    else R();
    // Träger: breite Decks bekommen zusätzlich Flak-Paare
    const sf = GESCHUETZE.flak.turm.s, xf = s.hw - TURM.fussR * sf - RAND - 6;
    if (kl.hangar && xf >= REICH * sf + 0.15) reihe('flak', xf, 2 * REICH * sf + 0.5);
  }
  kand.forEach((c, i) => { c.nr = i; c.prio += c.typ === 'schwer' ? -0.35 : c.x === 0 ? -0.1 : 0; });
  kand.sort((a, b) => a.prio - b.prio || a.nr - b.nr);
  const zonen = { 1: [], [-1]: [] };
  for (const st of steuer) zonen[st.n[1]].push({ x0: -1, x1: 1, z0: st.p[2] - 1, z1: st.p[2] + 1, luft: 2.5, y: st.p[1] });
  if (kom) zonen[1].push({ x0: -kom.x, x1: kom.x, z0: kom.z0, z1: kom.z1, luft: 1.5 });
  if (ruecken) zonen[1].push({ x0: -ruecken.x, x1: ruecken.x, z0: ruecken.z0, z1: ruecken.z1, luft: 1.5, nurRumpf: true });
  const an = [];
  for (const c of kand) {
    const orte = c.x > 0 ? [c.x, -c.x] : [0];
    // WARUM nurRumpf: die Rücken-Zone sperrt nur das Rumpfdeck daneben, nicht das Rückendeck selbst
    const aufRuecken = ruecken && c.fl > 0 && c.y > ruecken.deck.top - 0.01;
    if (orte.some((x) => zonen[c.fl].some((q) => !(q.nurRumpf && aufRuecken) && abstandRecht(x, c.z, q) < c.rr + q.luft))) continue;
    // Drehkränze und Rohre: Abstand gegen zu_dicht und rohre_kreuzen (WARUM ohne Höhenvergleich: immer sicher)
    const frei = an.every((a) => a.fl !== c.fl || orte.every((x) =>
      (a.x > 0 ? [a.x, -a.x] : [0]).every((ax) => Math.hypot(x - ax, c.z - a.z) >= REICH * (a.s + c.s) + 0.2)));
    if (frei) an.push(c);
  }
  return an.slice(0, Math.round(e.geschuetze * kl.tuerme));
}

// ---------------- 6) Aufbauten ----------------
// WARUM keine Antennen (Messung R20 v2): jedes kleine Teil auf dem Kommandoblock ließ die CSG beim Triangulieren der
// Deckfläche Splitter-Risse stehen (4 von 135 Formen undicht, ohne Antennen 0) — Größe und Drehung änderten nichts
const ARTEN = [['kasten', 0.38], ['kiel', 0.17], ['stufe', 0.15], ['rille', 0.15], ['panzer', 0.15]];

/** Kästen, Kiel, Stufe auf dem Kommandoblock, Rillen (Minus), Panzerplatten — nur außerhalb der Zonen. */
function baueAufbauten(e, kl, r, kom, ruecken, tuerme, steuer, seiten, budget) {
  const R = strom(e.seed, 'aufbauten'), N = kl.aufbauten, ms = kl.massstab, g = r.g;
  // WARUM doppelt so viele Würfe wie Plätze: Kandidaten in Turm- oder Düsenzonen fallen weg, die nächsten rücken nach;
  // die Annahme hängt nur von früheren Kandidaten ab, also wächst die Liste mit dem Regler nur (Präfix)
  const wuerfe = Array.from({ length: 2 * N }, () => Array.from({ length: 9 }, () => R()));
  const k = Math.round(e.aufbauten * N), aus = [];
  const belegt = { 1: [], [-1]: [] };
  if (kom && kom.auf === 'rumpf') belegt[1].push({ x0: -kom.x, x1: kom.x, z0: kom.z0, z1: kom.z1 });
  if (ruecken) belegt[1].push({ x0: -ruecken.x, x1: ruecken.x, z0: ruecken.z0, z1: ruecken.z1 });
  let stufeDa = false;
  const frei = (q, fl) => {
    if (q.z0 < r.zHE + 0.5) return false;
    for (const t of tuerme) if (t.fl === fl) for (const x of t.x > 0 ? [t.x, -t.x] : [0]) for (const g2 of gespiegelt(q)) if (abstandRecht(x, t.z, g2) < t.rr + 3) return false;
    for (const st of steuer) if (st.n[1] === fl) for (const g2 of gespiegelt(q)) if (abstandRecht(0, st.p[2], g2) < 3) return false;
    return gespiegelt(q).every((g2) => belegt[fl].every((b) => !rechteckeUeber(g2, b, 0.5)));
  };
  for (let i = 0; i < wuerfe.length && aus.length < k; i++) {
    const [t, a, b, c, d, f, gx, h, s1] = wuerfe[i];
    let s = 0, art = ARTEN[ARTEN.length - 1][0];
    for (const [n, w] of ARTEN) { s += w; if (t < s) { art = n; break; } }
    const sec = r.secs[Math.min(r.nSec - 1, Math.floor(a * r.nSec))];
    const sink = 0.3 + 0.17 * s1; // WARUM je Teil verschieden: zwei Kästen auf einem Deck sollen keine gemeinsame Bodenfläche haben
    if (art === 'kasten' || art === 'kiel' || art === 'panzer') {
      const fl = art === 'kiel' ? -1 : 1, lang = sec.zb - sec.za - 1;
      let lz = (art === 'panzer' ? mix(8, 18, b) : mix(3, 9, b)) * ms;
      if (lang < 2) continue;
      lz = Math.min(lz, lang);
      const z0 = sec.za + 0.5 + (lang - lz) * c, z1 = z0 + lz;
      const bx = Math.min(art === 'panzer' ? mix(0.35, 0.6, d) * 2 * sec.hw : mix(1.5, 4.5, d) * ms, 2 * sec.hw - 0.6);
      const hz = art === 'panzer' ? mix(0.5, 0.9, f) + sink : mix(1, 2.5, f) * ms + sink;
      if (bx < 0.8) continue;
      const rest = sec.hw - bx - 0.6, xc = gx < 0.5 || rest < 0 ? 0 : bx / 2 + 0.3 + rest * h;
      const q = { x0: xc - bx / 2, x1: xc + bx / 2, z0, z1 };
      const spiegel = xc > 0 ? ['x'] : [];
      if (!budget.passt(1 + spiegel.length, 0) || !frei(q, fl)) continue;
      const yc = fl > 0 ? sec.top - sink + hz / 2 : sec.bot + sink - hz / 2;
      const gk = { rundung: 0, fase: art === 'panzer' ? 0.5 : g.fase };
      aus.push(koerper(art === 'panzer' ? 'platte' : 'quader', [spant(z0, bx, hz, yc, xc, gk), spant(z1, bx, hz, yc, xc, gk)],
        { mat: art === 'kasten' ? 'rumpf' : 'dunkel', spiegel }));
      budget.nimm(1 + spiegel.length, 0); belegt[fl].push(...gespiegelt(q));
    } else if (art === 'stufe') {
      if (!kom || stufeDa || !budget.passt(1, 0)) continue;
      const fl0 = kom.flach[0], lf = kom.flach[1] - fl0;
      if (lf < 3) continue;
      const lz = lf * mix(0.4, 0.7, b), z0 = fl0 + (lf - lz) * c, bx = kom.bk * mix(0.5, 0.75, d), hz = kom.hk * mix(0.3, 0.5, f);
      const u = kom.oben - sink, fr = Math.min(1.5, lz * 0.3);
      aus.push(koerper('trapez', [spant(z0, bx, hz, u + hz / 2, 0, g), spant(z0 + lz - fr, bx, hz, u + hz / 2, 0, g),
        spant(z0 + lz, bx * 0.8, hz * 0.6, u + hz * 0.3, 0, g)], { mat: 'dunkel' }));
      budget.nimm(1, 0); stufeDa = true;
    } else { // rille: Minus in der Seitenwand, nicht hinter Seitenblöcken
      const lang = sec.zb - sec.za - 2;
      if (lang < 3 || !budget.passt(2, 1)) continue;
      const lz = lang * mix(0.4, 0.8, b), z0 = sec.za + 1 + (lang - lz) * c, z1 = z0 + lz;
      if (seiten.bereiche.some(([s0, s1x]) => z0 < s1x + 1 && s0 < z1 + 1)) continue;
      const hr = mix(0.5, 1.2, d) * ms, ylo = sec.bot + sec.e + 0.4 + hr / 2, yhi = sec.top - sec.e - 0.4 - hr / 2;
      if (yhi < ylo) continue;
      const yc = mix(ylo, yhi, f), xc = sec.b / 2 - 0.113, gk = { rundung: 0, fase: 0 };
      aus.push(koerper('quader', [spant(z0, 0.83, hr, yc, xc, gk), spant(z1, 0.83, hr, yc, xc, gk)], { op: 'minus', mat: 'schacht', spiegel: ['x'] }));
      budget.nimm(2, 1);
    }
  }
  return aus;
}

// ---------------- 7) Antrieb ----------------
const GROESSEN = ['triebwerk_s', 'triebwerk_m', 'triebwerk_l'];

/** Anordnungen für n Triebwerke (Radius r): eine Reihe, oder zwei Reihen symmetrisch zur Schwerpunkt-Höhe. → [{ x, dy }] */
function anordnungen(n, r) {
  // WARUM 2,4 r: Gehäuse 1,18 r (grafik/form/schiff.js) je Seite + Luft — enger gepackt passt der Block in den Rumpf
  const d = 2.4 * r + 0.25, aus = [Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * d, dy: 0 }))];
  if (n >= 3) {
    if (n % 2 === 0) {
      const m = n / 2, reihe = (dy) => Array.from({ length: m }, (_, i) => ({ x: (i - (m - 1) / 2) * d, dy }));
      aus.push([...reihe(d / 2), ...reihe(-d / 2)]);
    } else {
      const m = (n - 1) / 2, dy = m === 1 ? d : d * Math.sqrt(3) / 2;
      const reihe = (y) => Array.from({ length: m }, (_, i) => ({ x: (i - (m - 1) / 2) * d, dy: y }));
      aus.push([{ x: 0, dy: 0 }, ...reihe(dy), ...reihe(-dy)]);
    }
  }
  return aus;
}

/**
 * Halbe Maße und Mitte des Antriebsblocks. Mitte = Schwerpunkt-Höhe der übrigen Form (yb) — WARUM: ein Block, der um
 * den Schwerpunkt herum liegt, verschiebt ihn nicht, die Triebwerke sitzen dann ohne Reserve mittig. Er füllt den
 * Heckquerschnitt eingezogen (wirkt wie ein Heckspiegel, nicht wie ein Fremdkörper) und wird nur so weit größer, wie
 * die Triebwerke (+ Gehäuse) es verlangen.
 */
function blockMasse(r, lay, rad, yb) {
  const R = rad * 1.2 + 0.15, cM = 0.002; // Gehäuse 1,18 r + Luft; cM: Rundung der Blockmitte auf 1 mm
  const s0 = r.heck, lo0 = s0.bot + EIN, hi0 = s0.top - EIN;
  let w = Math.max(s0.b / 2 - EIN, ...lay.map((p) => Math.abs(p.x) + R));
  let h = Math.max(0.5, Math.min(hi0 - yb, yb - lo0), ...lay.map((p) => Math.abs(p.dy) + cM + R));
  for (let i = 0; i < 200; i++) {
    const ez = einzug(2 * w, 2 * h, r.g.rundung, r.g.fase);
    // WARUM die Fasen-Gerade x + y = w + h − e: die Rundung liegt außerhalb davon, die Prüfung ist also sicher
    if (lay.every((p) => (w + h - ez - Math.abs(p.x) - Math.abs(p.dy) - cM) / Math.SQRT2 >= R)) break;
    w += 0.25; h += 0.25;
  }
  // WARUM ≥ 0,2 m Abstand zu den Rumpfflächen: deckungsgleiche Flächen ergäben Splitter im CSG
  if (Math.abs(w - s0.b / 2) < 0.2) w = s0.b / 2 + 0.2;
  for (let i = 0; i < 4 && (Math.abs(yb + h - s0.top) < 0.2 || Math.abs(yb - h - s0.bot) < 0.2); i++) h += 0.25;
  return { w: r3(w), h: r3(h), y: yb };
}
const blockKoerper = (r, m) => koerper('quader', [spant(r.zHeck, 2 * m.w, 2 * m.h, m.y, 0, r.g), spant(r.zHeck + r.D, 2 * m.w, 2 * m.h, m.y, 0, r.g)], { mat: 'dunkel' });

/**
 * Größe und Zahl der Triebwerke. Die Zahl kommt vom Regler; reicht die größte Klasse nicht, wird es eins mehr.
 * WARUM die Kette ab n = 1: die Beschleunigung soll mit dem Regler nie sinken. Würde man bei n = 1 schon M nehmen,
 * bei n = 2 aber zwei S, wäre das Schiff mit mehr Triebwerken langsamer.
 */
function waehleAntrieb(e, kl, r, M0, yb) {
  // WARUM immer die kleinste Größe der Klasse zuerst: größere nur gegen zu_schwach — hält den Block im Rumpf
  const basis = GROESSEN.indexOf(kl.groessen[0]);
  const s0 = r.heck;
  const variante = (n, typ) => {
    const A = ANTRIEBE[typ];
    let best = null;
    for (const lay of anordnungen(n, A.r)) {
      const m = blockMasse(r, lay, A.r, yb);
      // WARUM erst der Überstand über den Rumpf: der Block soll im Heck aufgehen; erst danach die Fläche
      const ueber = Math.max(0, m.w - s0.b / 2) + Math.max(0, m.h - s0.h / 2), fl = m.w * m.h;
      if (!best || ueber < best.ueber - 1e-9 || (Math.abs(ueber - best.ueber) <= 1e-9 && fl < best.fl)) best = { lay, m, ueber, fl };
    }
    const blk = blockKoerper(r, best.m), M = M0 + volumen(blk) * DICHTE + n * A.masse;
    return { n, typ, ...best, blk, a: n * A.schub / M };
  };
  let vorher = 0, w = null;
  for (let n = 1; n <= 5; n++) {
    let pick = null;
    for (let si = basis; si < GROESSEN.length; si++) {
      pick = variante(n, GROESSEN[si]);
      if (pick.a >= NOETIG && pick.a >= vorher) break;
    }
    vorher = Math.max(vorher, pick.a); w = pick;
    if (n >= e.triebwerke && pick.a >= NOETIG) break;
  }
  return w;
}

// ---------------- Zusammenbau ----------------
function form(name, koerperListe, bauteile) {
  return normalisiere({ name, version: VERSION, art: 'rumpf',
    koerper: koerperListe.map((k, id) => ({ id, ...k })), andock: [],
    bauteile: bauteile.map((b, id) => ({ id, typ: b.typ, p: b.p.map(r3), n: b.n, spiegel: b.spiegel ?? [] })) });
}
const turmBauteil = (t) => ({ typ: t.typ, p: [t.x, t.y, t.z], n: [0, t.fl, 0], spiegel: t.x > 0 ? ['x'] : [] });

/** Seed + Regler → normalisierte Werkstatt-Form (siehe Dateikopf). */
export function generiere(einst) {
  const e = saeubere(einst), kl = KLASSEN[e.klasse], name = `${kl.name} ${e.seed}`, mu = muster(e, kl);
  const r = baueRumpf(e, kl, mu);
  const ruecken = baueRuecken(e, kl, r, mu);
  const seiten = baueSeiten(e, kl, r, mu);
  const kom = baueKommando(e, kl, r, mu, ruecken);
  const steuer = steuerPlaetze(r);
  let tuerme = waehleTuerme(e, kl, r, kom, ruecken, steuer);
  // Budget: Einträge ≤ 28, mit Spiegelkopien ≤ 40, Minus ≤ 5 (Antriebsblock schon eingerechnet)
  const fest = [r.koerper, ...(ruecken ? [ruecken.koerper] : []), ...seiten.koerper, ...(kom ? [kom.koerper] : [])];
  const zaehl = (l) => l.reduce((a, k) => a + 1 + k.spiegel.length, 0);
  const budget = { e: fest.length + seiten.minus.length + 1, k: zaehl(fest) + zaehl(seiten.minus) + 1, m: seiten.minus.length,
    passt(k, m) { return this.e + 1 <= 28 && this.k + k <= 40 && this.m + m <= 5; },
    nimm(k, m) { this.e += 1; this.k += k; this.m += m; } };
  const aufbau = baueAufbauten(e, kl, r, kom, ruecken, tuerme, steuer, seiten, budget);
  const rumpfKoerper = [...fest, ...aufbau, ...seiten.minus];

  const baue = (tl) => {
    const ohne = form(name, rumpfKoerper, [...tl.map(turmBauteil), ...steuer]);
    const mw0 = massenwerte(ohne, BAUTEILE);
    const an = waehleAntrieb(e, kl, r, mw0.masse, r3(mw0.schwerpunkt[1]));
    const mitBlock = form(name, [...rumpfKoerper, an.blk], [...tl.map(turmBauteil), ...steuer]);
    const c1 = massenwerte(mitBlock, BAUTEILE).schwerpunkt[1];
    const tw = an.lay.filter((p) => p.x >= 0).map((p) => ({ typ: an.typ, p: [p.x, c1 + p.dy, r.zHeck], n: [0, 0, -1], spiegel: p.x > 0 ? ['x'] : [] }));
    return { mitBlock, an, f: form(name, [...rumpfKoerper, an.blk], [...tl.map(turmBauteil), ...steuer, ...tw]) };
  };
  // Selbsttest (Protokoll R20, Entscheidung 4): Türme mit Meldung fliegen raus, höchstens 2 Durchläufe
  let b = baue(tuerme);
  for (let lauf = 0; lauf < 2 && tuerme.length; lauf++) {
    const schlecht = new Set(pruefeGeschuetze(b.mitBlock).map((m) => m.bauteil));
    if (!schlecht.size) break;
    tuerme = tuerme.filter((_, i) => !schlecht.has(i));
    b = baue(tuerme);
  }
  return b.f;
}

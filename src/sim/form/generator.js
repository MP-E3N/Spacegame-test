// ZWECK: Schiffsgenerator der Form-Werkstatt (Runde 20). Aus Seed und wenigen Reglern entsteht eine ganz normale
//        Werkstatt-Form (Körper + Bauteile), voll editierbar und schon beim Bau flugtauglich. Vom a1studmuffin-Generator
//        ist nur der Ablauf übernommen: Rumpf in Abschnitten „ziehen“ → Seitenblöcke → Aufbauten → Geschütze oben/unten,
//        Triebwerke hinten.
// LIEFERT: GENERATOR_VERSION · KLASSEN · GENERATOR_REGLER (je { name, min, max, schritt, standard, tipp, text(v, einst) })
//          · standardEinstellung(klasse) → einst · generiere(einst) → normalisierte Form { name, version, art: 'rumpf',
//          koerper, andock: [], bauteile }
// REGEL: Rein rechnend: kein three, kein DOM, kein Math.random (zufall aus src/sim/zufall.js). Gleiche einst ergibt
//        bitgleiches JSON, und normalisiere(generiere(e)) ändert nichts. Ungültige Eingaben werden geklemmt, nie geworfen.
//        Stil Schwarmfront: kantig, gepanzert, keine Fenster, keine runden Tanks, keine Ausleger (Seitenblöcke und
//        Hangars sitzen IN der Hülle).
//        Flugtauglich per Bau (Protokoll R20):
//          - spiegelsymmetrisch zu x = 0
//          - Haupttriebwerke auf der flachen Heckfläche des Antriebsblocks in Schwerpunkt-Höhe (gerechnet mit
//            massenwerte, dann gesetzt)
//          - Türme nur auf ebenen Abschnitten, Abstände gegen zu_dicht und rohre_kreuzen
//          - Selbsttest mit pruefeGeschuetze; was meldet, fliegt raus
//        Budget: ≤ 28 Körper-Einträge, ≤ 40 inkl. Spiegelkopien, ≤ 5 Minus, ≤ 48 Bauteile.
//        Zahlen auf 1 mm gerundet, dreh nur 0/270°.
//        Teilströme: jede Stufe hat ihren eigenen Zufallsstrom, damit z. B. „aufbauten“ den Hauptrumpf nicht neu würfelt.
import { normalisiere, volumen, DICHTE, VERSION } from './form.js';
import { massenwerte, ANTRIEBE } from './flug.js';
import { GESCHUETZE, pruefeGeschuetze } from './geschuetze.js';
import { BAUTEILE } from './bauteile.js';
import { TURM } from '../schiffe/turm.js';
import { zufall } from '../zufall.js';

export const GENERATOR_VERSION = 1;

/**
 * Grundwerte je Klasse; die Regler wirken relativ dazu. breite = Grundbreite / Länge, hoehe = Höhe / Breite.
 * WARUM diese Maße: die Masse (DICHTE 0,08 t/m³) muss mit höchstens 5 Triebwerken der Klasse auf ≥ 1,6 m/s² kommen
 * (zu_schwach ab 1,5) — der Träger ist deshalb flach (hoehe 0,4), die Fregatte schlanker als das Bollwerk.
 */
export const KLASSEN = {
  korvette: { name: 'Korvette', laenge: [60, 110], breite: 0.15, hoehe: 0.7, abschnitte: [2, 4], bug: [0.16, 0.24],
    seiten: [0, 1], seitenBreite: [0.12, 0.22], hangar: false, kommando: [0.4, 0.6], massstab: 0.7,
    tuerme: 6, aufbauten: 5, triebwerke: 2, groessen: ['triebwerk_s', 'triebwerk_m'], mitte: 'flak' },
  fregatte: { name: 'Fregatte', laenge: [120, 200], breite: 0.12, hoehe: 0.7, abschnitte: [3, 5], bug: [0.14, 0.22],
    seiten: [1, 2], seitenBreite: [0.15, 0.28], hangar: false, kommando: [0.35, 0.55], massstab: 1,
    tuerme: 10, aufbauten: 7, triebwerke: 3, groessen: ['triebwerk_m', 'triebwerk_l'], mitte: 'schwer' },
  traeger: { name: 'Träger', laenge: [220, 340], breite: 0.105, hoehe: 0.4, abschnitte: [3, 6], bug: [0.12, 0.18],
    seiten: [1, 2], seitenBreite: [0.22, 0.34], hangar: true, kommando: [0.5, 0.8], massstab: 1.4,
    tuerme: 14, aufbauten: 9, triebwerke: 4, groessen: ['triebwerk_l'], mitte: 'flak' },
};

const mix = (a, b, t) => a + (b - a) * t;
const r3 = (x) => Math.round(x * 1000) / 1000 + 0; // 1 mm, kein −0
const stufe = (v) => (v <= 0 ? 'keine' : v < 0.34 ? 'wenig' : v < 0.67 ? 'mittel' : 'viel');
const klasseVon = (e) => (Object.hasOwn(KLASSEN, e?.klasse) ? e.klasse : 'fregatte');

/** Regler-Tabelle — eine Quelle, die Seite baut daraus die Regler (Lehre R11). */
export const GENERATOR_REGLER = {
  laenge: { name: 'Länge', min: 0, max: 1, schritt: 0.05, standard: 0.5, tipp: 'Länge im Bereich der Klasse',
    text: (v, e) => `${Math.round(mix(...KLASSEN[klasseVon(e)].laenge, v))} m` },
  breite: { name: 'Breite', min: 0.7, max: 1.3, schritt: 0.05, standard: 1, tipp: 'Rumpfbreite (die Höhe wächst mit)',
    text: (v) => `${Math.round(v * 100)} %` },
  kantigkeit: { name: 'Kantigkeit', min: 0, max: 1, schritt: 0.05, standard: 0.6,
    tipp: 'hoch = scharfe Kanten und mehr Stufen, niedrig = breite Fasen',
    text: (v) => (v < 0.2 ? 'weich' : v < 0.45 ? 'gefast' : v < 0.75 ? 'kantig' : 'sehr kantig') },
  aufbauten: { name: 'Aufbauten', min: 0, max: 1, schritt: 0.05, standard: 0.5, tipp: 'Kästen, Antennen, Rillen, Panzerplatten', text: stufe },
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
const STROM = { masse: 1, rumpf: 2, seiten: 3, kommando: 4, tuerme: 5, aufbauten: 6, antrieb: 7 };
/** Eigener Strom je Stufe. WARUM Mischfunktion statt seed + n: zufall() zählt nur hoch — nahe Startwerte ergäben
 *  verschobene Kopien derselben Folge. */
function strom(seed, name) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(STROM[name] + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return zufall(h >>> 0);
}

// ---------------- Bausteine ----------------
/** Fase-Einzug wie profilPunkte (form.js). WARUM nachgebaut: Turm- und Triebwerksplätze brauchen die flache Breite. */
const einzug = (b, h, rundung, fase) => { const m = Math.min(b, h) / 2; return Math.min(m - 0.03, Math.max(0.03, Math.max(rundung, fase) * m)); };
const spant = (z, b, h, y, x, g) => ({ z: r3(z), b: r3(b), h: r3(h), x: r3(x), y: r3(y), rundung: g.rundung, fase: g.fase });
const koerper = (typ, spanten, { op = 'plus', mat = 'rumpf', pos = [0, 0, 0], dreh = [0, 0, 0], spiegel = [] } = {}) =>
  ({ typ, op, mat, pos: pos.map(r3), dreh, spiegel, spanten });
const AUF = [270, 0, 0]; // senkrecht: Körper-+Z → Form-+Y (Körper-Y → Form −Z)

const REICH = Math.hypot(TURM.zapfenZ + TURM.rohrZ + TURM.rohrL / 2, TURM.rohrX); // Kranzachse → Mündung je s = 1
const RAND = 0.3;   // m Luft zwischen Turmring und Flächenkante
const NOETIG = 1.6; // m/s² Ziel-Beschleunigung (Fehler zu_schwach ab 1,5)

// ---------------- 1) Hauptrumpf ----------------
/**
 * Hauptrumpf als EIN Körper: Abschnitte mit konstantem Querschnitt (ebene Decks für Türme), dazwischen kurze Stufen
 * (Kantigkeit hoch) bzw. lange Schrägen; vorn ein Keilbug mit ebenem Deck und angehobenem Kiel.
 */
function baueRumpf(e, kl) {
  const R = strom(e.seed, 'rumpf'), Rm = strom(e.seed, 'masse');
  const L = r3(mix(kl.laenge[0], kl.laenge[1], e.laenge));
  const B = L * kl.breite * e.breite * (0.92 + 0.16 * Rm());
  const H = B * kl.hoehe * (0.9 + 0.2 * Rm());
  const k = e.kantigkeit;
  const g = { fase: r3(0.45 - 0.4 * k), rundung: r3(Math.max(0, 0.2 * (1 - 4 * k))) };
  const nSec = kl.abschnitte[0] + Math.round(k * (kl.abschnitte[1] - kl.abschnitte[0]));
  const D = r3(Math.max(8, 0.05 * L));               // Antriebsblock (WARUM ≥ 8: Triebwerksgehäuse bis 6 m tief, R19)
  const zHeck = r3(-L / 2), zs = zHeck + 1, zBug = r3(L / 2);
  const Lb = L * mix(kl.bug[0], kl.bug[1], R());
  const ue = mix(4, 0.6, k) * (0.8 + 0.4 * R());       // Übergang zwischen Abschnitten
  const zE = zBug - Lb;
  const roh = [];
  for (let i = 0; i < nSec; i++) roh.push({ w: 0.6 + 0.8 * R(), fb: 0.74 + 0.26 * R(), ft: 0.8 + 0.2 * R(), fd: 0.8 + 0.2 * R() });
  const fbMax = Math.max(...roh.map((s) => s.fb));   // WARUM: der breiteste Abschnitt hat genau die Grundbreite
  // Längen: Mindestmaße (Abschnitt 0 trägt hinten die Steuerdüsen vor dem Antriebsblock), Rest nach Gewicht
  const minL = roh.map((_, i) => (i === 0 ? D + 7 : 6)), frei = zE - zs - (nSec - 1) * ue;
  const extra = Math.max(0, frei - minL.reduce((a, b) => a + b, 0)), sw = roh.reduce((a, s) => a + s.w, 0);
  const secs = [], spanten = [];
  let z = zs;
  roh.forEach((s, i) => {
    const za = r3(z), zb = r3(i === nSec - 1 ? zE : z + minL[i] + extra * s.w / sw);
    z = zb + ue;
    const top = r3(H / 2 * s.ft), bot = r3(-H / 2 * s.fd), b = r3(B * s.fb / fbMax), h = r3(top - bot), y = r3((top + bot) / 2);
    const ez = einzug(b, h, g.rundung, g.fase);
    secs.push({ i, za, zb, b, h, y, top: y + h / 2, bot: y - h / 2, e: ez, hw: b / 2 - ez });
    spanten.push(spant(za, b, h, y, 0, g), spant(zb, b, h, y, 0, g));
  });
  // Keilbug: Deck bleibt bis zur Bugmitte eben (Steuerdüsen vorn), der Kiel steigt, die Breite nimmt ab
  const l = secs[nSec - 1], tipH = Math.max(1.2, l.h * (0.3 + 0.12 * R())), tipTop = l.top - 0.12 * l.h * R();
  const midBot = l.bot + 0.35 * l.h;
  spanten.push(spant(zE + 0.5 * Lb, l.b * 0.72, l.top - midBot, (l.top + midBot) / 2, 0, g));
  spanten.push(spant(zBug, l.b * (0.36 + 0.1 * R()), tipH, tipTop - tipH / 2, 0, g));
  return { L, B, H, g, k, D, zHeck, zBug, zE, Lb, ue, secs, nSec, bugDeck: { z: r3(zE + 0.25 * Lb), y: l.top },
    koerper: koerper('rumpf', spanten) };
}

// ---------------- 2) Seitenblöcke / Hangars ----------------
/** Gespiegelte Blöcke, 0,8 m in die Hülle eingesetzt (keine Ausleger, keine bündige T-Fuge), unter Deck und über Kiel. */
function baueSeiten(e, kl, r) {
  const R = strom(e.seed, 'seiten');
  const nS = kl.seiten[0] + Math.floor(R() * (kl.seiten[1] - kl.seiten[0] + 1) * 0.9999);
  const wuerfe = [[R(), R(), R(), R(), R()], [R(), R(), R(), R(), R()]]; // WARUM fest: Folge unabhängig von nS
  const lo = r.zHeck + r.D + 1.5, hi = r.zE - 2, platz = (hi - lo) / Math.max(1, nS);
  const aus = { koerper: [], minus: [], bereiche: [] };
  for (let j = 0; j < nS; j++) {
    const [a, b, c, d, f] = wuerfe[j];
    const len = platz * mix(kl.hangar ? 0.75 : 0.5, kl.hangar ? 0.95 : 0.85, a);
    const z0 = lo + j * platz + (platz - len) * b, z1 = z0 + len;
    const ber = r.secs.filter((s) => s.za - r.ue < z1 && s.zb + r.ue > z0);
    if (!ber.length || len < 6) continue;
    const minHalb = Math.min(...ber.map((s) => s.b / 2));
    const topLim = Math.min(...ber.map((s) => s.top - s.e)) - 0.3, botLim = Math.max(...ber.map((s) => s.bot + s.e)) + 0.3;
    if (topLim - botLim < 2) continue;
    const wo = r.B * mix(kl.seitenBreite[0], kl.seitenBreite[1], c);
    const hb = (topLim - botLim) * (kl.hangar ? 1 : mix(0.6, 1, d)), yc = (topLim + botLim) / 2;
    const xIn = minHalb - 0.8, bb = wo + 0.8, cx = xIn + bb / 2, g = r.g;
    let sp;
    if (kl.hangar) sp = [spant(z0, bb, hb, yc, cx, g), spant(z1, bb, hb, yc, cx, g)];
    else {
      // kantig: Bug- und Heckseite abgeschrägt, Innenfläche bleibt in der Hülle (x-Versatz)
      const t0 = Math.min(3, len * 0.15) * (0.5 + f), t1 = Math.min(4, len * 0.2);
      sp = [spant(z0, bb * 0.6, hb * 0.8, yc, xIn + bb * 0.3, g), spant(z0 + t0, bb, hb, yc, cx, g),
        spant(z1 - t1, bb, hb, yc, cx, g), spant(z1, bb * 0.5, hb * 0.75, yc, xIn + bb * 0.25, g)];
    }
    aus.koerper.push(koerper(kl.hangar ? 'quader' : 'trapez', sp, { spiegel: ['x'] }));
    aus.bereiche.push([z0, z1]);
    if (kl.hangar) {
      // Hangar-Öffnung nach vorn (Minus, 0,5 m über die Stirn hinaus — WARUM: keine deckungsgleiche Fläche fürs CSG)
      const tief = Math.min(14, 0.3 * len), bm = 0.6 * wo, hm = 0.55 * hb, xm = xIn + 0.8 + wo * 0.5;
      const ym = yc - 0.1 * hb, gm = { rundung: 0, fase: 0.05 };
      aus.minus.push(koerper('quader', [spant(z1 - tief, bm, hm, ym, xm, gm), spant(z1 + 0.5, bm, hm, ym, xm, gm)],
        { op: 'minus', mat: 'schacht', spiegel: ['x'] }));
    }
  }
  return aus;
}

// ---------------- 3) Kommandoblock ----------------
/** Gepanzerter Block ohne Glas im hinteren Teil des Rumpfs, abgeschrägte Stirn. */
function baueKommando(e, kl, r) {
  const R = strom(e.seed, 'kommando'), [a, b, c, d, f] = [R(), R(), R(), R(), R()];
  const zMin = r.zHeck + r.D + 6, zMax = r.zE - 3; // WARUM zMin: hinten sitzen Steuerdüsen auf dem Deck
  const cand = r.secs.map((s) => ({ s, lo: Math.max(s.za + 0.5, zMin), hi: Math.min(s.zb - 0.5, zMax) })).filter((x) => x.hi - x.lo >= 5 && x.s.hw > 1.5);
  if (!cand.length) return null;
  const vorz = cand.filter((x) => (x.lo + x.hi) / 2 > -0.3 * r.L && (x.lo + x.hi) / 2 < 0.15 * r.L);
  const liste = vorz.length ? vorz : cand, { s, lo, hi } = liste[Math.min(liste.length - 1, Math.floor(a * liste.length))];
  const lk = Math.min(hi - lo, Math.max(5, r.L * mix(0.1, 0.17, b))), z0 = lo + (hi - lo - lk) * c, z1 = z0 + lk;
  const bk = Math.min(s.b * mix(0.34, 0.5, d), 2 * s.hw - 1), hk = r.H * mix(kl.kommando[0], kl.kommando[1], f);
  const unten = s.top - 0.4, front = Math.min(0.3 * lk, 4), g = r.g;
  const k = koerper('trapez', [spant(z0, bk, hk, unten + hk / 2, 0, g), spant(z1 - front, bk, hk, unten + hk / 2, 0, g),
    spant(z1, bk * 0.8, hk * 0.55, unten + hk * 0.275, 0, g)]);
  const ek = einzug(bk, hk, g.rundung, g.fase);
  return { koerper: k, x: bk / 2, z0, z1, flach: [z0, z1 - front], oben: unten + hk, hw: bk / 2 - ek, bk, hk };
}

// ---------------- Zonen (Platzprüfung auf Deck/Kiel) ----------------
/** Abstand Punkt → Rechteck in x/z (0 = drin). */
const abstandRecht = (x, z, q) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1));
const rechteckeUeber = (a, b, luft) => a.x0 < b.x1 + luft && b.x0 < a.x1 + luft && a.z0 < b.z1 + luft && b.z0 < a.z1 + luft;
/** Rechteck samt Spiegelkopie. */
const gespiegelt = (q) => (q.x0 >= 0 ? [q, { ...q, x0: -q.x1, x1: -q.x0 }] : [q]);

// ---------------- 4) Steuerdüsen + Türme ----------------
function steuerPlaetze(r) {
  const s0 = r.secs[0], sl = r.secs[r.nSec - 1], zr = r.zHeck + r.D + 2.5;
  return [
    { typ: 'steuer', p: [0, r.bugDeck.y, r.bugDeck.z], n: [0, 1, 0] },
    { typ: 'steuer', p: [0, sl.bot, sl.zb - 2.5], n: [0, -1, 0] },
    { typ: 'steuer', p: [0, s0.top, zr], n: [0, 1, 0] },
    { typ: 'steuer', p: [0, s0.bot, zr], n: [0, -1, 0] },
  ];
}

/**
 * Kandidaten für Türme auf allen ebenen Abschnitten (oben und unten), nach Zufall geordnet, dann gierig angenommen.
 * WARUM Annahme über ALLE Kandidaten und erst danach die ersten k: so wächst die Turmliste mit dem Regler nur
 * (Präfix), und keine Wahl hängt vom Reglerwert ab.
 */
function waehleTuerme(e, kl, r, kom, steuer) {
  const R = strom(e.seed, 'tuerme'), kand = [];
  const blockVorn = r.zHeck + r.D;
  for (const s of r.secs) for (const fl of [1, -1]) {
    const y = fl > 0 ? s.top : s.bot;
    const reihe = (typ, x, schritt) => {
      const sR = GESCHUETZE[typ].turm.s, rr = TURM.fussR * sR;
      const lo = Math.max(s.za + rr + RAND, blockVorn + rr + 1.5), hi = s.zb - rr - RAND;
      const w = R(); // immer würfeln (feste Folge)
      if (hi < lo || Math.abs(x) + rr + RAND > s.hw) return;
      const n = Math.floor((hi - lo) / schritt) + 1, start = lo + (hi - lo - (n - 1) * schritt) * w;
      for (let i = 0; i < n; i++) kand.push({ typ, s: sR, rr, x: r3(x), y, z: r3(start + i * schritt), fl, prio: R() });
    };
    // Mitte: Flak bzw. schwerer Turm (Fregatte oben), bei schmalem Rumpf PDC
    const mtyp = kl.mitte === 'schwer' && fl > 0 ? 'schwer' : 'flak';
    const mt = TURM.fussR * GESCHUETZE[mtyp].turm.s + RAND <= s.hw ? mtyp : 'pdc';
    reihe(mt, 0, 2 * REICH * GESCHUETZE[mt].turm.s + 0.5);
    // Kanten: Paar PDC (Spiegel x), Abstand zur eigenen Kopie gegen rohre_kreuzen
    const sp = GESCHUETZE.pdc.turm.s, xp = s.hw - TURM.fussR * sp - RAND;
    if (xp >= REICH * sp + 0.15) reihe('pdc', xp, 2 * REICH * sp + 0.5);
    // Träger: breite Decks bekommen zusätzlich Flak-Paare
    const sf = GESCHUETZE.flak.turm.s, xf = s.hw - TURM.fussR * sf - RAND - 6;
    if (kl.hangar && xf >= REICH * sf + 0.15) reihe('flak', xf, 2 * REICH * sf + 0.5);
  }
  kand.forEach((c, i) => { c.nr = i; c.prio += c.typ === 'schwer' ? -0.35 : c.x === 0 ? -0.1 : 0; });
  kand.sort((a, b) => a.prio - b.prio || a.nr - b.nr);
  const zonen = { 1: [], [-1]: [] };
  for (const st of steuer) zonen[st.n[1]].push({ x0: -1, x1: 1, z0: st.p[2] - 1, z1: st.p[2] + 1, luft: 2.5 });
  if (kom) zonen[1].push({ x0: -kom.x, x1: kom.x, z0: kom.z0, z1: kom.z1, luft: 1.5 });
  const an = [];
  for (const c of kand) {
    const orte = c.x > 0 ? [c.x, -c.x] : [0];
    if (orte.some((x) => zonen[c.fl].some((q) => abstandRecht(x, c.z, q) < c.rr + q.luft))) continue;
    // Drehkränze und Rohre: Abstand gegen zu_dicht und rohre_kreuzen (WARUM ohne Höhenvergleich: immer sicher)
    const frei = an.every((a) => a.fl !== c.fl || (c.x > 0 ? [c.x, -c.x] : [0]).every((x) =>
      (a.x > 0 ? [a.x, -a.x] : [0]).every((ax) => Math.hypot(x - ax, c.z - a.z) >= REICH * (a.s + c.s) + 0.2)));
    if (frei) an.push(c);
  }
  return an.slice(0, Math.round(e.geschuetze * kl.tuerme));
}

// ---------------- 5) Aufbauten ----------------
const ARTEN = [['kasten', 0.3], ['kiel', 0.15], ['antenne', 0.2], ['stufe', 0.12], ['rille', 0.13], ['panzer', 0.1]];

/** Kästen, Kiel, Antennen, Stufe auf dem Kommandoblock, Rillen (Minus), Panzerplatten — nur außerhalb der Zonen. */
function baueAufbauten(e, kl, r, kom, tuerme, steuer, seiten, budget) {
  const R = strom(e.seed, 'aufbauten'), N = kl.aufbauten, ms = kl.massstab, g = r.g;
  // WARUM doppelt so viele Würfe wie Plätze: Kandidaten in Turm- oder Düsenzonen fallen weg, die nächsten rücken nach;
  // die Annahme hängt nur von früheren Kandidaten ab, also wächst die Liste mit dem Regler nur (Präfix)
  const wuerfe = Array.from({ length: 2 * N }, () => Array.from({ length: 8 }, () => R()));
  const k = Math.round(e.aufbauten * N), aus = [];
  const belegt = { 1: [], [-1]: [] };
  if (kom) belegt[1].push({ x0: -kom.x, x1: kom.x, z0: kom.z0, z1: kom.z1 });
  let stufeDa = false;
  const frei = (q, fl) => {
    if (q.z0 < r.zHeck + r.D + 0.5) return false;
    for (const t of tuerme) if (t.fl === fl) for (const x of t.x > 0 ? [t.x, -t.x] : [0]) for (const g2 of gespiegelt(q)) if (abstandRecht(x, t.z, g2) < t.rr + 3) return false;
    for (const st of steuer) if (st.n[1] === fl) for (const g2 of gespiegelt(q)) if (abstandRecht(0, st.p[2], g2) < 3) return false;
    return gespiegelt(q).every((g2) => belegt[fl].every((b) => !rechteckeUeber(g2, b, 0.5)));
  };
  for (let i = 0; i < wuerfe.length && aus.length < k; i++) {
    const [t, a, b, c, d, f, gx, h] = wuerfe[i];
    let s = 0, art = ARTEN[ARTEN.length - 1][0];
    for (const [n, w] of ARTEN) { s += w; if (t < s) { art = n; break; } }
    const sec = r.secs[Math.min(r.nSec - 1, Math.floor(a * r.nSec))];
    if (art === 'kasten' || art === 'kiel' || art === 'panzer') {
      const fl = art === 'kiel' ? -1 : 1, lang = sec.zb - sec.za - 1;
      let lz = (art === 'panzer' ? mix(8, 18, b) : mix(3, 9, b)) * ms;
      if (lang < 2) continue;
      lz = Math.min(lz, lang);
      const z0 = sec.za + 0.5 + (lang - lz) * c, z1 = z0 + lz;
      const bx = Math.min(art === 'panzer' ? mix(0.35, 0.6, d) * 2 * sec.hw : mix(1.5, 4.5, d) * ms, 2 * sec.hw - 0.6);
      const hz = art === 'panzer' ? mix(0.5, 0.9, f) : mix(1, 2.5, f) * ms;
      if (bx < 0.8) continue;
      const rest = sec.hw - bx - 0.6, xc = gx < 0.5 || rest < 0 ? 0 : bx / 2 + 0.3 + rest * h;
      const q = { x0: xc - bx / 2, x1: xc + bx / 2, z0, z1 };
      const spiegel = xc > 0 ? ['x'] : [];
      if (!budget.passt(1 + spiegel.length, 0) || !frei(q, fl)) continue;
      const yc = fl > 0 ? sec.top - 0.3 + hz / 2 : sec.bot + 0.3 - hz / 2;
      const gk = { rundung: 0, fase: art === 'panzer' ? 0.5 : g.fase };
      aus.push(koerper(art === 'panzer' ? 'platte' : 'quader', [spant(z0, bx, hz, yc, xc, gk), spant(z1, bx, hz, yc, xc, gk)],
        { mat: art === 'kasten' ? 'rumpf' : 'dunkel', spiegel }));
      budget.nimm(1 + spiegel.length, 0); belegt[fl].push(...gespiegelt(q));
    } else if (art === 'antenne') {
      if (!kom) continue;
      const xa = gx < 0.5 ? 0 : Math.max(0.6, (kom.hw - 0.4) * h), za = mix(kom.flach[0] + 0.6, kom.flach[1] - 0.6, d);
      const spiegel = xa > 0 ? ['x'] : [], ha = mix(3, 8, f) * ms, gk = { rundung: 0, fase: 0 };
      if (kom.flach[1] - kom.flach[0] < 1.5 || xa + 0.3 > kom.hw || !budget.passt(1 + spiegel.length, 0)) continue;
      aus.push(koerper('quader', [spant(-0.4, 0.5, 0.5, 0, 0, gk), spant(ha, 0.25, 0.25, 0, 0, gk)],
        { mat: 'metall', pos: [xa, kom.oben, za], dreh: AUF, spiegel }));
      budget.nimm(1 + spiegel.length, 0);
    } else if (art === 'stufe') {
      if (!kom || stufeDa || !budget.passt(1, 0)) continue;
      const fl0 = kom.flach[0], lf = kom.flach[1] - fl0;
      if (lf < 3) continue;
      const lz = lf * mix(0.4, 0.7, b), z0 = fl0 + (lf - lz) * c, bx = kom.bk * mix(0.5, 0.75, d), hz = kom.hk * mix(0.3, 0.5, f);
      const u = kom.oben - 0.3, fr = Math.min(1.5, lz * 0.3);
      aus.push(koerper('trapez', [spant(z0, bx, hz, u + hz / 2, 0, g), spant(z0 + lz - fr, bx, hz, u + hz / 2, 0, g),
        spant(z0 + lz, bx * 0.8, hz * 0.6, u + hz * 0.3, 0, g)], { mat: 'dunkel' }));
      budget.nimm(1, 0); stufeDa = true;
    } else { // rille: Minus in der Seitenwand, nicht hinter Seitenblöcken
      const lang = sec.zb - sec.za - 2;
      if (lang < 3 || !budget.passt(2, 1)) continue;
      const lz = lang * mix(0.4, 0.8, b), z0 = sec.za + 1 + (lang - lz) * c, z1 = z0 + lz;
      if (seiten.bereiche.some(([s0, s1]) => z0 < s1 + 1 && s0 < z1 + 1)) continue;
      const hr = mix(0.5, 1.2, d) * ms, ylo = sec.bot + sec.e + 0.4 + hr / 2, yhi = sec.top - sec.e - 0.4 - hr / 2;
      if (yhi < ylo) continue;
      const yc = mix(ylo, yhi, f), xc = sec.b / 2 - 0.1, gk = { rundung: 0, fase: 0 };
      aus.push(koerper('quader', [spant(z0, 0.8, hr, yc, xc, gk), spant(z1, 0.8, hr, yc, xc, gk)], { op: 'minus', mat: 'schacht', spiegel: ['x'] }));
      budget.nimm(2, 1);
    }
  }
  return aus;
}

// ---------------- 6) Antrieb ----------------
const GROESSEN = ['triebwerk_s', 'triebwerk_m', 'triebwerk_l'];

/** Anordnungen für n Triebwerke (Radius r): eine Reihe, oder zwei Reihen symmetrisch zur Schwerpunkt-Höhe. → [{ x, dy }] */
function anordnungen(n, r) {
  const d = 2.5 * r + 0.4, aus = [Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * d, dy: 0 }))];
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

/** Halbe Maße des Antriebsblocks, damit alle Kreise (+ Gehäuse) in die gefaste Heckfläche passen. */
function blockMasse(r, lay, rad, cMax) {
  const R = rad * 1.3 + 0.3; // Gehäuse 1,18 r + Flansch (grafik/form/schiff.js) + Luft
  const s0 = r.secs[0];
  let w = Math.max(s0.b / 2 + 0.6, ...lay.map((p) => Math.abs(p.x) + R));
  let h = Math.max(Math.max(s0.top, -s0.bot) + 0.6, ...lay.map((p) => Math.abs(p.dy) + cMax + R));
  for (let i = 0; i < 200; i++) {
    const ez = einzug(2 * w, 2 * h, r.g.rundung, r.g.fase);
    // WARUM die Fasen-Gerade x + y = w + h − e: die Rundung liegt außerhalb davon, die Prüfung ist also sicher
    if (lay.every((p) => (w + h - ez - Math.abs(p.x) - Math.abs(p.dy) - cMax) / Math.SQRT2 >= R)) break;
    w += 0.25; h += 0.25;
  }
  return { w: r3(w), h: r3(h) };
}
const blockKoerper = (r, m) => koerper('quader', [spant(r.zHeck, 2 * m.w, 2 * m.h, 0, 0, r.g), spant(r.zHeck + r.D, 2 * m.w, 2 * m.h, 0, 0, r.g)], { mat: 'dunkel' });

/**
 * Größe und Zahl der Triebwerke. Die Zahl kommt vom Regler; reicht die größte Klasse nicht, wird es eins mehr.
 * WARUM die Kette ab n = 1: die Beschleunigung soll mit dem Regler nie sinken. Würde man bei n = 1 schon M nehmen,
 * bei n = 2 aber zwei S, wäre das Schiff mit mehr Triebwerken langsamer.
 */
function waehleAntrieb(e, kl, r, M0, cMax) {
  const Ra = strom(e.seed, 'antrieb');
  const basis = GROESSEN.indexOf(kl.groessen[Math.min(kl.groessen.length - 1, Math.floor(Ra() * kl.groessen.length))]);
  const variante = (n, typ) => {
    const A = ANTRIEBE[typ];
    let best = null;
    for (const lay of anordnungen(n, A.r)) {
      const m = blockMasse(r, lay, A.r, cMax);
      if (!best || m.w * m.h < best.m.w * best.m.h) best = { lay, m };
    }
    const blk = blockKoerper(r, best.m), M = M0 + volumen(blk) * DICHTE + n * A.masse;
    return { n, typ, ...best, blk, a: n * A.schub / M };
  };
  let vorher = 0, wahl = null;
  for (let n = 1; n <= 5; n++) {
    let pick = null;
    for (let si = basis; si < GROESSEN.length; si++) {
      pick = variante(n, GROESSEN[si]);
      if (pick.a >= NOETIG && pick.a >= vorher) break;
    }
    vorher = Math.max(vorher, pick.a); wahl = pick;
    if (n >= e.triebwerke && pick.a >= NOETIG) break;
  }
  return wahl;
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
  const e = saeubere(einst), kl = KLASSEN[e.klasse], name = `${kl.name} ${e.seed}`;
  const r = baueRumpf(e, kl);
  const seiten = baueSeiten(e, kl, r);
  const kom = baueKommando(e, kl, r);
  const steuer = steuerPlaetze(r);
  let tuerme = waehleTuerme(e, kl, r, kom, steuer);
  // Budget: Einträge ≤ 28, mit Spiegelkopien ≤ 40, Minus ≤ 5 (Antriebsblock schon eingerechnet)
  const fest = [r.koerper, ...seiten.koerper, ...seiten.minus, ...(kom ? [kom.koerper] : [])];
  const zaehl = (l) => l.reduce((a, k) => a + 1 + k.spiegel.length, 0);
  const budget = { e: fest.length + 1, k: zaehl(fest) + 1, m: seiten.minus.length,
    passt(k, m) { return this.e + 1 <= 28 && this.k + k <= 40 && this.m + m <= 5; },
    nimm(k, m) { this.e += 1; this.k += k; this.m += m; } };
  const aufbau = baueAufbauten(e, kl, r, kom, tuerme, steuer, seiten, budget);
  const rumpfKoerper = [...fest.slice(0, 1 + seiten.koerper.length), ...(kom ? [kom.koerper] : []), ...aufbau, ...seiten.minus];

  const baue = (tl) => {
    const ohne = form(name, rumpfKoerper, [...tl.map(turmBauteil), ...steuer]);
    const mw0 = massenwerte(ohne, BAUTEILE);
    // WARUM cMax aus dem Schwerpunkt OHNE Block: der Block sitzt mittig auf y = 0 und zieht den Schwerpunkt nur zu 0 hin
    const cMax = Math.abs(mw0.schwerpunkt[1]);
    const an = waehleAntrieb(e, kl, r, mw0.masse, cMax);
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

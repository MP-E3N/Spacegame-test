// ZWECK: Prüfungen ohne Browser für den Schiffsgenerator der Form-Werkstatt (Runde 20, `node tests/generator.mjs`) gegen
//        die Schnittstelle und die Entscheidungen 1–8 im Protokoll R20 — unabhängig vom Schiffbauer geschrieben.
//   1) Tabellen: KLASSEN, GENERATOR_REGLER (Bereiche wie E2, text()), standardEinstellung, GENERATOR_VERSION.
//   2) Gleichlauf: gleiche einst → gleiches JSON, Reihenfolge A·B·A, eingefrorene Eingabe, normalisiere(f) ändert nichts.
//   3) ~360 Formen (3 Klassen × 40 Seeds, jeder Regler auf min/max, Ecken): 0 Fehler in pruefeSchiff + pruefe, harte /
//      weiche Warnungen (≤ 5 %), eigene Prüfungen (Budget, Symmetrie, Heck, Triebwerks-Überlapp, Türme vollständig, Länge).
//   4) Regler-Wirkung (≥ 80 % der Seeds + Mittelwert in Richtung), Teilströme (aufbauten → Hauptrumpf bitgleich).
//   5) Schlechte Eingaben klemmen, Vielfalt, Laufzeit, Probeflug, Import-Regel.
//   Jede Gegenprobe (Zeile „Gegenprobe …“) füttert die eigenen Prüfungen mit absichtlich falschen Formen und MUSS anschlagen.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER oder fehlendem Modul.
// REGEL: GENERATOR_MODUL=<pfad> prüft einen anderen Generator (Ersatz-Umsetzung im Scratchpad, Lernbuch R18).
import { normalisiere, pruefe, bauteilListe, koerperListe, koerperMatrix, huelle, profilPunkte, wendeK, VERSION } from '../src/sim/form/form.js';
import { GESCHUETZE } from '../src/sim/form/geschuetze.js';
import { antriebArt } from '../src/sim/form/flug.js';
import { BAUTEILE, formZuSchiff } from '../src/sim/form/bauteile.js';
import { erstelleSchiffSim } from '../src/sim/schiff.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const START = performance.now();
const PFAD = process.env.GENERATOR_MODUL ? pathToFileURL(process.env.GENERATOR_MODUL).href : new URL('../src/sim/form/generator.js', import.meta.url).href;
let Gen;
try { Gen = await import(PFAD); } catch (e) { console.error(`tests/generator.mjs — Prüfung nicht möglich: ${PFAD} fehlt oder lädt nicht (${e.code ?? ''} ${String(e.message).split('\n')[0]})`); process.exit(1); }
const fehltExport = ['KLASSEN', 'GENERATOR_REGLER', 'standardEinstellung', 'generiere', 'GENERATOR_VERSION'].filter((n) => !(n in Gen));
if (fehltExport.length) { console.error(`tests/generator.mjs — generator.js exportiert nicht: ${fehltExport.join(', ')}`); process.exit(1); }
const { KLASSEN, GENERATOR_REGLER: R, standardEinstellung, generiere, GENERATOR_VERSION } = Gen;

const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const kopie = (o) => JSON.parse(JSON.stringify(o));
const tiefFrieren = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(tiefFrieren); } return o; };
const unendlich = (o) => (typeof o === 'number' ? !Number.isFinite(o) : o && typeof o === 'object' ? Object.values(o).some(unendlich) : false);
const sicher = (f, fb) => { try { return f(); } catch (e) { return fb(e); } };
const J = (o) => JSON.stringify(o);
const mittel = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const pz = (a, n) => `${a}/${n}`;

const KL = ['korvette', 'fregatte', 'traeger'];
const REGLER = ['laenge', 'breite', 'kantigkeit', 'aufbauten', 'geschuetze', 'triebwerke'];
const einst = (klasse, seed, mehr = {}) => ({ ...standardEinstellung(klasse), seed, ...mehr });
const SEEDS = [1, 999999, ...Array.from({ length: 38 }, (_, i) => 1 + ((i * 104729 + 4711) % 999999))];

// ---------- Messhilfen an der Form ----------
const plusListe = (f) => koerperListe(f).filter((x) => x.k.op === 'plus');
const plusHuellen = (f) => plusListe(f).map(({ k, lage }) => huelle(k, lage));
const ausdehnung = (f, i) => { const h = plusHuellen(f); return h.length ? Math.max(...h.map((q) => q.max[i])) - Math.min(...h.map((q) => q.min[i])) : 0; };
/** Hauptrumpf (E-Frühwarnung): der Plus-Körper mit den meisten Spanten, bei Gleichstand der erste. */
const hauptrumpf = (f) => f.koerper.filter((k) => k.op === 'plus').reduce((a, k) => (!a || k.spanten.length > a.spanten.length ? k : a), null);
const hauptTriebwerke = (f) => bauteilListe(f).filter((e) => antriebArt(BAUTEILE[e.b.typ]) === 'haupt');
const turmEintraege = (f) => bauteilListe(f).filter((e) => GESCHUETZE[e.b.typ]);
const mittlereFase = (f) => mittel(f.koerper.filter((k) => k.op === 'plus').flatMap((k) => k.spanten.map((s) => s.fase ?? 0)));
const ohneName = (f) => J({ ...f, name: '' });
/** Punkt in Polygon (Strahl-Test, xy). */
const innen = ([x, y], poly) => {
  let drin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
};

// ---------- Prüf-Codes einordnen (E5) ----------
const WEICH = new Set(['rohre_kreuzen', 'kein_schussfeld', 'ueber_kante', 'schraeg']), IMMER = new Set(['kein_punkt']);
function bewerte(f) {
  const s = formZuSchiff(f), alle = [...s.meldungen, ...pruefe(f)];
  return {
    s,
    fehler: alle.filter((m) => m.stufe === 'fehler'),
    hart: alle.filter((m) => m.stufe !== 'fehler' && !WEICH.has(m.code) && !IMMER.has(m.code)),
    weich: alle.filter((m) => m.stufe !== 'fehler' && WEICH.has(m.code)),
  };
}

/** Eigene Prüfungen (sehen die Prüf-Codes nicht) → { kategorie: [Text] }. s = formZuSchiff(f) oder null. */
function eigene(f, klasse, s = null) {
  const p = {}, add = (kat, t) => (p[kat] ??= []).push(t);
  if (unendlich(f)) add('endlich', 'Zahl nicht endlich');
  // Budget (E3)
  const minus = f.koerper.filter((k) => k.op === 'minus').length, kl = koerperListe(f).length;
  if (f.koerper.length > 28 || kl > 40 || minus > 5 || f.bauteile.length > 48) add('budget', `Körper ${f.koerper.length}/28, mit Kopien ${kl}/40, Minus ${minus}/5, Bauteile ${f.bauteile.length}/48`);
  // Grunddaten (E1)
  if (f.art !== 'rumpf' || f.andock.length !== 0 || f.version !== VERSION) add('grund', `art ${f.art}, andock ${f.andock.length}, version ${f.version}`);
  const bid = f.bauteile.map((b) => b.id);
  if (new Set(bid).size !== bid.length) add('grund', 'Bauteil-ids doppelt');
  // Symmetrie zu x = 0: Körper ohne Spiegel x liegen mittig und sind nicht um y/z gedreht; Körper mit Spiegel x
  // überspannen x = 0 nicht (sonst zählt die Überlappung doppelt); Bauteile ohne Spiegel auf x = 0, mit Spiegel daneben
  for (const k of f.koerper) {
    const h = huelle(k);
    if (k.spiegel.includes('x')) { if (h.min[0] < -1e-6 && h.max[0] > 1e-6) add('symmetrie', `Körper ${k.id} mit Spiegel x überspannt x = 0 (${h.min[0].toFixed(2)}…${h.max[0].toFixed(2)})`); }
    else if (Math.abs(h.min[0] + h.max[0]) > 1e-6 || k.dreh[1] !== 0 || k.dreh[2] !== 0 || k.spanten.some((sp) => sp.x !== 0))
      add('symmetrie', `Körper ${k.id} ohne Spiegel nicht mittig (x ${h.min[0].toFixed(2)}…${h.max[0].toFixed(2)}, dreh ${k.dreh})`);
  }
  for (const b of f.bauteile) {
    const sp = b.spiegel.includes('x');
    if (sp ? Math.abs(b.p[0]) < 1e-6 : b.p[0] !== 0) add('symmetrie', `Bauteil ${b.id} (${b.typ}) x ${b.p[0]} ${sp ? 'mit' : 'ohne'} Spiegel`);
  }
  // Heck (Frühwarnung Schiffbauer): Triebwerke auf der ebenen Heckkappe des Hauptrumpfs, Scheibe ganz auf der Fläche,
  // nichts steht hinter dem Heck vor, Triebwerke überlappen nicht (Spiegelkopien mitgezählt)
  const H = hauptrumpf(f), tw = hauptTriebwerke(f);
  if (H && tw.length) {
    const lage = koerperMatrix(H);
    const kappen = H.spanten.map((sp) => profilPunkte(sp).map(([x, y]) => wendeK(lage, [x, y, sp.z])));
    const kappe = kappen.reduce((a, q) => (Math.min(...q.map((v) => v[2])) < Math.min(...a.map((v) => v[2])) ? q : a));
    const zH = Math.min(...kappe.map((v) => v[2]));
    if (Math.max(...kappe.map((v) => v[2])) - zH > 1e-6) add('heck', 'Heckkappe des Hauptrumpfs nicht eben');
    const zAlle = Math.min(...plusHuellen(f).map((q) => q.min[2]));
    if (zAlle < zH - 1e-3) add('heck', `Körper steht ${(zH - zAlle).toFixed(2)} m hinter dem Heck vor`);
    const poly = kappe.map((v) => [v[0], v[1]]);
    for (const e of tw) {
      const r = BAUTEILE[e.b.typ].r ?? 1;
      if (Math.abs(e.p[2] - zH) > 1e-3) add('heck', `Triebwerk ${e.b.id} z ${e.p[2]} statt Heck ${zH.toFixed(3)}`);
      const rand = Array.from({ length: 16 }, (_, i) => [e.p[0] + (r - 1e-3) * Math.cos(i * Math.PI / 8), e.p[1] + (r - 1e-3) * Math.sin(i * Math.PI / 8)]);
      if (!rand.every((q) => innen(q, poly))) add('heck', `Triebwerk ${e.b.id} (r ${r}) ragt über die Heckfläche (x ${e.p[0]}, y ${e.p[1]})`);
    }
    for (let i = 0; i < tw.length; i++) for (let j = i + 1; j < tw.length; j++) {
      const a = tw[i], b = tw[j], d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
      if (d < (BAUTEILE[a.b.typ].r ?? 1) + (BAUTEILE[b.b.typ].r ?? 1) - 1e-6) add('ueberlapp', `Triebwerke ${a.b.id}/${b.b.id} ${d.toFixed(2)} m auseinander`);
    }
  }
  // Länge im Klassenbereich (±10 %), Rundung ≤ 0,2 (E2)
  const L = ausdehnung(f, 2), [lo, hi] = KLASSEN[klasse].laenge;
  if (L < lo * 0.9 || L > hi * 1.1) add('laenge', `Länge ${L.toFixed(1)} m außerhalb ${lo}…${hi} ±10 %`);
  if (f.koerper.some((k) => k.spanten.some((sp) => (sp.rundung ?? 0) > 0.2 + 1e-9))) add('rundung', 'Rundung > 0,2');
  // Türme fallen nicht still weg (Kickoff): formZuSchiff macht aus jedem Geschütz-Eintrag einen Turm
  if (s && s.tuerme.length !== turmEintraege(f).length) add('tuerme', `${s.tuerme.length} Türme aus ${turmEintraege(f).length} Geschütz-Einträgen`);
  return p;
}

// ---------- 1) Tabellen ----------
{
  const keys = Object.keys(KLASSEN ?? {});
  const namen = { korvette: ['Korvette', 60, 110], fregatte: ['Fregatte', 120, 200], traeger: ['Träger', 220, 340] };
  const kOk = J(keys) === J(KL) && KL.every((k) => KLASSEN[k].name === namen[k][0] && J(KLASSEN[k].laenge) === J(namen[k].slice(1)));
  zeile('KLASSEN: Schlüssel | Namen | Längenbereich', 'korvette/fregatte/traeger | E3', keys.map((k) => `${k} ${KLASSEN[k].name} ${J(KLASSEN[k].laenge)}`).join(', '), kOk);
  const soll = { laenge: [0, 1], breite: [0.7, 1.3], kantigkeit: [0, 1], aufbauten: [0, 1], geschuetze: [0, 1], triebwerke: [1, 5] };
  const rFehler = [];
  for (const r of REGLER) {
    const g = R?.[r];
    if (!g) { rFehler.push(`${r} fehlt`); continue; }
    const felder = ['name', 'min', 'max', 'schritt', 'standard', 'tipp', 'text'].filter((x) => !(x in g));
    if (felder.length) rFehler.push(`${r} ohne ${felder.join(',')}`);
    if (g.min !== soll[r][0] || g.max !== soll[r][1]) rFehler.push(`${r} ${g.min}…${g.max} statt ${soll[r].join('…')}`);
    if (!(g.schritt > 0) || !(g.standard >= g.min && g.standard <= g.max)) rFehler.push(`${r} schritt ${g.schritt} / standard ${g.standard}`);
    if (r === 'triebwerke' && (g.schritt !== 1 || !Number.isInteger(g.standard))) rFehler.push('triebwerke nicht ganzzahlig');
    for (const k of KL) for (const v of [g.min, g.standard, g.max]) {
      const t = sicher(() => g.text(v, einst(k, 4711, { [r]: v })), (e) => e);
      if (typeof t !== 'string' || !t.length) rFehler.push(`${r}.text(${v}, ${k}) → ${t}`);
    }
  }
  zeile('GENERATOR_REGLER: Felder | Bereiche E2 | standard im Bereich | text() → String', 'alle ok', rFehler.slice(0, 3).join('; ') || 'alle ok', rFehler.length === 0);
  const sFehler = [];
  for (const k of KL) {
    const s = sicher(() => standardEinstellung(k), (e) => ({ fehler: e.message }));
    if (s.klasse !== k || !Number.isInteger(s.seed) || s.seed < 1 || s.seed > 999999) sFehler.push(`${k}: klasse ${s.klasse}, seed ${s.seed}`);
    for (const r of REGLER) if (s[r] !== R[r]?.standard) sFehler.push(`${k}.${r} ${s[r]} ≠ ${R[r]?.standard}`);
    const a = standardEinstellung(k); a.laenge = -99;
    if (standardEinstellung(k).laenge === -99) sFehler.push(`${k}: gibt geteiltes Objekt zurück`);
  }
  zeile('standardEinstellung(k): klasse, Seed 1…999 999, Regler = standard, frisches Objekt', 'alle ok', sFehler.slice(0, 3).join('; ') || 'alle ok', sFehler.length === 0);
  zeile('GENERATOR_VERSION', 'ganze Zahl ≥ 1 (E1: 1)', GENERATOR_VERSION, Number.isInteger(GENERATOR_VERSION) && GENERATOR_VERSION >= 1);
}

// ---------- 2) Gleichlauf ----------
{
  const A = einst('fregatte', 4711), B = einst('traeger', 815, { aufbauten: 1, geschuetze: 1 });
  const a1 = J(generiere(A)), a2 = J(generiere(kopie(A)));
  const b1 = J(generiere(B)), a3 = J(generiere(A));
  zeile('Gleichlauf: gleiche einst → gleiches JSON | Reihenfolge A·B·A (kein Modulzustand)', 'gleich | gleich', `${a1 === a2 ? 'gleich' : 'ANDERS'} | ${a1 === a3 ? 'gleich' : 'ANDERS'}`, a1 === a2 && a1 === a3 && a1 !== b1);
  const fr = tiefFrieren(kopie(B)), vorher = J(fr);
  const g = sicher(() => J(generiere(fr)), (e) => 'WIRFT ' + e.message);
  zeile('Eingabe eingefroren: wirft nicht | einst unverändert | Ergebnis gleich', 'ja | ja | ja', `${g.startsWith('WIRFT') ? g : 'ja'} | ${J(fr) === vorher ? 'ja' : 'NEIN'} | ${g === b1 ? 'ja' : 'NEIN'}`, g === b1 && J(fr) === vorher);
  const f = generiere(A), f2 = generiere(A); f2.koerper[0].pos[1] = 123;
  zeile('Ergebnis ist ein frisches Objekt (Ändern einer Form ändert die nächste nicht)', 'ja', J(generiere(A)) === a1 ? 'ja' : 'NEIN', J(generiere(A)) === a1);
  let anders = 0, erstes = '';
  for (const k of KL) for (const seed of SEEDS.slice(0, 10)) for (const mehr of [{}, { kantigkeit: 0 }, { aufbauten: 1, geschuetze: 1 }]) {
    const x = generiere(einst(k, seed, mehr));
    if (J(normalisiere(x)) !== J(x)) { anders++; erstes ||= `${k} ${seed} ${J(mehr)}`; }
  }
  zeile('normalisiere(f) ändert nichts (strenges JSON, E1)', '0 / 90', anders ? `${anders} (z. B. ${erstes})` : '0', anders === 0);
  void f;
}

// ---------- 3) Form-Satz: Flugtauglichkeit + eigene Prüfungen ----------
const satz = [];
for (const k of KL) for (const seed of SEEDS) satz.push({ k, e: einst(k, seed), etikett: `${k} ${seed} standard` });
for (const k of KL) for (const r of REGLER) for (const ende of ['min', 'max']) for (const seed of SEEDS.slice(0, 5))
  satz.push({ k, e: einst(k, seed, { [r]: R[r][ende] }), etikett: `${k} ${seed} ${r}=${R[r][ende]}` });
for (const k of KL) for (const ende of ['min', 'max']) for (const seed of SEEDS.slice(5, 15))
  satz.push({ k, e: einst(k, seed, Object.fromEntries(REGLER.map((r) => [r, R[r][ende]]))), etikett: `${k} ${seed} alles ${ende}` });
{
  const zaehl = {}, beispiel = {}, merke = (kat, t) => { zaehl[kat] = (zaehl[kat] ?? 0) + 1; beispiel[kat] ??= t; };
  const codes = {};
  for (const { k, e, etikett } of satz) {
    const f = sicher(() => generiere(e), (x) => ({ wirft: x.message }));
    if (f.wirft) { merke('wirft', `${etikett}: ${f.wirft}`); continue; }
    const ev = bewerte(f);
    if (ev.fehler.length) { merke('fehler', `${etikett}: ${ev.fehler.map((m) => m.code).join(',')}`); ev.fehler.forEach((m) => (codes[m.code] = (codes[m.code] ?? 0) + 1)); }
    if (ev.hart.length) { merke('hart', `${etikett}: ${ev.hart.map((m) => m.code).join(',')}`); ev.hart.forEach((m) => (codes[m.code] = (codes[m.code] ?? 0) + 1)); }
    if (ev.weich.length) { merke('weich', `${etikett}: ${ev.weich.map((m) => m.code).join(',')}`); ev.weich.forEach((m) => (codes[m.code] = (codes[m.code] ?? 0) + 1)); }
    if (f.name !== `${KLASSEN[k].name} ${e.seed}`) merke('name', `${etikett}: „${f.name}“`);
    for (const [kat, t] of Object.entries(eigene(f, k, ev.s))) merke(kat, `${etikett}: ${t[0]}`);
  }
  const N = satz.length, z = (kat) => zaehl[kat] ?? 0, bsp = (kat) => (z(kat) ? ` — ${beispiel[kat]}` : '');
  zeile(`generiere wirft nicht (${N} Formen)`, '0', z('wirft') + bsp('wirft'), z('wirft') === 0);
  zeile('Fehler (pruefeSchiff + pruefe), E5: 0 bei 100 %', '0', pz(z('fehler'), N) + bsp('fehler'), z('fehler') === 0);
  zeile('Harte Warnungen (alle außer weich + kein_punkt)', '0', pz(z('hart'), N) + bsp('hart'), z('hart') === 0);
  zeile('Weiche Warnungen (rohre_kreuzen, kein_schussfeld, ueber_kante, schraeg)', '≤ 5 %', `${pz(z('weich'), N)} = ${(100 * z('weich') / N).toFixed(1)} %${bsp('weich')}`, z('weich') <= 0.05 * N);
  zeile('Codes gesamt (Formen je Code)', 'Info', Object.entries(codes).map(([c, n]) => `${c} ${n}`).join(', ') || 'keine', true);
  zeile('Name „<Klasse> <Seed>“', '0 abweichend', z('name') + bsp('name'), z('name') === 0);
  zeile('Budget: Körper ≤ 28, mit Kopien ≤ 40, Minus ≤ 5, Bauteile ≤ 48 (E3)', '0', z('budget') + bsp('budget'), z('budget') === 0);
  zeile('Grunddaten: art rumpf, andock [], version, Bauteil-ids eindeutig, endlich', '0', (z('grund') + z('endlich')) + bsp('grund') + bsp('endlich'), z('grund') + z('endlich') === 0);
  zeile('Symmetrie zu x = 0 (Körper + Bauteile, Spiegelkörper überspannen x = 0 nicht)', '0', z('symmetrie') + bsp('symmetrie'), z('symmetrie') === 0);
  zeile('Heck: Triebwerke auf ebener Heckkappe, Scheibe auf der Fläche, nichts dahinter', '0', z('heck') + bsp('heck'), z('heck') === 0);
  zeile('Triebwerke überlappen nicht (inkl. Spiegelkopien)', '0', z('ueberlapp') + bsp('ueberlapp'), z('ueberlapp') === 0);
  zeile('Türme fallen nicht still weg (formZuSchiff.tuerme = Geschütz-Einträge)', '0', z('tuerme') + bsp('tuerme'), z('tuerme') === 0);
  zeile('Länge im Klassenbereich ±10 % | Rundung ≤ 0,2', '0 | 0', `${z('laenge')} | ${z('rundung')}${bsp('laenge')}${bsp('rundung')}`, z('laenge') + z('rundung') === 0);
}

// ---------- 4) Regler-Wirkung + Teilströme ----------
{
  const SR = SEEDS.slice(0, 10);
  /** Für jeden Seed und jede Klasse: Messwert bei min und max (übrige Regler Standard). */
  const vergleich = (r, mess, a = R[r].min, b = R[r].max) => {
    const paare = [];
    for (const k of KL) for (const seed of SR) paare.push([mess(generiere(einst(k, seed, { [r]: a }))), mess(generiere(einst(k, seed, { [r]: b })))]);
    return paare;
  };
  const regel = (name, paare, richtung, streng = true) => {
    const gut = paare.filter(([a, b]) => (richtung > 0 ? (streng ? b > a : b >= a) : (streng ? b < a : b <= a))).length;
    const ma = mittel(paare.map((p) => p[0])), mb = mittel(paare.map((p) => p[1]));
    const ok = gut >= 0.8 * paare.length && (richtung > 0 ? mb > ma : mb < ma) || (!streng && gut === paare.length);
    zeile(`Regler ${name}`, `${richtung > 0 ? '↑' : '↓'} in ≥ 80 % + Mittel`, `${pz(gut, paare.length)} | Mittel ${ma.toFixed(2)} → ${mb.toFixed(2)}`, ok);
  };
  regel('laenge min→max: Länge z (m)', vergleich('laenge', (f) => ausdehnung(f, 2)), 1);
  regel('breite min→max: Breite x (m)', vergleich('breite', (f) => ausdehnung(f, 0)), 1);
  regel('kantigkeit 0→1: mittlere Fase', vergleich('kantigkeit', mittlereFase), -1);
  regel('kantigkeit 0→1: Spanten Hauptrumpf (≥)', vergleich('kantigkeit', (f) => hauptrumpf(f).spanten.length), 1, false);
  regel('aufbauten 0→1: Körperzahl', vergleich('aufbauten', (f) => f.koerper.length), 1);
  regel('geschuetze 0→1: Geschütz-Einträge', vergleich('geschuetze', (f) => turmEintraege(f).length), 1);
  const ohne = KL.flatMap((k) => SR.map((seed) => turmEintraege(generiere(einst(k, seed, { geschuetze: 0 }))).length));
  zeile('geschuetze = 0 → keine Türme', '0 überall', `max ${Math.max(...ohne)}`, Math.max(...ohne) === 0);
  const rund = KL.flatMap((k) => SR.map((seed) => Math.max(0, ...generiere(einst(k, seed, { kantigkeit: 1 })).koerper.flatMap((kk) => kk.spanten.map((s) => s.rundung ?? 0)))));
  zeile('kantigkeit = 1 → Rundung 0 (E2)', '0 überall', `max ${Math.max(...rund)}`, Math.max(...rund) === 0);
  const tw = [];
  for (const k of KL) for (const seed of SR.slice(0, 5)) for (let n = R.triebwerke.min; n <= R.triebwerke.max; n++) {
    const f = generiere(einst(k, seed, { triebwerke: n })), t = hauptTriebwerke(f);
    tw.push({ k, seed, n, ist: t.length, mitte: n % 2 === 1 ? t.some((e) => e.p[0] === 0 && !e.b.spiegel.includes('x')) : true });
  }
  const twFalsch = tw.filter((x) => x.ist !== x.n || !x.mitte);
  zeile('triebwerke = Anzahl Haupttriebwerke (inkl. Kopien), ungerade → eins auf x = 0 (E2)', `0 / ${tw.length}`, twFalsch.length ? `${twFalsch.length} — z. B. ${twFalsch[0].k} ${twFalsch[0].seed} n=${twFalsch[0].n}: ${twFalsch[0].ist}${twFalsch[0].mitte ? '' : ', keins mittig'}` : '0', twFalsch.length === 0);
  // Teilströme (E6): aufbauten ändern → Hauptrumpf bitgleich
  let tsAnders = 0, tsBsp = '';
  for (const k of KL) for (const seed of SR) {
    const h = [0, R.aufbauten.standard, 1].map((v) => J(hauptrumpf(generiere(einst(k, seed, { aufbauten: v })))));
    if (h[0] !== h[1] || h[1] !== h[2]) { tsAnders++; tsBsp ||= `${k} ${seed}`; }
  }
  zeile('Teilströme: aufbauten 0 / Standard / 1 → Hauptrumpf bitgleich (E6)', `0 / ${KL.length * SR.length}`, tsAnders ? `${tsAnders} — z. B. ${tsBsp}` : '0', tsAnders === 0);
}

// ---------- 5) Schlechte Eingaben, Vielfalt, Laufzeit, Probeflug, Import-Regel ----------
{
  const FALL = [
    ['undefined', undefined, null], ['null', null, null], ['{}', {}, null], ['Klasse unbekannt', { klasse: 'xyz', seed: 5 }, 'fregatte'],
    ['seed NaN', { klasse: 'korvette', seed: NaN }, null], ['seed 0', { klasse: 'korvette', seed: 0 }, null, 1], ['seed −5', { klasse: 'korvette', seed: -5 }, null, 1],
    ['seed 2e6', { klasse: 'traeger', seed: 2e6 }, null, 999999], ['seed 4711,6', { klasse: 'fregatte', seed: 4711.6 }, null], ['seed "4711"', { klasse: 'fregatte', seed: '4711' }, null],
    ['Regler Müll', { klasse: 'traeger', seed: 7, laenge: 1e9, breite: -1e9, kantigkeit: NaN, aufbauten: 'x', geschuetze: Infinity, triebwerke: 99 }, null],
    ['triebwerke 0', { klasse: 'korvette', seed: 7, triebwerke: 0 }, null], ['triebwerke 2,5', { klasse: 'fregatte', seed: 7, triebwerke: 2.5 }, null],
  ];
  const probleme = [];
  for (const [name, e, klasseSoll, seedSoll] of FALL) {
    const f = sicher(() => generiere(e), (x) => ({ wirft: x.message }));
    if (f.wirft) { probleme.push(`${name}: wirft ${f.wirft}`); continue; }
    const m = /^(.+) (\d+)$/.exec(f.name ?? ''), kl = KL.find((k) => KLASSEN[k].name === m?.[1]), seed = m ? Number(m[2]) : NaN;
    if (!kl || !(seed >= 1 && seed <= 999999)) { probleme.push(`${name}: Name „${f.name}“`); continue; }
    if (klasseSoll && kl !== klasseSoll) probleme.push(`${name}: Klasse ${kl} statt ${klasseSoll}`);
    if (seedSoll && seed !== seedSoll) probleme.push(`${name}: Seed ${seed} statt ${seedSoll}`);
    if (unendlich(f) || J(normalisiere(f)) !== J(f)) probleme.push(`${name}: nicht endlich/normalisiert`);
    const ev = bewerte(f);
    if (ev.fehler.length) probleme.push(`${name}: ${ev.fehler.map((x) => x.code).join(',')}`);
    const eg = Object.keys(eigene(f, kl, ev.s)); if (eg.length) probleme.push(`${name}: eigene ${eg.join(',')}`);
  }
  zeile(`Schlechte Eingaben (${FALL.length}): wirft nicht, geklemmt, Name/Seed, 0 Fehler`, '0', probleme.slice(0, 3).join('; ') || '0', probleme.length === 0);

  const viel = KL.map((k) => new Set(SEEDS.slice(0, 20).map((seed) => ohneName(generiere(einst(k, seed))))).size);
  zeile('Vielfalt: 20 Seeds je Klasse → verschiedene Formen (ohne Name)', '≥ 15 je Klasse', viel.join(' / '), viel.every((n) => n >= 15));

  // Laufzeit: Träger, Standard und alles max (größte Formen), nach Aufwärmen
  const max = Object.fromEntries(REGLER.map((r) => [r, R[r].max]));
  for (const seed of SEEDS.slice(0, 5)) generiere(einst('traeger', seed, max));
  const zeiten = [];
  for (const seed of SEEDS.slice(10, 40)) for (const mehr of [{}, max]) { const t0 = performance.now(); generiere(einst('traeger', seed, mehr)); zeiten.push(performance.now() - t0); }
  zeiten.sort((a, b) => a - b);
  const med = zeiten[Math.floor(zeiten.length / 2)], p95 = zeiten[Math.floor(zeiten.length * 0.95)], top = zeiten[zeiten.length - 1];
  zeile('Laufzeit generiere (Träger Standard + alles max, 60 Aufrufe): Median | 95 %', '≤ 20 ms | ≤ 50 ms', `${med.toFixed(1)} | ${p95.toFixed(1)} ms`, med <= 20 && p95 <= 50);
  zeile('Laufzeit generiere: längster Aufruf (GC-Ausreißer möglich)', '≤ 50 ms', `${top.toFixed(1)} ms`, top <= 50, false);

  // Probeflug je Klasse: 5 s Vollgas, endlich, fährt vorwärts, Gleichlauf
  const flug = KL.map((k) => {
    const s = formZuSchiff(generiere(einst(k, 4711)));
    const flieg = () => { const sim = erstelleSchiffSim(s.werte); for (let i = 0; i < 300; i++) { sim.z.hebel = 1; sim.schritt(1 / 60, { hebel: 1 }); } return sim.z.pos.toArray(); };
    const a = flieg(), b = flieg();
    return { k, ok: s.flugtauglich && a.every(Number.isFinite) && Math.hypot(...a) > 1 && J(a) === J(b), weg: Math.hypot(...a) };
  });
  zeile('Probeflug je Klasse (Seed 4711, 5 s Vollgas): flugtauglich, endlich, fährt, Gleichlauf', 'alle ok', flug.map((x) => `${x.k} ${x.weg.toFixed(0)} m${x.ok ? '' : ' FEHLER'}`).join(', '), flug.every((x) => x.ok));

  // Import-Regel (CLAUDE.md 1, Protokoll R20): nur aus src/sim, kein three/grafik/werkstatt, kein Zufall/Uhr
  const datei = fileURLToPath(PFAD), code = readFileSync(datei, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sim = fileURLToPath(new URL('../src/sim/', import.meta.url)).toLowerCase();
  const schlecht = [];
  for (const [, ziel] of code.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
    const echt = ziel.startsWith('.') ? fileURLToPath(new URL(ziel, PFAD)).toLowerCase() : ziel;
    if (!process.env.GENERATOR_MODUL && !echt.startsWith(sim)) schlecht.push(ziel);
    if (/three|grafik|werkstatt/.test(ziel)) schlecht.push(ziel);
  }
  for (const v of ['Math.random', 'Date.now', 'new Date', 'performance.now', 'document.', 'window.', 'localStorage']) if (code.includes(v)) schlecht.push(v);
  zeile('generator.js: Importe nur aus src/sim, kein three/grafik, kein Math.random/Uhr/DOM', '0', schlecht.join(', ') || '0', schlecht.length === 0);
}

// ---------- 6) Gegenproben: die eigenen Prüfungen müssen anschlagen ----------
{
  const f0 = generiere(einst('fregatte', 4711, { geschuetze: 1 }));
  const gp = (name, kat, aendern, mitBewertung = false) => {
    const x = kopie(f0); const hinweis = aendern(x); const f = normalisiere(x);
    if (hinweis === false) { zeile(`Gegenprobe ${name}`, 'schlägt an', 'nicht anwendbar (Teil fehlt)', false, false); return; }
    const ev = mitBewertung ? bewerte(f) : null;
    const hit = kat === 'meldung' ? ev.fehler.length + ev.hart.length > 0 : !!eigene(f, 'fregatte', ev?.s ?? (kat === 'tuerme' ? formZuSchiff(f) : null))[kat];
    zeile(`Gegenprobe ${name}`, 'schlägt an', hit ? 'schlägt an' : 'STUMM', hit);
  };
  const twIdx = (x) => x.bauteile.findIndex((b) => antriebArt(BAUTEILE[b.typ]) === 'haupt');
  gp('Triebwerk 3 m vor dem Heck (z + 3)', 'heck', (x) => { const i = twIdx(x); if (i < 0) return false; x.bauteile[i].p[2] += 3; });
  gp('Triebwerk über der Heckfläche (y + Höhe)', 'heck', (x) => { const i = twIdx(x); if (i < 0) return false; x.bauteile[i].p[1] += ausdehnung(f0, 1); });
  gp('Körper 5 m hinter dem Heck', 'heck', (x) => { const h = hauptrumpf(x), k = kopie(h); k.id = 900; k.pos = [k.pos[0], k.pos[1], k.pos[2] - 5]; x.koerper.push(k); });
  gp('Triebwerk doppelt an derselben Stelle', 'ueberlapp', (x) => { const i = twIdx(x); if (i < 0) return false; x.bauteile.push({ ...kopie(x.bauteile[i]), id: 901 }); });
  gp('Hauptrumpf 2 m nach links', 'symmetrie', (x) => { const h = x.koerper.find((k) => k.id === hauptrumpf(x).id); h.pos[0] += 2; });
  gp('Bauteil auf x = 0 mit Spiegel x', 'symmetrie', (x) => { const b = x.bauteile.find((q) => !q.spiegel.includes('x')) ?? x.bauteile[0]; b.p[0] = 0; b.spiegel = ['x']; });
  gp('Spiegelkörper über x = 0', 'symmetrie', (x) => { const k = kopie(hauptrumpf(x)); k.id = 902; k.spiegel = ['x']; k.pos = [1, k.pos[1], k.pos[2]]; x.koerper.push(k); });
  gp('30 Körper mehr (Budget)', 'budget', (x) => { for (let i = 0; i < 30; i++) x.koerper.push({ ...kopie(x.koerper[0]), id: 1000 + i }); });
  gp('Länge × 3 (außerhalb Klassenbereich)', 'laenge', (x) => { x.koerper.forEach((k) => { k.pos[2] *= 3; k.spanten.forEach((s) => (s.z *= 3)); }); x.bauteile.forEach((b) => (b.p[2] *= 3)); });
  gp('Rundung 0,5', 'rundung', (x) => { x.koerper[0].spanten[0].rundung = 0.5; });
  gp('Alle Triebwerke 2 m höher (schub_versatz)', 'meldung', (x) => { if (twIdx(x) < 0) return false; x.bauteile.forEach((b) => { if (antriebArt(BAUTEILE[b.typ]) === 'haupt') b.p[1] += 2; }); }, true);
  gp('Turm auf der Seitenfläche (seitenmontage)', 'meldung', (x) => { const b = x.bauteile.find((q) => GESCHUETZE[q.typ]); if (!b) return false; b.n = [1, 0, 0]; }, true);
}

const dauer = (performance.now() - START) / 1000;
zeile('Dauer der ganzen Datei', '≤ 20 s', `${dauer.toFixed(1)} s`, dauer <= 20, false);
console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

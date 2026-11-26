// ZWECK: Prüfungen ohne Browser für Bauteile der Form-Werkstatt (Runde 19, `node tests/bauteile.mjs`) gegen die
//        Schnittstelle (Protokoll R19, Entscheidungen 1–12) — unabhängig von Waffentechniker/Flugsystem/Schiffbauer.
//   1) normalisiere (bauteile) + bauteilListe (Spiegelkopien, Kopie auf dem Original entfällt).
//   2) turmAusBauteil: gleiche Felder wie turmDaten, Fuß auf der Fläche (eigene Höhenprobe), Spiegelregeln über die
//      Welt-Richtung der Gier-Mitte, Seitenmontage → null.
//   3) pruefeGeschuetze + flugwerte: jeder Code aus E3 mit kleinstem Fall (Code vorhanden, zeigt aufs Bauteil),
//      Bezugsform ohne Fehler (Gegenprobe „behoben“).
//   4) flugwerte: Schlüssel = WERTE.bollwerk, Masse/Schwerpunkt/Schubpunkt/Schub nachgerechnet, Gesetze (mehr Schub →
//      mehr aVor, mehr Masse → weniger), vMax ≤ 85, Eichung Bollwerk-/Ambos-artig ±20 % (Drehungen ±35 %).
//   5) formKugeln, formZuSchiff (Ursprung = Schwerpunkt, lückenlose Turm-ids, Düsen), Probeflug mit erstelleSchiffSim.
//   Jede Gegenprobe (Zeile „Gegenprobe …“) füttert die Prüfung mit absichtlich falschen Daten und MUSS anschlagen.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER oder fehlendem Modul.
import { neuerKoerper, normalisiere, bauteilListe, volumen, huelle, koerperListe, profilPunkte, wendeK, DICHTE } from '../src/sim/form/form.js';
import { WERTE } from '../src/sim/werte.js';
import { TURM } from '../src/sim/schiffe/turm.js';
import { erstelleSchiffSim } from '../src/sim/schiff.js';

// ---------- Module der Runde (fehlend → klare Meldung) ----------
const laden = async (pfad, namen) => {
  try { const m = await import(pfad); const fehlt = namen.filter((n) => !(n in m)); return fehlt.length ? `${pfad}: exportiert nicht ${fehlt.join(', ')}` : m; }
  catch (e) { return `${pfad} fehlt oder lädt nicht (${e.code ?? ''} ${String(e.message).split('\n')[0]})`; }
};
const G = await laden('../src/sim/form/geschuetze.js', ['GESCHUETZE', 'turmAusBauteil', 'pruefeGeschuetze']);
const F = await laden('../src/sim/form/flug.js', ['ANTRIEBE', 'flugwerte']);
const K = await laden('../src/sim/form/kugeln.js', ['formKugeln']);
const fehlend = [G, F, K].filter((x) => typeof x === 'string');
if (fehlend.length) { console.error('tests/bauteile.mjs — Prüfung nicht möglich:\n  ' + fehlend.join('\n  ')); process.exit(1); }
// bauteile.js (formZuSchiff) baut die Projektleitung nach dem Merge — fehlt es, wird nur dieser Teil rot
const B = await laden('../src/sim/form/bauteile.js', ['BAUTEILE', 'formZuSchiff']);
const { GESCHUETZE, turmAusBauteil, pruefeGeschuetze } = G, { ANTRIEBE, flugwerte } = F, { formKugeln } = K;
const KAT = typeof B === 'string' ? { ...GESCHUETZE, ...ANTRIEBE } : B.BAUTEILE;

const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const kopie = (o) => JSON.parse(JSON.stringify(o));
const tiefFrieren = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(tiefFrieren); } return o; };
const abst = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const unendlich = (o) => (typeof o === 'number' ? !Number.isFinite(o) : o && typeof o === 'object' ? Object.values(o).some(unendlich) : false);
const sicher = (f, fb) => { try { return f(); } catch (e) { return fb(e); } };
const N = (f) => normalisiere(f);

// ---------- Bezugsformen (E6, feste Maße) ----------
const quader = (id, laenge, b, h, { pos = [0, 0, 0], op = 'plus', spiegel = [], dreh = [0, 0, 0] } = {}) =>
  ({ ...neuerKoerper('quader', id, { pos, op }), dreh, spiegel, spanten: [{ z: -laenge / 2, b, h }, { z: laenge / 2, b, h }] });
const T = (id, typ, p, n, mehr = {}) => ({ id, typ, p, n, spiegel: [], ...mehr });
const BOLLWERK_ART = tiefFrieren(N({ name: 'Bezug Bollwerk', art: 'rumpf', koerper: [quader(0, 255, 21, 15)], bauteile: [
  T(0, 'triebwerk_l', [5, 4, -127.5], [0, 0, -1]), T(1, 'triebwerk_l', [-5, 4, -127.5], [0, 0, -1]),
  T(2, 'triebwerk_l', [5, -4, -127.5], [0, 0, -1]), T(3, 'triebwerk_l', [-5, -4, -127.5], [0, 0, -1]),
  T(4, 'steuer', [0, 7.5, 110], [0, 1, 0]), T(5, 'steuer', [0, -7.5, 110], [0, -1, 0]),
  T(6, 'steuer', [0, 7.5, -110], [0, 1, 0]), T(7, 'steuer', [0, -7.5, -110], [0, -1, 0]),
] }));
const AMBOS_ART = tiefFrieren(N({ name: 'Bezug Ambos', art: 'rumpf', koerper: [quader(0, 150, 14, 10)], bauteile: [
  T(0, 'triebwerk_m', [3, 0, -75], [0, 0, -1]), T(1, 'triebwerk_m', [-3, 0, -75], [0, 0, -1]),
  T(2, 'steuer', [0, 5, 65], [0, 1, 0]), T(3, 'steuer', [0, -5, 65], [0, -1, 0]),
  T(4, 'steuer', [0, 5, -65], [0, 1, 0]), T(5, 'steuer', [0, -5, -65], [0, -1, 0]),
] }));
/** Form aus der Bollwerk-Bezugsform ableiten: f bekommt veränderbare Kopien von koerper und bauteile. */
const ab = (basis, f) => { const x = kopie(basis); f(x); return N(x); };
const mitTeil = (basis, ...teile) => ab(basis, (x) => x.bauteile.push(...teile));
const GESCH = Object.keys(GESCHUETZE)[0], SCHWER = GESCHUETZE.schwer ? 'schwer' : GESCH;

// ---------- 1) normalisiere (bauteile), bauteilListe ----------
{
  const MUELL = [NaN, Infinity, null, undefined, 'x', {}, [], -1e308, 0.5, -7];
  let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647, m = () => MUELL[Math.floor(rnd() * MUELL.length)];
  const fehler = [];
  for (let i = 0; i < 200; i++) {
    const roh = { bauteile: rnd() < 0.1 ? m() : Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ id: m(), typ: m(), p: [m(), m(), m()], n: [m(), m(), m()], spiegel: rnd() < 0.5 ? ['x', 'q'] : m(), fest: m() })) };
    const vorher = JSON.stringify(roh), n1 = sicher(() => N(roh), (e) => ({ fehler: e.message }));
    if (n1.fehler) { fehler.push(n1.fehler); continue; }
    const n2 = N(n1);
    for (const b of n1.bauteile) {
      if (unendlich(b) || !Number.isInteger(b.id) || typeof b.typ !== 'string' || b.n.filter((x) => x === 0).length !== 2 || !b.n.some((x) => Math.abs(x) === 1)
        || !Array.isArray(b.spiegel) || b.spiegel.some((a) => !['x', 'y', 'z'].includes(a))) fehler.push(JSON.stringify(b));
    }
    if (JSON.stringify(n1) !== JSON.stringify(n2)) fehler.push(`nicht idempotent ${i}`);
    if (JSON.stringify(roh) !== vorher) fehler.push(`Eingabe geändert ${i}`);
  }
  zeile('normalisiere bauteile (200 Müll-Formen): endlich, id ganz, n Achse, spiegel ⊆ x/y/z, idempotent, Eingabe bleibt', '0', fehler.slice(0, 3).join(' | ') || 0, fehler.length === 0);
  const leer = N({ bauteile: [{ typ: 'flak' }] }).bauteile[0];
  zeile('Bauteil ohne Normale → n = +Y, p = 0', '[0,1,0] | [0,0,0]', `${JSON.stringify(leer.n)} | ${JSON.stringify(leer.p)}`, JSON.stringify(leer.n) === '[0,1,0]' && JSON.stringify(leer.p) === '[0,0,0]');

  // bauteilListe
  const f1 = N({ bauteile: [T(0, 'flak', [3, 7.5, 10], [0, 1, 0], { spiegel: ['x'] }), T(1, 'flak', [0, 7.5, 20], [0, 1, 0], { spiegel: ['x'] }),
    T(2, 'flak', [3, 7.5, 30], [0, 1, 0], { spiegel: ['x', 'y'] }), T(3, 'steuer', [10.5, 0, 0], [1, 0, 0], { spiegel: ['x', 'z'] })] });
  const l = bauteilListe(f1), zaehl = (id) => l.filter((e) => e.b.id === id).length;
  const c0 = l.find((e) => e.b.id === 0 && e.kopie), c2y = l.find((e) => e.b.id === 2 && e.spiegel && e.spiegel[1] === -1 && e.spiegel[0] === 1);
  const c3 = l.find((e) => e.b.id === 3 && e.spiegel?.[0] === -1 && e.spiegel?.[2] === 1);
  zeile('bauteilListe: Anzahl (x | x auf der Mitte | x+y)', '2 | 1 | 4', `${zaehl(0)} | ${zaehl(1)} | ${zaehl(2)}`, zaehl(0) === 2 && zaehl(1) === 1 && zaehl(2) === 4);
  // Befund R19 (weich, an die Projektleitung): Steuerdüse auf z = 0 mit Spiegel x+z — die z-Kopie liegt auf dem Original
  // (entfällt), die xz-Kopie aber genau auf der x-Kopie und bleibt → doppelte Masse/Schub an derselben Stelle
  const orte = l.filter((e) => e.b.id === 3).map((e) => JSON.stringify([...e.p, ...e.n]));
  zeile('bauteilListe: x+z auf z = 0 — keine zwei Einträge an derselben Stelle', `${new Set(orte).size} Einträge`, `${orte.length} Einträge`, orte.length === new Set(orte).size, false);
  zeile('bauteilListe: Kopie gespiegelt (p, n, spiegel-Vektor)', 'x: −3 | y: n −Y | x an der Seite: n −X',
    `${c0?.p.join('/')} | ${c2y?.n.join('/')} | ${c3?.n.join('/')}`,
    !!c0 && abst(c0.p, [-3, 7.5, 10]) === 0 && JSON.stringify(c0.n) === '[0,1,0]' && JSON.stringify(c0.spiegel) === '[-1,1,1]'
    && !!c2y && abst(c2y.p, [3, -7.5, 30]) === 0 && JSON.stringify(c2y.n) === '[0,-1,0]' && !!c3 && JSON.stringify(c3.n) === '[-1,0,0]');
}

// ---------- 2) turmAusBauteil ----------
const FELDER = ['id', 'x', 'y', 'z', 'oben', 'typ', 's', 'sockel', 'schuerze', 'zapfen', 'muendungen', 'gier', 'nick'];
/** Welt-Richtung der Gier-Mitte eines Turms (Turmrahmen unten: x gespiegelt, wie turm.js/tests/schiffe.mjs). */
const weltGier = (t) => [Math.sin(t.gier[0]) * (t.oben ? 1 : -1), Math.cos(t.gier[0])];
{
  const basis = BOLLWERK_ART;
  const fehler = [], spiegelFalsch = [];
  for (const typ of Object.keys(GESCHUETZE)) {
    const g = GESCHUETZE[typ];
    for (const [p, n] of [[[4, 7.5, 40], [0, 1, 0]], [[-6, -7.5, -30], [0, -1, 0]]]) {
      const form = mitTeil(basis, T(20, typ, p, n, { spiegel: ['x', 'y', 'z'] }));
      const liste = bauteilListe(form).filter((e) => e.b.id === 20);
      const t0 = sicher(() => turmAusBauteil(liste[0], 0, form), (e) => ({ fehler: e.message }));
      if (!t0 || t0.fehler) { fehler.push(`${typ}: ${t0?.fehler ?? 'null'}`); continue; }
      const s = t0.s, mz = (TURM.rohrZ + TURM.rohrL / 2) * s;
      const felder = Object.keys(t0).sort().join() === [...FELDER].sort().join();
      const soll = t0.id === 0 && t0.x === p[0] && t0.z === p[2] && t0.oben === (n[1] > 0) && t0.typ === g.turm.typ && s === g.turm.s
        && Math.abs(t0.y - p[1]) < 1e-9 && Math.abs(t0.schuerze - 0.1) < 1e-9 // flache Deckfläche: Fuß genau auf der Fläche (E2)
        && Math.abs(t0.zapfen.y - (t0.sockel + TURM.zapfenY * s)) < 1e-9 && Math.abs(t0.zapfen.z - TURM.zapfenZ * s) < 1e-9
        && JSON.stringify(t0.muendungen) === JSON.stringify([{ x: TURM.rohrX * s, y: 0, z: mz }, { x: -TURM.rohrX * s, y: 0, z: mz }])
        && Math.abs(t0.gier[1] - g.gier[1]) < 1e-9 && JSON.stringify(t0.nick) === JSON.stringify(g.nick);
      if (!felder || !soll) fehler.push(`${typ} ${n[1] > 0 ? 'oben' : 'unten'}: ${JSON.stringify(t0)}`);
      // Spiegelkopien: Gier-Mitte zeigt in der Welt genau gespiegelt (E2: x: g → −g, y: −g + oben↔unten, z: π − g)
      const w0 = weltGier(t0);
      for (const e of liste.slice(1)) {
        const t = turmAusBauteil(e, 1, form), S = e.spiegel, w = weltGier(t);
        if (abst(w, [w0[0] * S[0], w0[1] * S[2]]) > 1e-9 || t.oben !== (e.n[1] > 0) || Math.abs(t.gier[1] - t0.gier[1]) > 1e-9 || abst([t.x, t.y, t.z], e.p) > 1e-9)
          spiegelFalsch.push(`${typ} S ${S}: Welt ${w.map((x) => x.toFixed(3))} statt ${[w0[0] * S[0], w0[1] * S[2]].map((x) => x.toFixed(3))}`);
      }
    }
  }
  zeile(`turmAusBauteil (${Object.keys(GESCHUETZE).length} Geschütze × oben/unten): Felder wie turmDaten, Werte aus Katalog + TURM, Fuß auf der Fläche`, '0 falsch', fehler.slice(0, 2).join(' | ') || 0, fehler.length === 0);
  zeile('turmAusBauteil: Spiegelkopien (x, y, z und Kombinationen) — Gier-Mitte in der Welt gespiegelt', '0 falsch', spiegelFalsch.slice(0, 2).join(' | ') || 0, spiegelFalsch.length === 0);
  const gegen = (() => { const t0 = { gier: [0.7, 1], oben: true }, t = { gier: [0.7, 1], oben: true }; return abst(weltGier(t), [weltGier(t0)[0] * -1, weltGier(t0)[1]]) > 1e-9; })();
  zeile('Gegenprobe Spiegelregel: Kopie an x ohne g → −g', 'rot', gegen ? 'rot' : 'grün', gegen);
  // „aussen“: Gier-Mitte zeigt von x = 0 weg (nur Katalog-Einträge mit aussen)
  const aussen = Object.entries(GESCHUETZE).filter(([, g]) => g.aussen);
  const aFalsch = [];
  for (const [typ] of aussen) for (const x of [6, -6]) for (const ny of [1, -1]) {
    const form = mitTeil(basis, T(20, typ, [x, 7.5 * ny, 0], [0, ny, 0])), t = turmAusBauteil(bauteilListe(form).find((e) => e.b.id === 20), 0, form);
    if (!(Math.sign(weltGier(t)[0]) === Math.sign(x) || Math.abs(weltGier(t)[0]) < 1e-9)) aFalsch.push(`${typ} x ${x} ${ny > 0 ? 'oben' : 'unten'}`);
  }
  zeile(`turmAusBauteil „aussen“ (${aussen.length} Einträge): Gier-Mitte zeigt von x = 0 weg`, '0 falsch', aFalsch.join(', ') || 0, aFalsch.length === 0);
  // Seitenmontage → null
  const seite = mitTeil(basis, T(20, GESCH, [10.5, 0, 0], [1, 0, 0])), ts = turmAusBauteil(bauteilListe(seite).find((e) => e.b.id === 20), 0, seite);
  zeile('turmAusBauteil an einer Seitenfläche (n = +X)', 'null', JSON.stringify(ts), ts === null);
  // Höhenprobe auf gewölbter Fläche (Zylinder liegend): y = höchster Ringpunkt ≥ p.y, schuerze > 0,1 (Info: Werte)
  const zyl = N({ koerper: [{ ...neuerKoerper('zylinder', 0), spanten: [{ z: -20, b: 12, h: 12, rundung: 1 }, { z: 20, b: 12, h: 12, rundung: 1 }] }], bauteile: [T(0, GESCH, [1.5, 5.8, 0], [0, 1, 0])] });
  const tz = turmAusBauteil(bauteilListe(zyl)[0], 0, zyl);
  zeile('Höhenprobe auf Zylinder (r 6, Fuß bei x 1,5): y ≥ Treffer, schuerze > 0,1', 'ja', tz ? `y ${tz.y.toFixed(3)}, schuerze ${tz.schuerze.toFixed(3)}` : 'null', !!tz && tz.y >= 5.8 - 1e-6 && tz.y <= 6 + 1e-6 && tz.schuerze > 0.1);
}

// ---------- 3) Meldungs-Codes ----------
const hat = (ms, code, bauteil) => ms.some((m) => m.code === code && (bauteil === undefined || m.bauteil === bauteil));
const STUFE = { seitenmontage: 'fehler', im_rumpf: 'fehler', zu_dicht: 'fehler', auf_spiegelebene: 'fehler', schraeg: 'warnung', ueber_kante: 'warnung',
  rohre_kreuzen: 'warnung', kein_schussfeld: 'warnung', kein_antrieb: 'fehler', zu_schwach: 'fehler', antrieb_flaeche: 'fehler', masse_null: 'fehler',
  schub_versatz: null, keine_steuerduesen: 'warnung', steuer_am_schwerpunkt: 'warnung', unbekannt: 'warnung' };
{
  const B0 = BOLLWERK_ART, oben = (id, typ, x, z, mehr) => T(id, typ, [x, 7.5, z], [0, 1, 0], mehr);
  const geschBasis = mitTeil(B0, oben(20, GESCH, 0, 60));
  // [Code, Form, Bauteil-id oder undefined, Prüffunktion]
  const pg = (f) => pruefeGeschuetze(f), fw = (f) => flugwerte(f, KAT).meldungen;
  const FAELLE = [
    ['seitenmontage', mitTeil(B0, T(20, GESCH, [10.5, 0, 60], [1, 0, 0])), 20, pg],
    ['im_rumpf', mitTeil(B0, T(20, GESCH, [0, 3, 60], [0, 1, 0])), 20, pg],
    ['zu_dicht', mitTeil(B0, oben(20, GESCH, 0, 60), oben(21, GESCH, 0, 61)), undefined, pg],
    ['auf_spiegelebene', mitTeil(B0, oben(20, GESCH, 1, 60, { spiegel: ['x'] })), 20, pg],
    ['schraeg', ab(B0, (x) => { x.koerper.push(quader(1, 30, 21, 4, { pos: [0, 9, 60], dreh: [0, 0, 12] })); x.bauteile.push(T(20, GESCH, [0, 11, 60], [0, 1, 0])); }), 20, pg],
    ['ueber_kante', mitTeil(B0, oben(20, GESCH, 10, 60)), 20, pg],
    ['rohre_kreuzen', mitTeil(B0, oben(20, SCHWER, -4.5, 60), oben(21, SCHWER, 4.5, 60)), undefined, pg], // 9 m Abstand: Füße frei, Rohre (7·s) reichen hinüber
    ['kein_schussfeld', ab(B0, (x) => { x.koerper.push(quader(1, 3, 21, 40, { pos: [0, 27.5, 66] }), quader(2, 3, 21, 40, { pos: [0, 27.5, 54] }),
      quader(3, 15, 3, 40, { pos: [9, 27.5, 60] }), quader(4, 15, 3, 40, { pos: [-9, 27.5, 60] })); x.bauteile.push(oben(20, GESCH, 0, 60)); }), 20, pg],
    ['kein_antrieb', ab(B0, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'triebwerk_l'); }), undefined, fw],
    ['zu_schwach', ab(B0, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'triebwerk_l'); x.bauteile.push(T(0, 'triebwerk_s', [0, 0, -127.5], [0, 0, -1])); }), undefined, fw],
    ['antrieb_flaeche', mitTeil(B0, T(20, 'triebwerk_l', [0, 7.5, 0], [0, 1, 0])), 20, fw],
    ['masse_null', N({ name: 'leer', koerper: [], bauteile: [] }), undefined, fw],
    ['schub_versatz', ab(B0, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'triebwerk_l'); x.bauteile.push(...[0, 1, 2, 3].map((i) => T(i, 'triebwerk_l', [8, -6 + 4 * i, -127.5], [0, 0, -1]))); }), undefined, fw],
    ['keine_steuerduesen', ab(B0, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'steuer'); }), undefined, fw],
    ['steuer_am_schwerpunkt', ab(B0, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'steuer'); x.bauteile.push(T(4, 'steuer', [0, 7.5, 0], [0, 1, 0]), T(5, 'steuer', [0, -7.5, 0], [0, -1, 0])); }), undefined, fw],
    ['unbekannt', mitTeil(B0, oben(20, 'gibt_es_nicht', 0, 0)), 20, fw],
  ];
  const fehlt = [], stufe = [], absturz = [];
  for (const [code, form, bauteil, pruef] of FAELLE) {
    const ms = sicher(() => pruef(form), (e) => { absturz.push(`${code}: ${e.message}`); return []; });
    if (!hat(ms, code, bauteil)) fehlt.push(`${code} (hat: ${[...new Set(ms.map((m) => m.code))].join(',') || '–'})`);
    for (const m of ms.filter((x) => x.code === code)) {
      const soll = STUFE[code];
      if ((soll && m.stufe !== soll) || (!soll && !['warnung', 'fehler'].includes(m.stufe)) || typeof m.text !== 'string' || !m.text) stufe.push(`${code}/${m.stufe}`);
    }
  }
  zeile(`Meldungen: ${FAELLE.length} kleinste Fälle → Code vorhanden (zeigt aufs Bauteil, wo es eins gibt)`, '0 fehlend', absturz.concat(fehlt).join(' | ') || 0, fehlt.length === 0 && absturz.length === 0);
  zeile('Meldungen: Stufe wie E3, Text vorhanden', '0 falsch', stufe.join(', ') || 0, stufe.length === 0);
  // Gegenproben „behoben“: Bezugsformen ohne Fehler, Geschütz mittig oben ohne Geschütz-Fehler/-Warnung
  const fB = fw(B0).filter((m) => m.stufe === 'fehler'), fA = fw(AMBOS_ART).filter((m) => m.stufe === 'fehler'), gB = pg(geschBasis).filter((m) => m.stufe !== 'hinweis');
  zeile('Behoben: Bezugsformen ohne Flug-Fehler | Geschütz mittig oben ohne Meldung', '0 | 0 | 0', `${fB.map((m) => m.code).join(',') || 0} | ${fA.map((m) => m.code).join(',') || 0} | ${gB.map((m) => m.code).join(',') || 0}`,
    fB.length === 0 && fA.length === 0 && gB.length === 0);
  zeile('Bezugsform Bollwerk: Warnungen/Hinweise (Info)', 'Info', fw(B0).filter((m) => m.stufe !== 'fehler').map((m) => m.code).join(', ') || '–', true, false);
  // schub_versatz: ab 50 % des Steuer-Drehmoments Fehler — Triebwerke ganz außen auf einer Seite
  const stark = ab(B0, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'triebwerk_l'); x.bauteile.push(...[0, 1, 2, 3].map((i) => T(i, 'triebwerk_l', [10, -6 + 4 * i, -127.5], [0, 0, -1]))); });
  zeile('schub_versatz (alle Triebwerke bei x 8 | x 10): Stufe (Info, Grenze 50 % Steuer-Drehmoment)', 'Info', `${fw(FAELLE.find((x) => x[0] === 'schub_versatz')[1]).find((m) => m.code === 'schub_versatz')?.stufe ?? '–'} | ${fw(stark).find((m) => m.code === 'schub_versatz')?.stufe ?? '–'}`, true, false);
}

// ---------- 4) flugwerte ----------
const schluesselBaum = (o) => Object.entries(o).map(([k, v]) => (v && typeof v === 'object' ? `${k}{${schluesselBaum(v)}}` : `${k}:${typeof v}`)).sort().join(',');
/** Eigene Masse + Schwerpunkt: Quader-Körper (Mitte = Hülle), Bauteile am Fußpunkt (Spiegelkopien mit). */
function eigeneMasse(form) {
  let m = 0; const s = [0, 0, 0];
  for (const { k, lage } of koerperListe(form)) {
    const v = volumen(k) * DICHTE * (k.op === 'minus' ? -1 : 1), h = huelle(k, lage), c = h.min.map((x, i) => (x + h.max[i]) / 2);
    m += v; c.forEach((x, i) => (s[i] += v * x));
  }
  for (const e of bauteilListe(form)) { const mb = KAT[e.b.typ]?.masse ?? 0; m += mb; e.p.forEach((x, i) => (s[i] += mb * x)); }
  return { m, s: s.map((x) => x / m) };
}
{
  const fB = flugwerte(BOLLWERK_ART, KAT), fA = flugwerte(AMBOS_ART, KAT), fB2 = flugwerte(kopie(BOLLWERK_ART), KAT);
  zeile('flugwerte.werte: Schlüssel/Typen = WERTE.bollwerk (tief, inkl. KOLLISION)', 'gleich', schluesselBaum(fB.werte) === schluesselBaum(WERTE.bollwerk) ? 'gleich' : schluesselBaum(fB.werte), schluesselBaum(fB.werte) === schluesselBaum(WERTE.bollwerk));
  zeile('flugwerte: endlich, gleiche Eingabe → bitgleich (eingefroren / Kopie)', 'ja', !unendlich(fB) && JSON.stringify(fB) === JSON.stringify(fB2) ? 'ja' : 'NEIN', !unendlich(fB) && JSON.stringify(fB) === JSON.stringify(fB2));
  const kolOk = ['abprall', 'gleit', 'schadenSchwelle', 'schadenProMs'].every((k) => fB.werte[k] === WERTE.bollwerk[k]);
  zeile('flugwerte: KOLLISION-Werte unverändert übernommen', 'gleich', kolOk ? 'gleich' : 'ANDERS', kolOk);
  // Masse, Schwerpunkt, Schubpunkt, Schub
  const em = eigeneMasse(BOLLWERK_ART), schubL = ANTRIEBE.triebwerk_l.schub;
  zeile('Masse Bollwerk-Bezug = Volumen·DICHTE + alle Bauteile', `${em.m.toFixed(1)} t (±0,5)`, fB.masse, Math.abs(fB.masse - em.m) <= 0.5);
  zeile('Schwerpunkt Bollwerk-Bezug (symmetrisch) | eigene Rechnung', `x = y = 0 | ±1 cm`, `${fB.schwerpunkt.map((x) => x.toFixed(3)).join('/')} | ${abst(fB.schwerpunkt, em.s).toFixed(4)}`,
    Math.abs(fB.schwerpunkt[0]) < 1e-9 && Math.abs(fB.schwerpunkt[1]) < 1e-9 && abst(fB.schwerpunkt, em.s) < 0.01);
  zeile('Schubpunkt (4 × triebwerk_l) | Schub', `[0,0,−127,5] | ${4 * schubL} kN`, `${fB.schubpunkt?.join('/')} | ${fB.schub}`, !!fB.schubpunkt && abst(fB.schubpunkt, [0, 0, -127.5]) < 1e-9 && Math.abs(fB.schub - 4 * schubL) < 1e-9);
  const ohne = flugwerte(ab(BOLLWERK_ART, (x) => { x.bauteile = x.bauteile.filter((b) => b.typ !== 'triebwerk_l'); }), KAT);
  zeile('Ohne Triebwerk: Schubpunkt null, Schub 0', 'null | 0', `${JSON.stringify(ohne.schubpunkt)} | ${ohne.schub}`, ohne.schubpunkt === null && ohne.schub === 0);
  // Gegenprobe Schwerpunkt: 500 t an x = +10 → Schwerpunkt wandert nach +x; gleiche Masse gespiegelt → zurück auf 0
  const schwer = Object.entries(KAT).sort((a, b) => b[1].masse - a[1].masse)[0][0];
  const eins = flugwerte(mitTeil(BOLLWERK_ART, T(30, schwer, [10.5, 0, 0], [1, 0, 0])), KAT), zwei = flugwerte(mitTeil(BOLLWERK_ART, T(30, schwer, [10.5, 0, 0], [1, 0, 0], { spiegel: ['x'] })), KAT);
  zeile(`Gegenprobe Schwerpunkt: ${schwer} an x 10,5 → x > 0 | mit Spiegelkopie → x = 0`, '> 0 | 0', `${eins.schwerpunkt[0].toFixed(4)} | ${zwei.schwerpunkt[0].toExponential(1)}`, eins.schwerpunkt[0] > 0 && Math.abs(zwei.schwerpunkt[0]) < 1e-9);
  const qm = flugwerte(N({ koerper: [quader(0, 40, 10, 6, { pos: [3, -2, 7] })], bauteile: [] }), KAT);
  zeile('Schwerpunkt eines Quaders ohne Bauteile = Mitte', '[3,−2,7] ±1e-9', qm.schwerpunkt.map((x) => x.toFixed(6)).join('/'), abst(qm.schwerpunkt, [3, -2, 7]) < 1e-9);
  // Gesetze
  const mehrSchub = flugwerte(mitTeil(BOLLWERK_ART, T(10, 'triebwerk_l', [0, 0, -127.5], [0, 0, -1])), KAT);
  const mehrMasse = flugwerte(ab(BOLLWERK_ART, (x) => { x.koerper[0].spanten.forEach((s) => { s.b = 30; }); }), KAT);
  const riesig = flugwerte(mitTeil(BOLLWERK_ART, ...Array.from({ length: 40 }, (_, i) => T(40 + i, 'triebwerk_l', [-9 + (i % 10) * 2, -6 + Math.floor(i / 10) * 4, -127.5], [0, 0, -1]))), KAT);
  zeile('Gesetze: 5. Triebwerk → aVor höher | breiter (mehr Masse) → aVor niedriger | 44 Triebwerke → vMax ≤ 85', 'ja | ja | ≤ 85',
    `${mehrSchub.werte.aVor} > ${fB.werte.aVor} | ${mehrMasse.werte.aVor} < ${fB.werte.aVor} | ${riesig.werte.vMax}`,
    mehrSchub.werte.aVor > fB.werte.aVor && mehrMasse.werte.aVor < fB.werte.aVor && riesig.werte.vMax <= 85);
  const sym = flugwerte(ab(BOLLWERK_ART, (x) => { x.bauteile = x.bauteile.filter((b) => !(b.typ === 'triebwerk_l' && b.p[0] < 0)).map((b) => (b.typ === 'triebwerk_l' ? { ...b, spiegel: ['x'] } : b)); }), KAT);
  zeile('Spiegelkopie statt eigener Triebwerke (x) → gleiche Werte', 'gleich', JSON.stringify(sym.werte) === JSON.stringify(fB.werte) ? 'gleich' : 'ANDERS', JSON.stringify(sym.werte) === JSON.stringify(fB.werte));
  // Eichung (E6): ±20 %, Drehungen ±35 %
  const eiche = (ist, soll, name) => {
    const ab = [];
    for (const [k, v] of Object.entries(soll)) {
      if (v && typeof v === 'object') { for (const [a, w] of Object.entries(v)) if (Math.abs(ist[k][a] / w - 1) > 0.35) ab.push(`${k}.${a} ${ist[k][a]}/${w}`); }
      else if (typeof v === 'number' && v !== 0 && Math.abs(ist[k] / v - 1) > 0.2) ab.push(`${k} ${ist[k]}/${v}`);
    }
    zeile(`Eichung ${name}-artig gegen WERTE.${name} (±20 %, Drehungen ±35 %)`, '0 außerhalb', ab.join(', ') || `aVor ${ist.aVor}, vMax ${ist.vMax}`, ab.length === 0);
  };
  eiche(fB.werte, WERTE.bollwerk, 'bollwerk'); eiche(fA.werte, WERTE.ambos, 'ambos');
  const gegenEiche = { ...fB.werte, aVor: fB.werte.aVor * 1.5 };
  zeile('Gegenprobe Eichung: aVor × 1,5 fällt aus der Spanne', 'rot', Math.abs(gegenEiche.aVor / WERTE.bollwerk.aVor - 1) > 0.2 ? 'rot' : 'grün', Math.abs(gegenEiche.aVor / WERTE.bollwerk.aVor - 1) > 0.2);
}

// ---------- 5) formKugeln, formZuSchiff, Probeflug ----------
{
  const kg = sicher(() => formKugeln(BOLLWERK_ART), (e) => ({ fehler: e.message }));
  const ok = Array.isArray(kg) && kg.length > 0 && kg.every((k) => [k.x, k.y, k.z, k.r].every(Number.isFinite) && k.r > 0);
  zeile('formKugeln (Bollwerk-Bezug): endlich, r > 0', `> 0 Kugeln`, ok ? `${kg.length} Kugeln` : JSON.stringify(kg).slice(0, 80), ok);
  if (ok) { // Deckung wie tests/schiffe.mjs (Info): Profilpunkte der Plus-Körper höchstens 1,5 m außerhalb einer Kugel
    let drin = 0, alle = 0;
    for (const { k, lage } of koerperListe(BOLLWERK_ART)) for (let z = k.spanten[0].z; z <= k.spanten[1].z; z += 2.5)
      for (const [x, y] of profilPunkte(k.spanten[0])) { alle++; const q = wendeK(lage, [x, y, z]); if (kg.some((c) => Math.hypot(q[0] - c.x, q[1] - c.y, q[2] - c.z) <= c.r + 1.5)) drin++; }
    zeile('formKugeln: Rumpf in Kugeln (±1,5 m, Info)', 'Info (≥ 85 % wie Werft)', (100 * drin / alle).toFixed(0) + ' %', true, false);
  }
  if (typeof B === 'string') { zeile('formZuSchiff (bauteile.js, nach dem Merge)', 'vorhanden', B, false); }
  else {
    const form = mitTeil(BOLLWERK_ART, T(20, GESCH, [4, 7.5, 60], [0, 1, 0], { spiegel: ['x'] }), T(21, GESCH, [0, -7.5, -40], [0, -1, 0]), T(22, GESCH, [10.5, 0, 0], [1, 0, 0]));
    const s = sicher(() => B.formZuSchiff(form), (e) => ({ fehler: e.message }));
    if (s.fehler) zeile('formZuSchiff', 'kein Absturz', s.fehler, false);
    else {
      const fw = flugwerte(form, KAT), sp = fw.schwerpunkt, v = s.versatz;
      const felder = ['name', 'kennung', 'laenge', 'kugeln', 'tuerme', 'duesen', 'werte', 'form', 'versatz', 'schwerpunkt'].filter((k) => !(k in s));
      zeile('formZuSchiff: Felder | werte = flugwerte | Schwerpunkt', 'alle | gleich | gleich', `${felder.join(',') || 'alle'} | ${JSON.stringify(s.werte) === JSON.stringify(fw.werte) ? 'gleich' : 'ANDERS'} | ${abst(s.schwerpunkt, sp).toExponential(1)}`,
        felder.length === 0 && JSON.stringify(s.werte) === JSON.stringify(fw.werte) && abst(s.schwerpunkt, sp) < 1e-9);
      // Ursprung = Schwerpunkt (E7): versatz verschiebt um −Schwerpunkt
      zeile('formZuSchiff: versatz = −Schwerpunkt', '±1e-9', `${v?.map((x) => x.toFixed(3)).join('/')}`, Array.isArray(v) && abst(v, sp.map((x) => -x)) < 1e-9);
      // Türme: ids lückenlos 0…n−1, Seitenmontage fehlt, Lage = turmAusBauteil + versatz
      const liste = bauteilListe(form).filter((e) => GESCHUETZE[e.b.typ]);
      const erwartet = liste.map((e, i) => turmAusBauteil(e, i, form)).filter(Boolean);
      const idsOk = s.tuerme.every((t, i) => t.id === i), lageAbw = Math.max(0, ...s.tuerme.map((t) => Math.min(...erwartet.map((q) => abst([t.x, t.y, t.z], [q.x + v[0], q.y + v[1], q.z + v[2]])))));
      zeile('formZuSchiff.tuerme: Anzahl (2 + Spiegelkopie, Seite fehlt) | ids 0…n−1 | Lage − Schwerpunkt', `3 | ja | < 1e-9`, `${s.tuerme.length} | ${idsOk ? 'ja' : 'NEIN'} | ${lageAbw.toExponential(1)}`, s.tuerme.length === 3 && idsOk && lageAbw < 1e-9);
      // Düsen (E8): 4 haupt + 4 steuer, p − Schwerpunkt, n, r aus dem Katalog
      const haupt = s.duesen.filter((d) => d.art === 'haupt'), steuer = s.duesen.filter((d) => d.art === 'steuer');
      const dAbw = Math.max(...haupt.map((d) => Math.min(...BOLLWERK_ART.bauteile.filter((b) => b.typ === 'triebwerk_l').map((b) => abst([d.x, d.y, d.z], b.p.map((x, i) => x + v[i]))))));
      zeile('formZuSchiff.duesen: haupt | steuer | Lage − Schwerpunkt | n, r', '4 | 4 | < 1e-9 | [0,0,−1], Katalog', `${haupt.length} | ${steuer.length} | ${dAbw.toExponential(1)} | ${JSON.stringify(haupt[0]?.n)}, ${haupt[0]?.r}`,
        haupt.length === 4 && steuer.length === 4 && dAbw < 1e-9 && haupt.every((d) => JSON.stringify(d.n) === '[0,0,-1]' && d.r === ANTRIEBE.triebwerk_l.r));
      const kOk = s.kugeln.every((k) => [k.x, k.y, k.z, k.r].every(Number.isFinite) && k.r > 0);
      zeile('formZuSchiff: Kugeln endlich | laenge ≈ 255 m', 'ja | 255 ± 1', `${kOk ? 'ja' : 'NEIN'} | ${s.laenge}`, kOk && Math.abs(s.laenge - 255) <= 1);
      // Probeflug: erstelleSchiffSim(werte) — Vollgas aus dem Stand: Anfangsbeschleunigung = aVor, nach 60 s ≈ vMax
      const DT = 1 / 60, flieg = () => { const sim = erstelleSchiffSim(s.werte); const v1 = [];
        for (let i = 0; i < 60 * 70; i++) { sim.z.hebel = 1; sim.schritt(DT, { hebel: 1 }); /* WARUM hebel direkt: befehl.hebel ist eine Rate (hebelRate/s) */ if (i === 59 || i === 119) v1.push(sim.z.vel.length()); }
        return { sim, a: (v1[1] - v1[0]) / 1, v: sim.z.vel.length(), pos: sim.z.pos.toArray() }; };
      const p1 = flieg(), p2 = flieg();
      zeile('Probeflug (erstelleSchiffSim): Beschleunigung 1–2 s | Endfahrt nach 70 s | Gleichlauf', `${s.werte.aVor} ±3 % | ${s.werte.vMax} ±3 % | gleich`,
        `${p1.a.toFixed(3)} | ${p1.v.toFixed(2)} | ${JSON.stringify(p1.pos) === JSON.stringify(p2.pos) ? 'gleich' : 'ANDERS'}`,
        Math.abs(p1.a / s.werte.aVor - 1) < 0.03 && Math.abs(p1.v / s.werte.vMax - 1) < 0.03 && JSON.stringify(p1.pos) === JSON.stringify(p2.pos));
    }
  }
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

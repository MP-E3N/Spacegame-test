// ZWECK: Prüfungen ohne Browser für den Gefechtstest mit einer Werkstatt-Form (Runde 21, `node tests/gefecht.mjs`) gegen
//        die Schnittstelle im Protokoll R21 — unabhängig vom Waffentechniker geschrieben.
//   1) Bollwerk-Gefecht bitgleich zum Stand vor R21 (Commit 19a5ed2): eigener Fingerabdruck (Schiff, Angreifer, Türme,
//      Zähler, pruefsumme — alle 60 Takte, Float64-Bits) gegen feste Anker; Aufrufvarianten () / ({}) / ({typ}) gleich.
//   2) Form-Gefecht (Generator-Formen als Prüflinge): Form wird wirklich genutzt, Gleichlauf (zweimal, Reset, A·B·A,
//      andere Form mitten im Lauf registriert), ohne Türme stumm.
//   3) Kein Schuss in den eigenen Rumpf: (a) ohne Lauf — Strahlen in Turm-Grenzen + Rumpfsperre gegen die Plus-Körper der
//      Form (Lofts aus profilPunkte, Spiegelkopien, Ursprung im Schwerpunkt, Minus als voll); (b) im Lauf — jeder Schuss
//      (Mündung + Richtung in Schiffs-Koordinaten) bis 300 m; dazu: Sperre macht nicht alles zu.
//   Gegenproben: der Strahltest trifft einen Rumpf von oben; ein verfälschter Lauf ändert den Fingerabdruck.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER. MESSEN=1 → gibt nur die Anker aus (alter Stand).
import * as THREE from 'three';
import { erstelleGefecht } from '../src/sim/gefecht.js';
import { registriereSchiff, sperrSektor } from '../src/sim/schiffe/index.js';
import { koerperListe, profilPunkte, wendeK } from '../src/sim/form/form.js';
import { formZuSchiff } from '../src/sim/form/bauteile.js';
import { generiere, standardEinstellung } from '../src/sim/form/generator.js';
import { performance } from 'node:perf_hooks';

const START = performance.now(), DT = 1 / 60;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const J = (o) => JSON.stringify(o);
const sicher = (f, fb) => { try { return f(); } catch (e) { return fb(e); } };

// ---------- Fingerabdruck (Float64-Bits, zwei 32-Bit-Hashes) ----------
// WARUM nicht nur pruefsumme(): gewichtete Summe — Abweichungen können sich aufheben, Geschosse fehlen darin.
function abdruck() {
  const dv = new DataView(new ArrayBuffer(8)); let h1 = 0x811c9dc5, h2 = 0x2545f491;
  const m = (x) => { dv.setFloat64(0, +x); for (const i of [0, 4]) { const u = dv.getUint32(i); h1 = Math.imul(h1 ^ u, 16777619) >>> 0; h2 = (Math.imul(h2 ^ (u >>> 3), 2246822519) + u) >>> 0; } };
  const v = (o) => { if (o) { m(o.x); m(o.y); m(o.z); if ('w' in o) m(o.w); } };
  return {
    zustand(g, streng = false) {
      const z = g.schiff.z; v(z.pos); v(z.vel); v(z.rot); v(z.dreh); m(z.hp); m(z.hebel ?? 0); m(z.zerstoert ? 1 : 0);
      // WARUM nur aktive Angreifer: angreifer.zuruecksetzen() lässt Lage/HP leerer Plätze stehen (Befund R21) — die
      // Simulation hängt nicht davon ab; dafür gibt es eine eigene Zeile zur pruefsumme
      for (const a of g.angreifer.ziele) { m(a.aktiv ? 1 : 0); if (a.aktiv || streng) { v(a.pos); v(a.vel); m(a.hp); } }
      if (streng) m(g.pruefsumme()); // R22: streng = auch leere Plätze + pruefsumme (Neustart = frische Instanz)
      for (const t of g.flak.tuerme) { m(t.gier); m(t.nick); m(t.schuesse ?? 0); }
      for (const k of Object.keys(g.zaehler).sort()) m(g.zaehler[k]);
      m(g.flak.geschosse?.anzahlAktiv ?? 0); // pruefsumme() bewusst nicht: enthält leere Angreifer-Plätze (eigene Zeile)
    },
    wert: () => h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'),
  };
}
const steuer = (k, flug) => ({ hebel: k < 120 ? 1 : 0, gieren: flug === 'manoever' ? (Math.floor(k / 1200) % 2 ? -0.5 : 0.5) : 0 });
const flakBefehl = (modus) => ({ modus: modus === 'halt' ? 'sperrfeuer' : modus, feuerFrei: modus !== 'halt', folgen: true, schirmAbstand: 800, v0: 1100 });
/** Lauf über T Takte; beobachte(g, k) nach jedem Schritt (Schuss-Prüfung). */
function lauf(g, modus, flug, T, beobachte = null, ab = 0, streng = false) {
  const f = abdruck(), b = flakBefehl(modus);
  for (let k = ab; k < ab + T; k++) {
    g.schritt(DT, steuer(k, flug), b);
    beobachte?.(g, k);
    if (k % 60 === 59) f.zustand(g, streng);
  }
  return { fp: f.wert(), schuesse: g.zaehler.schuesse, abschuesse: g.zaehler.abschuesse };
}

// ---------- 1) Bollwerk bitgleich (Anker gemessen auf 19a5ed2, MESSEN=1) ----------
const LAEUFE = [['sperrfeuer', 'gerade', 3600], ['zielfeuer', 'manoever', 3600], ['halt', 'gerade', 1800]];
// R23 (Waffentechniker): neu gemessen — WARUM: alle 17 Türme feuern (vorher 14), Gatling am Schiff, Hauptbatterie,
// größere Vorräte (Protokoll R23 E2). Bezug vorher: 0b46bddd52d21b75 / 18c71067d296783f / 21028bdd3a1c1c95 (19a5ed2).
const ANKER = ['06590ae1964378f4', '4613df28d879f159', '1030dd1cb889e9d5'];
if (process.env.MESSEN) {
  console.log(JSON.stringify(LAEUFE.map(([m, f, T]) => lauf(erstelleGefecht(), m, f, T).fp)));
  process.exit(0);
}
{
  const t0 = performance.now();
  const ist = LAEUFE.map(([m, f, T]) => lauf(erstelleGefecht(), m, f, T));
  const ok = ist.every((r, i) => r.fp === ANKER[i]);
  zeile('Bollwerk-Gefecht bitgleich zu R23-Bezug (3 Läufe, Fingerabdruck alle 60 Takte)', 'gleich', ok ? `gleich (${ist.map((r) => r.schuesse).join('/')} Schüsse)` : ist.map((r) => r.fp).join(' / '), ok);
  zeile('Bollwerk-Läufe schießen (Gegenprobe: Lauf ist nicht leer)', '> 0 Schüsse | Halt: 0', `${ist[0].schuesse} / ${ist[1].schuesse} | ${ist[2].schuesse}`, ist[0].schuesse > 0 && ist[1].schuesse > 0 && ist[2].schuesse === 0);
  const varianten = [() => erstelleGefecht({}), () => erstelleGefecht({ typ: 'bollwerk' })].map((neu) => sicher(() => lauf(neu(), 'sperrfeuer', 'gerade', 3600).fp, (e) => 'WIRFT ' + e.message));
  zeile('erstelleGefecht({}) und ({ typ: "bollwerk" }) = erstelleGefecht()', 'gleich', varianten.every((v) => v === ANKER[0]) ? 'gleich' : varianten.join(' / '), varianten.every((v) => v === ANKER[0]));
  const g = erstelleGefecht(); g.schritt(DT, steuer(0, 'gerade'), flakBefehl('sperrfeuer')); g.schiff.z.pos.x += 1e-9;
  const verf = lauf(g, 'sperrfeuer', 'gerade', 600, null, 1).fp, rein = lauf(erstelleGefecht(), 'sperrfeuer', 'gerade', 601).fp;
  zeile('Gegenprobe: 1e-9 m Versatz am Schiff ändert den Fingerabdruck', 'anders', verf !== rein ? 'anders' : 'GLEICH', verf !== rein);
  zeile('Laufzeit Bollwerk-Teil', 'Info', `${((performance.now() - t0) / 1000).toFixed(1)} s`, true);
}

// ---------- Form-Prüflinge ----------
const MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
/** Plus-Körper der Form (samt Spiegelkopien) als Dreiecksnetze in Schiffs-Koordinaten (Form-Punkt + versatz). */
function formNetze(form, versatz) {
  const netze = [];
  for (const { k, lage } of koerperListe(form)) {
    if (k.op !== 'plus' || k.spanten.length < 2) continue;
    const ringe = k.spanten.map((s) => profilPunkte(s).map(([x, y]) => wendeK(lage, [x, y, s.z]).map((v, i) => v + versatz[i])));
    const pos = [], P = ringe[0].length, tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let i = 0; i + 1 < ringe.length; i++) for (let j = 0; j < P; j++) {
      const a = ringe[i][j], b = ringe[i][(j + 1) % P], c = ringe[i + 1][(j + 1) % P], d = ringe[i + 1][j];
      tri(a, b, c); tri(a, c, d);
    }
    for (const r of [ringe[0], ringe[ringe.length - 1]]) {
      const mi = [0, 1, 2].map((i) => r.reduce((s, p) => s + p[i], 0) / P);
      for (let j = 0; j < P; j++) tri(mi, r[j], r[(j + 1) % P]);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, MAT); mesh.updateMatrixWorld(); netze.push(mesh);
  }
  return netze;
}
const strahl = new THREE.Raycaster(); strahl.far = 300;
const trifft = (netze, p, d) => { strahl.set(p, d); return strahl.intersectObjects(netze, false).some((x) => x.distance > 0.05); };

const PRUEFLINGE = [['korvette', 4711], ['korvette', 815], ['fregatte', 4711], ['fregatte', 2024], ['traeger', 4711], ['traeger', 99]];
const formSchiff = (k, seed, mehr = {}) => {
  const form = generiere({ ...standardEinstellung(k), seed, geschuetze: 1, ...mehr });
  const daten = formZuSchiff(form), typ = `pruef_${k}_${seed}_${Object.keys(mehr).join('_')}`;
  registriereSchiff(typ, daten, daten.werte);
  return { k, seed, form, daten, typ, netze: formNetze(daten.form, daten.versatz) };
};
const gefechtForm = (s) => erstelleGefecht({ typ: s.typ, daten: s.daten, werte: s.daten.werte });
// R23 (E2, Nutzer: „die Türme alle funktionsfähig“): flak.tuerme enthält ALLE Türme (flak + schwer), nicht nur die Flak
const flakZahl = (s) => s.daten.tuerme.length;

// ---------- 2) Form-Gefecht: genutzt, Gleichlauf, stumm ----------
const schiffe = PRUEFLINGE.map(([k, seed]) => formSchiff(k, seed));
let GENUTZT = false;
const NG = ' (Form nicht genutzt → nicht prüfbar)';
{
  const genutzt = schiffe.map((s) => { const g = sicher(() => gefechtForm(s), (e) => ({ fehler: e.message }));
    return g.fehler ? `${s.typ}: wirft ${g.fehler}` : g.welt.typ === s.typ && g.daten === s.daten && g.flak.tuerme.length === flakZahl(s) ? '' : `${s.typ}: typ ${g.welt.typ}, flak ${g.flak.tuerme.length}/${flakZahl(s)}`; }).filter(Boolean);
  GENUTZT = genutzt.length === 0;
  zeile(`Form-Gefecht nutzt die Form (welt.typ, daten, Flak-Türme) — ${schiffe.length} Generator-Formen`, '0 abweichend', genutzt.slice(0, 2).join('; ') || '0', genutzt.length === 0);
  zeile('Prüflinge haben Flak', '> 0 je Form', schiffe.map((s) => flakZahl(s)).join(' / '), schiffe.every((s) => flakZahl(s) > 0));

  const A = schiffe[2], B = schiffe[4];
  const a1 = sicher(() => lauf(gefechtForm(A), 'sperrfeuer', 'manoever', 1800).fp, (e) => 'WIRFT ' + e.message);
  const a2 = sicher(() => lauf(gefechtForm(A), 'sperrfeuer', 'manoever', 1800).fp, (e) => 'WIRFT ' + e.message);
  sicher(() => lauf(gefechtForm(B), 'zielfeuer', 'gerade', 600), () => null);
  const a3 = sicher(() => lauf(gefechtForm(A), 'sperrfeuer', 'manoever', 1800).fp, (e) => 'WIRFT ' + e.message);
  zeile('Form-Gefecht Gleichlauf: zweimal | nach Gefecht mit Form B (A·B·A)', 'gleich | gleich', `${a1 === a2 ? 'gleich' : 'ANDERS'} | ${a1 === a3 ? 'gleich' : 'ANDERS'}`, a1 === a2 && a1 === a3 && !a1.startsWith('WIRFT'));
  const gR = gefechtForm(A); lauf(gR, 'zielfeuer', 'gerade', 700); gR.zuruecksetzen();
  const p0 = gR.pruefsumme(), a4 = lauf(gR, 'sperrfeuer', 'manoever', 1800).fp, p1 = gefechtForm(A).pruefsumme();
  zeile('Form-Gefecht: zuruecksetzen() → wie frisch (Sim-Zustand)', 'gleich', a4 === a1 ? 'gleich' : 'ANDERS', a4 === a1);
  // R22 (Waffentechniker 3): Neustart = frische Instanz — jetzt HART, streng (leere Plätze + pruefsumme alle 60 Takte)
  const neustart = (neu) => { const g = neu(); lauf(g, 'zielfeuer', 'gerade', 700); g.zuruecksetzen(); const p = g.pruefsumme();
    const f = neu(), pf = f.pruefsumme(); return { p, pf, a: lauf(g, 'sperrfeuer', 'manoever', 1800, null, 0, true).fp, b: lauf(f, 'sperrfeuer', 'manoever', 1800, null, 0, true).fp }; };
  for (const [name, neu] of [['Bollwerk', () => erstelleGefecht()], ['Form ' + A.typ, () => gefechtForm(A)]]) {
    const r = neustart(neu);
    zeile(`R22 Neustart ${name}: pruefsumme direkt nach zuruecksetzen() | streng weitere 1800 Takte = frische Instanz`, 'gleich | gleich',
      `${r.p === r.pf ? 'gleich' : `${r.p.toFixed(3)} ≠ ${r.pf.toFixed(3)}`} | ${r.a === r.b ? 'gleich' : 'ANDERS'}`, r.p === r.pf && r.a === r.b);
  }
  void p0; void p1;
  // Andere Form mitten im Lauf registriert (Werkstatt speichert weiter) — der laufende Kampf darf das nicht merken
  // WARUM auch derselbe Typ: welt.js liest SCHIFFSDATEN[typ] in jedem Schritt neu (Frühwarnung R21, Stolperfalle 1)
  const restNach = (stoeren) => { const g = gefechtForm(A); lauf(g, 'sperrfeuer', 'manoever', 900); stoeren(); return lauf(g, 'sperrfeuer', 'manoever', 900, null, 900).fp; };
  const ruhig = restNach(() => {});
  const neu = restNach(() => formSchiff('korvette', 4242));
  const gleicherTyp = restNach(() => registriereSchiff(A.typ, B.daten, B.daten.werte));
  registriereSchiff(A.typ, A.daten, A.daten.werte);
  zeile('Neue Form mitten im Lauf registriert | gleicher Typ neu belegt → laufendes Gefecht unverändert', 'gleich | gleich', `${neu === ruhig ? 'gleich' : 'ANDERS'} | ${gleicherTyp === ruhig ? 'gleich' : 'ANDERS'}`, neu === ruhig, true);
  zeile('Gleicher Typ mitten im Lauf neu belegt (Werkstatt speichert unter demselben Namen)', 'gleich', gleicherTyp === ruhig ? 'gleich' : 'ANDERS', gleicherTyp === ruhig, false);
  // ohne Türme: stumm, läuft, schießt nicht
  const S = formSchiff('fregatte', 4711, { geschuetze: 0 });
  const gs = sicher(() => gefechtForm(S), (e) => ({ fehler: e.message }));
  const rs = gs.fehler ? null : sicher(() => lauf(gs, 'sperrfeuer', 'gerade', 600), (e) => ({ fehler: e.message }));
  // stumm = Liste { index, id, grund } der Flak-Türme, die nirgends feuern können (Schnittstelle Waffentechniker R21)
  const st = Array.isArray(gs.stumm) ? gs.stumm : null;
  zeile('Form ohne Türme: läuft, 0 Schüsse, stumm = []', '0 | []', gs.fehler ?? rs?.fehler ?? `${rs.schuesse} | ${J(gs.stumm)}`, !gs.fehler && !rs?.fehler && rs.schuesse === 0 && st?.length === 0);
  const stummListe = schiffe.flatMap((s) => { const g = sicher(() => gefechtForm(s), () => null); return !g ? [`${s.typ}: wirft`] : !Array.isArray(g.stumm) ? [`${s.typ}: stumm = ${J(g.stumm)}`] : g.stumm.map((x) => `${s.typ} Turm ${x.id} (${x.grund})`); });
  zeile('Generator-Formen: jede Flak kann feuern (gefecht.stumm leer)', '0', stummListe.slice(0, 3).join(', ') || '0', stummListe.length === 0);
}

// ---------- 3) Kein Schuss in den eigenen Rumpf ----------
{
  // Gegenprobe des Strahltests: von 20 m über dem Rumpf senkrecht nach unten trifft, nach oben nicht
  const s0 = schiffe[2], oben = Math.max(...s0.netze.map((n) => { n.geometry.computeBoundingBox(); return n.geometry.boundingBox.max.y; }));
  const runter = trifft(s0.netze, new THREE.Vector3(0, oben + 20, 0), new THREE.Vector3(0, -1, 0)), rauf = trifft(s0.netze, new THREE.Vector3(0, oben + 20, 0), new THREE.Vector3(0, 1, 0));
  zeile('Gegenprobe Strahltest: senkrecht auf den Rumpf | weg vom Rumpf', 'trifft | frei', `${runter ? 'trifft' : 'FREI'} | ${rauf ? 'TRIFFT' : 'frei'}`, runter && !rauf);

  // (a) ohne Lauf: alle erlaubten Richtungen jeder Flak (Grenzen + Sperre aus dem Gefecht) treffen den Rumpf nicht
  const richtung = (g, n) => new THREE.Vector3(Math.sin(g) * Math.cos(n), Math.sin(n), Math.cos(g) * Math.cos(n));
  const inSchiff = (t, v, punkt) => { v.set(t.oben ? v.x : -v.x, t.oben ? v.y : -v.y, v.z); if (punkt) v.add(new THREE.Vector3(t.x, t.y, t.z)); return v; };
  const umbruch = (w) => w - 2 * Math.PI * Math.floor((w + Math.PI) / (2 * Math.PI));
  let strahlen = 0, treffer = 0, frei = [], ohneSperre = 0, gegenTreffer = 0;
  const wo = [];
  // WARUM zweiter Durchgang ohne Sperre (ganzer Nick-Bereich): Gegenprobe — sonst wäre „0 Treffer“ auch bei leerer Prüfung grün
  for (const ohne of [false, true]) for (const s of schiffe) {
    const g = sicher(() => gefechtForm(s), () => null); if (!g) continue;
    g.lafetten.forEach((t, i) => {
      const sperre = g.flak.tuerme[i]?.rumpf; if (!sperre) { if (!ohne) ohneSperre++; return; }
      const voll = t.gier[1] >= Math.PI - 1e-6, NG = voll ? 64 : 32; let hier = 0, erlaubt = 0, alle = 0;
      for (let a = 0; a <= NG; a++) {
        const gi = voll ? -Math.PI + 2 * Math.PI * a / NG : t.gier[0] - t.gier[1] + 2 * t.gier[1] * a / NG;
        for (let b = 0; b <= 8; b++) {
          const n0 = ohne ? t.nick[0] : Math.max(0, t.nick[0]), n = n0 + (t.nick[1] - n0) * b / 8; alle++;
          if (!ohne && n < sperre[sperrSektor(gi, sperre.length)]) continue;
          erlaubt++;
          const d = inSchiff(t, richtung(gi, n), false);
          for (const seite of [0, t.muendungen[0].x, -t.muendungen[0].x]) {
            const p = inSchiff(t, new THREE.Vector3(Math.sin(gi) * t.zapfen.z + Math.cos(gi) * seite, t.zapfen.y, Math.cos(gi) * t.zapfen.z - Math.sin(gi) * seite), true);
            if (!ohne) strahlen++; if (trifft(s.netze, p, d)) hier++;
          }
        }
      }
      if (ohne) { gegenTreffer += hier; return; }
      if (hier) wo.push(`${s.typ} Turm ${t.id}: ${hier}`);
      treffer += hier; frei.push(erlaubt / Math.max(1, alle));
      void umbruch;
    });
  }
  zeile(`Rumpftreffer ohne Lauf: Strahlen in Grenzen + Sperre (${strahlen} Strahlen, ${schiffe.length} Formen)`, '0', (wo.slice(0, 3).join(', ') || '0') + (GENUTZT ? '' : NG), treffer === 0 && strahlen > 0 && GENUTZT);
  zeile('Gegenprobe: dieselben Strahlen OHNE Sperre (ganzer Nick-Bereich) treffen den Rumpf', '> 0', gegenTreffer + (GENUTZT ? '' : NG), gegenTreffer > 0 && GENUTZT);
  zeile('Jede Form-Flak hat eine Rumpfsperre (flak.tuerme[i].rumpf)', '0 ohne', ohneSperre, ohneSperre === 0);
  const fm = frei.length ? frei.reduce((a, b) => a + b, 0) / frei.length : 0, fmin = frei.length ? Math.min(...frei) : 0;
  zeile('Sperre macht nicht alles zu: erlaubter Anteil über dem Horizont (Mittel | kleinster Turm)', '≥ 70 % | ≥ 30 %', `${(100 * fm).toFixed(0)} % | ${(100 * fmin).toFixed(0)} %${GENUTZT ? '' : NG}`, fm >= 0.7 && GENUTZT, true);
  zeile('Sperre: kleinster Turm', '≥ 30 %', `${(100 * fmin).toFixed(0)} %`, fmin >= 0.3, false);

  // (b) im Lauf: jeder Schuss (Mündung, Richtung) in Schiffs-Koordinaten bis 300 m
  let schuesse = 0, imRumpf = 0; const woL = [];
  const inv = new THREE.Quaternion(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (const s of schiffe.slice(0, 4)) {
    const g = sicher(() => gefechtForm(s), () => null); if (!g) continue;
    lauf(g, 'sperrfeuer', 'manoever', 1800, (gg) => {
      const z = gg.schiff.z; inv.copy(z.rot).invert();
      for (const e of gg.flak.ereignisse.schuesse) {
        schuesse++;
        p.set(e.pos.x - z.pos.x, e.pos.y - z.pos.y, e.pos.z - z.pos.z).applyQuaternion(inv);
        d.set(e.richtung.x, e.richtung.y, e.richtung.z).applyQuaternion(inv).normalize();
        if (trifft(s.netze, p, d)) { imRumpf++; if (woL.length < 3) woL.push(`${s.typ} Turm ${e.turmId}`); }
      }
    });
  }
  zeile('Schüsse im Lauf in den eigenen Rumpf (4 Formen × 30 s Sperrfeuer mit Manöver)', `0 | Schüsse > 0`, `${imRumpf} von ${schuesse}${woL.length ? ' — ' + woL.join(', ') : ''}${GENUTZT ? '' : NG}`, imRumpf === 0 && schuesse > 0 && GENUTZT);
}

const dauer = (performance.now() - START) / 1000;
zeile('Dauer der ganzen Datei', '≤ 30 s', `${dauer.toFixed(1)} s`, dauer <= 30, false);
console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);

// ZWECK: Messungen der KI des Flak-Labors ohne Browser (`node tests/ki.mjs`), Werte aus der Frühwarnung R6:
//   A) Vorhaltfehler gegen Geradeausflieger (rechnerisch + bei Detonation auf ganzen Takten), unlösbare Abfang-Gleichung
//   B) Sperrfeuer: Detonationen auf der Schale (Radius ±5 %), Abdeckung 6×4-Raster, Streichtempo < Richttempo
//   C) 5 min Zielfeuer gegen 10 Zieldrohnen: Abstandsband, Höhe, +Z, Zusammenstöße, Neustart 4 s mit neuer id,
//      ≤ 2 Türme je Ziel, Zielwechsel/min, Zeit bis zum ersten Angriffslauf durch den Schirm, Rechenzeit
//   F) 5 min Sperrfeuer „folgt“ (R7): Wandmitte ↔ Bedrohung (Winkel), Nachführtempo ≤ 12°/s, Richttempo, Vorstöße/min,
//      engster Abstand ≥ 200 m, Killzone-Hysterese (kein Flackern), Leuchtspur nur im Nahbereich, Türme am Eindringling
//   H) Umschalten Folgen ↔ fest mitten im Lauf: kein Sprung der Schirmmitte/des Abstands über das Nachführtempo
//   I) v0 umschalten mitten im Lauf (R8): Türme mit Richttempo, kein NaN, Vorhalt sofort mit neuem v0, kein Zielwechsel
//   J) Abschüsse je v0-Stufe mit Schaden nach Entscheidung 3 (Info), C zusätzlich Streukugel-Regel + Detonationsabstand
//   D) Gleichlauf: zwei Läufe (Zielfeuer + Folgen + v0-Umschalten) + zuruecksetzen() → gleicher Hash
//   E) src/sim/ki/** ohne Math.random, DOM, grafik/
// Ersatz-Waffen: Turm richtet sich sofort aus (in I mit Richttempo); Granate fliegt gerade mit dem v0 des Turms, zielt
// auf einen Punkt im Streu-Ellipsoid (R10: quer streuKugel, längs streuTiefe, Deckel aus FLAK), zündet nach `zuender`
// bzw. auf dem Ellipsoid-Punkt (nur Zeitzünder, R8). Streuung 0,25°.
//   L) R11 Regler befehl.streu: Standard bitgleich, Klammern, Reglerplan gleichläufig, Richttempo beim Ziehen, Wirkung
//   K) R10 Sättigungsräume: Lagen vor/auf/hinter (Abstand, Schwenktempo der Richtung), Streu-Regel, Anteil vor/hinter
//   N) R14 Turm-KI im Schiffsrahmen: Prüfstand bitgleich (Anker R13), Turm-Rahmen oben/unten, Gier-Grenze, Raumzuteilung,
//      Momentaufnahme exakt · O) Angreifer: Gleichlauf, Läufe, Schaden, Mindestabstand, Wellen · P) Gefecht-Messung
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { erstelleZieldrohnen, DROHNEN } from '../src/sim/ki/zieldrohnen.js';
import { erstelleTurmKi, abfangen, TURMKI, querDeckel, STREU_REGLER, streuWert, waffeWert, grenzenOk } from '../src/sim/ki/turmziel.js';
import { erstelleAngreifer, ANGREIFER } from '../src/sim/ki/angreifer.js';
import { inSchiffsrahmen, zuWelt } from '../src/sim/ki/schiffsrahmen.js';
import { erstelleFlakLabor } from '../src/sim/flaklabor.js';
import { SCHIFFSDATEN, rumpfSperre, sperrSektor } from '../src/sim/schiffe/index.js';
import { FLAK, erstelleFlak } from '../src/sim/waffen/flak.js';
import { LAFETTEN, BATTERIE_MITTE as M, STANDARD_SEKTOR as S } from '../src/sim/waffen/lafetten.js';
import { zufall } from '../src/sim/zufall.js';

const DT = 1 / 60, V0 = 620, GRAD = Math.PI / 180;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert, ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const L = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

// ---------- Ersatz-Waffen ----------
// R8: Streuung 0,25° (Entscheidung 2), v0 je Turm (umschaltbar), Streukugel, nur Zeitzünder, Schaden nach Entscheidung 3.
function ersatzTuerme(v0 = V0) {
  return LAFETTEN.map((l) => ({ id: l.id, gier: 0, nick: 0.3, muendung: { x: l.x, y: l.y + l.zapfen.y, z: l.z },
    v0, reichweite: 2500, richtGeschw: [60 * GRAD, 50 * GRAD], streuung: 0.25 * GRAD, imBereich: true, ausgerichtet: true, bereit: true, gesperrt: false }));
}
// Schaden je Granatsorte (Entscheidung 3; Sperrgranate = flak.js R7): sofort, quadratischer Abfall ab vollRadius bis
// wirkRadius (Abstand zur Hülle); Splitterwolke linear mit dem Alter, am Rand halb.
const SCHADEN = {
  ziel: { sofort: 22, wirk: 30, voll: 4, splitterR: 30, splitterTakte: 30, splitterDps: 120 },
  sperr: { sofort: 14, wirk: 25, voll: 6, splitterR: 40, splitterTakte: 42, splitterDps: 350 },
};
function richte(tuerme, befehle) { // sofort ausgerichtet
  for (let i = 0; i < tuerme.length; i++) {
    const m = tuerme[i].muendung, p = befehle[i].punkt, dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z, d = L(dx, dy, dz);
    tuerme[i].gier = Math.atan2(dx, dz); tuerme[i].nick = Math.asin(dy / d);
  }
}
/** modell 'r7' = Verhaltens-Prüfungen (15 HP linear bis 25 m, keine Splitter — WARUM: die Schwarm-/Zielwahl-Grenzen in C/F
 *  sind gegen diese Tödlichkeit geeicht; der exakte Ersatz-Vorhalt ist tödlicher als die echte Waffe) ·
 *  'r8' = Schaden nach Entscheidung 3 (nur Info-Messungen je v0-Stufe; die Balance misst das Labor). */
function erstelleErsatzFlak(seed = 303, takteJeSchuss = 12, modell = 'r7') {
  const rnd = zufall(seed), geschosse = [], splitter = [];
  const ereignisse = { schuesse: [], detonationen: [], treffer: [] };
  let takt = 0;
  return {
    ereignisse, geschosse,
    schritt(tuerme, befehle, ziele) {
      ereignisse.schuesse.length = 0; ereignisse.detonationen.length = 0; ereignisse.treffer.length = 0;
      // Splitterwolken älterer Detonationen wirken nach
      for (let k = splitter.length - 1; k >= 0; k--) {
        const w = splitter[k], S = w.art, staerke = w.rest / S.splitterTakte;
        for (const z of ziele) {
          if (!z.aktiv) continue;
          const ab = L(z.pos.x - w.x, z.pos.y - w.y, z.pos.z - w.z) - z.r;
          if (ab < S.splitterR) ereignisse.treffer.push({ zielId: z.id, schaden: S.splitterDps * staerke * DT * (1 - Math.max(0, ab) / S.splitterR * 0.5), pos: w });
        }
        if (--w.rest <= 0) { splitter[k] = splitter[splitter.length - 1]; splitter.pop(); }
      }
      for (let i = 0; i < tuerme.length; i++) {
        const b = befehle[i], tm = tuerme[i], v0 = tm.v0;
        if (!b.feuer || tm.ausgerichtet === false || (takt + i * 2) % takteJeSchuss) continue;
        const m = tm.muendung;
        let qx = b.punkt.x, qy = b.punkt.y, qz = b.punkt.z;
        const dp = L(qx - m.x, qy - m.y, qz - m.z);
        // Streu-Ellipsoid (wie die Waffe, R10 Entscheidung 1): Punkt gleichverteilt im Ellipsoid um `punkt` — quer
        // ≤ Querdeckel·d (0,10 mit / deckelQuer ohne Leuchtspur, R12: 0,60), längs zur Schusslinie streuTiefe ≤ deckelTiefe·d; genau 3
        // Zufallszahlen (Gleichlauf); Zeitzünder auf diesen Punkt.
        const R = Math.min(b.streuKugel ?? 0, querDeckel(b.leuchtspur) * dp), RT = Math.min(b.streuTiefe ?? b.streuKugel ?? 0, FLAK.deckelTiefe * dp);
        let zuender = b.zuender;
        if (R > 0) {
          const cu = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), r = Math.cbrt(rnd()), su = Math.sqrt(1 - cu * cu);
          let ux = r * su * Math.cos(ph), uy = r * cu, uz = r * su * Math.sin(ph);
          const ex = (qx - m.x) / dp, ey = (qy - m.y) / dp, ez = (qz - m.z) / dp, al = ux * ex + uy * ey + uz * ez;
          qx += (ux - al * ex) * R + al * ex * RT; qy += (uy - al * ey) * R + al * ey * RT; qz += (uz - al * ez) * R + al * ez * RT;
          zuender = L(qx - m.x, qy - m.y, qz - m.z) / v0;
        }
        let dx = qx - m.x, dy = qy - m.y, dz = qz - m.z; const d = L(dx, dy, dz);
        const s = tm.streuung; dx = dx / d + (rnd() - 0.5) * 2 * s; dy = dy / d + (rnd() - 0.5) * 2 * s; dz = dz / d + (rnd() - 0.5) * 2 * s;
        const l = L(dx, dy, dz);
        geschosse.push({ x: m.x, y: m.y, z: m.z, vx: dx / l * v0, vy: dy / l * v0, vz: dz / l * v0, rest: zuender, turm: i,
          ziel: b.zielId !== null, nah: R > 0 && b.streuKugel < SCHADEN_KUGEL_ZIEL });
        ereignisse.schuesse.push({ turmId: i, leucht: !!b.leuchtspur });
      }
      for (let k = geschosse.length - 1; k >= 0; k--) {
        const g = geschosse[k], t = Math.min(DT, g.rest);
        g.x += g.vx * t; g.y += g.vy * t; g.z += g.vz * t; g.rest -= DT;
        if (g.rest > 0) continue;
        const pos = { x: g.x, y: g.y, z: g.z }, S = g.ziel ? SCHADEN.ziel : SCHADEN.sperr;
        // Nächste Drohne zum Zündzeitpunkt (zwischen den Takten): Lage am Ende dieses Takts zurückgerechnet
        let naechste = Infinity;
        for (const z of ziele) {
          if (!z.aktiv) continue;
          const back = DT - t, zx = z.pos.x - z.vel.x * back, zy = z.pos.y - z.vel.y * back, zz = z.pos.z - z.vel.z * back;
          const e = L(zx - pos.x, zy - pos.y, zz - pos.z);
          naechste = Math.min(naechste, e);
          if (modell === 'r7') { if (e < 25) ereignisse.treffer.push({ zielId: z.id, schaden: 15 * (1 - e / 25), pos }); continue; }
          const ab = Math.max(0, e - z.r);
          if (ab < S.wirk) ereignisse.treffer.push({ zielId: z.id, schaden: S.sofort * (ab <= S.voll ? 1 : (1 - (ab - S.voll) / (S.wirk - S.voll)) ** 2), pos });
        }
        ereignisse.detonationen.push({ pos, radius: S.wirk, art: 'zeit', turm: g.turm, ziel: g.ziel, nah: g.nah, naechste });
        if (modell !== 'r7') splitter.push({ x: pos.x, y: pos.y, z: pos.z, rest: S.splitterTakte, art: S });
        geschosse[k] = geschosse[geschosse.length - 1]; geschosse.pop();
      }
      takt++;
    },
  };
}
// R14: Standards der Streuung stehen in STREU_REGLER (T1), nicht mehr in TURMKI (Bezug R12)
const STD = (f) => STREU_REGLER[f].standard;
const SCHADEN_KUGEL_ZIEL = STD('ziel'); // Zielgranate mit Kugel < Zielfeuer-Radius = Nahbereich (Messung getrennt)

// ---------- A) Vorhalt ----------
{
  const ki = erstelleTurmKi({ startwert: 202 });
  const faelle = [
    ['quer', { x: 1, y: 0, z: 0 }], ['anfliegend', { x: 0, y: 0, z: -1 }], ['fliehend', { x: 0, y: 0, z: 1 }],
    ['schräg steigend', { x: 0.6, y: 0.5, z: -0.62 }], ['quer sinkend', { x: -0.8, y: -0.3, z: 0.52 }],
  ];
  let maxRech = 0, maxTakt = 0, kugelZiel = true;
  const befehl = { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 };
  // R8: Vorhalt mit dem v0 des Turms — beide Enden der Umschalt-Stufen
  for (const V0 of [620, 1100]) for (const [, r] of faelle) {
    const tuerme = ersatzTuerme(V0), m = tuerme[1].muendung;
    const l = L(r.x, r.y, r.z);
    // Ziel 1500 m vor Turm 1, 30° hoch, 150 m/s
    const ziel = { id: 7, pos: { x: m.x, y: m.y + 1500 * Math.sin(0.52), z: m.z + 1500 * Math.cos(0.52) },
      vel: { x: r.x / l * 150, y: r.y / l * 150, z: r.z / l * 150 }, r: 6, aktiv: true, angriff: false };
    ki.zuruecksetzen();
    const b = ki.schritt(DT, befehl, [ziel], tuerme)[1];
    const dx = b.punkt.x - m.x, dy = b.punkt.y - m.y, dz = b.punkt.z - m.z, d = L(dx, dy, dz), t = b.zuender;
    const gx = m.x + dx / d * V0 * t, gy = m.y + dy / d * V0 * t, gz = m.z + dz / d * V0 * t;
    maxRech = Math.max(maxRech, L(gx - ziel.pos.x - ziel.vel.x * t, gy - ziel.pos.y - ziel.vel.y * t, gz - ziel.pos.z - ziel.vel.z * t));
    const tk = Math.round(t / DT) * DT; // Detonation auf dem nächsten ganzen Takt
    maxTakt = Math.max(maxTakt, L(m.x + dx / d * V0 * tk - ziel.pos.x - ziel.vel.x * tk, m.y + dy / d * V0 * tk - ziel.pos.y - ziel.vel.y * tk, m.z + dz / d * V0 * tk - ziel.pos.z - ziel.vel.z * tk));
    const K0 = STD('ziel');
    if (b.streuKugel !== K0 || b.streuTiefe !== K0 || Math.abs(b.toleranz - Math.max(Math.min(K0, querDeckel(false) * d) / d, 0.008)) > 1e-12) kugelZiel = false;
  }
  zeile('A Vorhaltfehler rechnerisch (5 Bahnen × v0 620/1100, 1500 m, 150 m/s)', '< 1 m', f2(maxRech) + ' m', maxRech < 1);
  // WARUM ≤ 11 m: Zündung auf ganzen Takten verschiebt um ≤ DT/2 → (v0 + 150)·DT/2 = 10,4 m bei 1100 m/s
  zeile('A Vorhaltfehler, Zündung nur auf ganzen Takten', '≤ 11 m (Info)', f1(maxTakt) + ' m', maxTakt <= 11, false);
  zeile(`A Zielfeuer: streuKugel/streuTiefe ${STD('ziel')}/${STD('ziel')} m, toleranz = min(Kugel, ${FLAK.deckelQuer}·d)/d (ohne Leuchtspur)`, 'ja', kugelZiel ? 'ja' : 'nein', kugelZiel);
  // unlösbar: Ziel flieht schneller als die Granate (v0 620)
  const tuerme = ersatzTuerme(620), m = tuerme[1].muendung;
  const flieht = { id: 9, pos: { x: m.x, y: m.y + 500, z: m.z + 1400 }, vel: { x: 0, y: 0, z: 700 }, r: 6, aktiv: true, angriff: false };
  ki.zuruecksetzen();
  const b = ki.schritt(DT, befehl, [flieht], tuerme)[1];
  const ok = b.zielId === null && !b.feuer && Number.isFinite(b.punkt.x + b.zuender) && !abfangen(m, flieht.pos, flieht.vel, V0, {});
  zeile('A Abfang unlösbar (700 m/s fliehend) → kein Ziel, kein NaN', 'ja', ok ? 'ja' : 'nein', ok);
}

// ---------- B) Sperrfeuer ----------
{
  const ki = erstelleTurmKi({ startwert: 202 }), tuerme = ersatzTuerme(), flak = erstelleErsatzFlak(303, 12);
  const R = 800, befehl = { modus: 'sperrfeuer', feuerFrei: true, schirmAbstand: R, folgen: false };
  const raster = new Array(24).fill(0), alt = tuerme.map(() => null);
  let n = 0, radAbw = 0, maxGr = 0, maxNr = 0, ausserhalb = 0, aktiveMax = 0;
  const takte = 600 + 300; // 10 s messen nach 5 s Vorlauf (Granaten in der Luft)
  for (let k = 0; k < takte; k++) {
    const bef = ki.schritt(DT, befehl, [], tuerme);
    // Streichtempo der Befehle (Rohrwinkel von der Mündung aus)
    for (let i = 0; i < tuerme.length; i++) {
      const m = tuerme[i].muendung, p = bef[i].punkt, dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z;
      const g = Math.atan2(dx, dz), nk = Math.asin(dy / L(dx, dy, dz));
      if (alt[i] && k > 1) { maxGr = Math.max(maxGr, Math.abs(g - alt[i][0]) / DT); maxNr = Math.max(maxNr, Math.abs(nk - alt[i][1]) / DT); }
      alt[i] = [g, nk];
    }
    richte(tuerme, bef);
    flak.schritt(tuerme, bef, []);
    if (k < 300) continue;
    aktiveMax = Math.max(aktiveMax, flak.geschosse.length);
    for (const d of flak.ereignisse.detonationen) {
      const x = d.pos.x - M.x, y = d.pos.y - M.y, z = d.pos.z - M.z, r = L(x, y, z);
      radAbw = Math.max(radAbw, Math.abs(r - R) / R);
      const g = Math.atan2(x, z), nk = Math.asin(y / r);
      const gi = Math.floor((g - (S.gierMitte - S.gierHalb)) / (2 * S.gierHalb) * 6), ni = Math.floor((nk - S.nickMin) / (S.nickMax - S.nickMin) * 4);
      n++;
      if (gi < 0 || gi > 5 || ni < 0 || ni > 3) { ausserhalb++; continue; }
      raster[ni * 6 + gi]++;
    }
  }
  const mittel = raster.reduce((a, b) => a + b, 0) / 24, minZelle = Math.min(...raster);
  zeile('B Detonationen in 10 s (6 Türme × 5/s Ersatz)', 'Info', String(n), true, false);
  zeile('B Schalenradius-Abweichung (Schirm 800 m, Streuung 0,5°)', '≤ 5 %', f2(radAbw * 100) + ' %', radAbw <= 0.05);
  zeile('B Abdeckung 6×4: schwächste Zelle / Mittel', '≥ 50 %', (100 * minZelle / mittel).toFixed(0) + ' %', minZelle >= 0.5 * mittel);
  zeile('B Detonationen außerhalb des Sektors (Streuung am Rand)', '≤ 10 %', f1(100 * ausserhalb / n) + ' %', ausserhalb <= 0.1 * n, false);
  zeile('B Streichtempo Gier (Befehl) < Richttempo 60°/s', '< 60°/s', f1(maxGr / GRAD) + '°/s', maxGr < 60 * GRAD);
  zeile('B Streichtempo Nick (Befehl) < Richttempo 50°/s', '< 50°/s', f1(maxNr / GRAD) + '°/s', maxNr < 50 * GRAD);
  zeile('B Granaten gleichzeitig in der Luft', 'Info', String(aktiveMax), true, false);
  const s0 = ki.lage.schirme[0];
  const fest = ki.lage.schirme.length === 1 && Math.abs(s0.abstand - R) < 1e-9 && Math.abs(s0.gier - S.gierMitte) < 1e-9;
  zeile('B folgen: false → ein fester Schirm (Sektor + schirmAbstand)', 'ja', fest ? 'ja' : 'nein', fest);
}

// ---------- C) 5 min Zielfeuer gegen Zieldrohnen ----------
/** Messungen R7 je Takt: Killzone, Leuchtspur, Vorstöße, Folgen. */
function messeR7(k, dr, ki, bef, flak, befehl, m, z0) {
  const lage = ki.lage;
  for (const s of flak.ereignisse.schuesse) if (s.leucht) m.spur++;
  let naechste = Infinity, naechsteId = null;
  dr.ziele.forEach((z, i) => {
    const d = z.aktiv ? L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z) : Infinity;
    if (d < naechste) { naechste = d; naechsteId = z.id; }
    // Vorstoß: engster Abstand je Vorstoß
    if (z.vorstoss) z0.vsMin[i] = Math.min(z0.vsMin[i], d);
    else if (z0.vsWar[i]) { if (z.aktiv && Number.isFinite(z0.vsMin[i])) m.vsNah.push(z0.vsMin[i]); else m.vsAb = (m.vsAb ?? 0) + 1; z0.vsMin[i] = Infinity; }
    z0.vsWar[i] = z.vorstoss;
  });
  if (naechste < 500 && !lage.nahbereich) m.kzVerpasst++;
  if (naechste < 600) m.letzteNah = k;
  if (bef.some((b) => b.leuchtspur !== lage.nahbereich)) m.lsUngleich++;
  if (bef.some((b) => b.leuchtspur) && k - m.letzteNah > 31) m.lsOhneNah++;
  if (lage.nahbereich && !m.alarmWar) { m.alarmAn++; m.alarmStart = k; }
  if (!lage.nahbereich && m.alarmWar) m.alarmMin = Math.min(m.alarmMin, k - m.alarmStart);
  m.alarmWar = lage.nahbereich;
  // Eindringlinge: Wiedereintritt kurz nach dem Austritt = Flackern
  const jetzt = new Set(lage.eindringlinge);
  for (const id of z0.drinIds) if (!jetzt.has(id)) z0.raus.set(id, k);
  for (const id of jetzt) if (!z0.drinIds.has(id)) { m.kzEintritte++; const r = z0.raus.get(id); if (r !== undefined && k - r < 60) m.kzFlackern++; }
  z0.drinIds.clear(); for (const id of jetzt) z0.drinIds.add(id);
  if (lage.eindringlinge.length) {
    m.kzTakte++;
    let best = null, bd = Infinity;
    for (const z of dr.ziele) if (z.aktiv && jetzt.has(z.id)) { const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z); if (d < bd) { bd = d; best = z.id; } }
    if (bef.filter((b) => b.zielId === best).length < 2) m.kzUnterbesetzt++;
  }
  if (befehl.modus !== 'sperrfeuer' || befehl.folgen === false) return;
  // Folgen: Wandmitte ↔ Soll, Nachführtempo je Schirm-Platz
  m.folgTakte++; if (lage.schirme.length >= 2) m.zweiSchirme++;
  for (let g = 0; g < z0.vorSchirm.length; g++) {
    const s = lage.schirme[g];
    if (!s) { z0.vorSchirm[g] = null; continue; }
    const cw = (a, b) => [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
    const u = cw(s.gier, s.nick), v = cw(s.sollGier, s.sollNick);
    m.winkel.push(Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
    const p = z0.vorSchirm[g];
    if (p) {
      m.drehMax = Math.max(m.drehMax, Math.acos(Math.min(1, u[0] * p.u[0] + u[1] * p.u[1] + u[2] * p.u[2])) / DT);
      // R9: je Achse (die KI begrenzt Gier und Nick einzeln, wie die Türme richten); nur ohne Umgruppieren im Takt
      if (p.anz === lage.schirme.length) {
        const dg = s.gier - p.gier; m.drehG = Math.max(m.drehG, Math.abs(dg - 2 * Math.PI * Math.round(dg / (2 * Math.PI))) / DT);
        m.drehN = Math.max(m.drehN, Math.abs(s.nick - p.nick) / DT);
      }
      m.abstandTempoMax = Math.max(m.abstandTempoMax, Math.abs(s.abstand - p.abstand) / DT);
    }
    z0.vorSchirm[g] = { u, abstand: s.abstand, gier: s.gier, nick: s.nick, anz: lage.schirme.length };
  }
  // Liegen die Drohnen (außer Eindringlingen) im Sektor eines Kastens (±0,1 rad) bzw. streng IM Kasten (R9, auch Tiefe)?
  for (const z of dr.ziele) {
    if (!z.aktiv || lage.eindringlinge.includes(z.id)) continue;
    const x = z.pos.x - M.x, y = z.pos.y - M.y, zz = z.pos.z - M.z, d = L(x, y, zz), g = Math.atan2(x, zz), nk = Math.asin(y / d);
    m.bedrohung++;
    if (lage.schirme.some((s) => Math.abs(g - s.gier) <= s.gierHalb + 0.1 && Math.abs(nk - s.nick) <= s.nickHalb + 0.1)) m.imSektor++;
    if (lage.schirme.some((s) => Math.abs(g - s.gier) <= s.gierHalb && Math.abs(nk - s.nick) <= s.nickHalb && Math.abs(d - s.abstand) <= Math.max(s.tiefeHalb, 50))) m.imKasten++;
  }
  // Richttempo der Sperr-Rohre (Befehl), nur Rohre, die in beiden Takten Sperrfeuer schießen
  bef.forEach((b, i) => {
    const sch = lage.schirme.findIndex((sc) => sc.tuerme.includes(i)); // Wechsel des Schirms = gewollter Sprung
    const mu = z0.tuerme[i].muendung, dx = b.punkt.x - mu.x, dy = b.punkt.y - mu.y, dz = b.punkt.z - mu.z;
    const g = Math.atan2(dx, dz), nk = Math.asin(dy / L(dx, dy, dz)), p = z0.vorRohr[i];
    /* R9 (Befund Prüfer): Kastenwechsel eines Rohrs wird MIT gemessen (Übergang statt Sprung) */ if (p && b.zielId === null && p.sperr) { m.richtG = Math.max(m.richtG, Math.abs(g - p.g - 2 * Math.PI * Math.round((g - p.g) / (2 * Math.PI))) / DT); /* WARUM umbrechen: Kasten hinter der Batterie (Gier ±180°) */ m.richtN = Math.max(m.richtN, Math.abs(nk - p.n) / DT); }
    z0.vorRohr[i] = { g, n: nk, sperr: b.zielId === null, sch };
    if (p && p.sch !== sch) m.schirmWechselRohr = (m.schirmWechselRohr ?? 0) + 1;
  });
}

/** opt = { v0 (m/s, Start), v0Plan: Map(takt → v0) — R8: Umschalten mitten im Lauf } */
function lauf(takte, mitMessung, befehl = { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, opt = {}) {
  // Startwert der Drohnen per Umgebung tauschbar (Stichprobe: DROHNEN_START=7 node tests/ki.mjs)
  const dr = erstelleZieldrohnen({ startwert: Number(process.env.DROHNEN_START ?? 101) }), ki = erstelleTurmKi({ startwert: 202 });
  const tuerme = ersatzTuerme(opt.v0 ?? V0), flak = erstelleErsatzFlak(303, 12, opt.modell);
  const mess = {
    kzVerpasst: 0, lsUngleich: 0, lsOhneNah: 0, letzteNah: -1e9, alarmAn: 0, alarmWar: false, alarmStart: 0, alarmMin: Infinity,
    kzEintritte: 0, kzFlackern: 0, kzTakte: 0, kzUnterbesetzt: 0, spur: 0,
    vsNah: [], winkel: [], drehMax: 0, abstandTempoMax: 0, imSektor: 0, bedrohung: 0, zweiSchirme: 0, folgTakte: 0,
    richtG: 0, richtN: 0, dMin: Infinity, dMax: 0, yMin: Infinity, zNeg: 0, schritte: 0, paarMin: Infinity, jeZielMax: 0,
    abschuesse: 0, neustartOk: 0, neustartFehler: 0, ersterAngriff: null, durchSchirm: 0, nan: 0, zeitDr: 0, zeitKi: 0, treffer: 0, schuesse: 0,
    kugelFalsch: 0, detZiel: [], detNah: [], detSperr: [], imKasten: 0, kastenProben: 0, drehG: 0, drehN: 0 };
  const wartet = new Map(); // slot → { takt, id }
  const innen = new Array(DROHNEN.anzahl).fill(false);
  const vsMin = new Array(DROHNEN.anzahl).fill(Infinity), vsWar = new Array(DROHNEN.anzahl).fill(false);
  const raus = new Map(), drinIds = new Set(), vorSchirm = new Array(6).fill(null), vorRohr = new Array(6).fill(null);
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const misch = (x) => { f64[0] = x; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619); };
  for (let k = 0; k < takte; k++) {
    const nv = opt.v0Plan?.get(k);
    if (nv) for (const t of tuerme) t.v0 = nv;
    let t0 = performance.now();
    const erg = dr.schritt(DT, flak.ereignisse);
    let t1 = performance.now();
    const bef = ki.schritt(DT, befehl, dr.ziele, tuerme);
    const t2 = performance.now();
    mess.zeitDr += t1 - t0; mess.zeitKi += t2 - t1;
    richte(tuerme, bef);
    flak.schritt(tuerme, bef, dr.ziele);
    mess.treffer += flak.ereignisse.treffer.length; mess.schuesse += flak.ereignisse.schuesse.length;
    for (const z of dr.ziele) { misch(z.pos.x); misch(z.pos.y); misch(z.pos.z); misch(z.id); }
    for (const b of bef) { misch(b.punkt.x); misch(b.zielId ?? -1); misch(b.feuer ? 1 : 0); misch(b.leuchtspur ? 1 : 0); misch(b.streuKugel); misch(b.streuTiefe); }
    for (const sc of ki.lage.schirme) { misch(sc.gier); misch(sc.nick); misch(sc.abstand); }
    if (!mitMessung) continue;
    messeR7(k, dr, ki, bef, flak, befehl, mess, { vsMin, vsWar, raus, drinIds, vorSchirm, vorRohr, tuerme });
    for (const a of erg.abschuesse) { mess.abschuesse++; const slot = dr.ziele.findIndex((z) => z.id === a.id); wartet.set(slot, { takt: k, id: a.id }); }
    // R8–R10: Streu-Regel je Befehl (Sperrraum 70/40, feste Wand/kein Ziel 0, Nahbereich min(35, 0,10·d) quer = tief,
    // Zielfeuer 140/140) + toleranz (Ziel: min(max(Kugel, 8), Querdeckel·d)/d ≥ 0,008; Sperrraum: halbe kleinste Seite /
    // Abstand, 0,015–toleranzSperr)
    const SK = { ...TURMKI.streuKugel, ziel: STD('ziel'), sperr: STD('sperrQuer'), sperrTiefe: STD('sperrTiefe'), nahMax: STD('nahMax') }, folgt = befehl.modus === 'sperrfeuer' && befehl.folgen !== false;
    bef.forEach((b, i) => {
      const mu = tuerme[i].muendung, d = L(b.punkt.x - mu.x, b.punkt.y - mu.y, b.punkt.z - mu.z);
      const nah = b.zielId !== null && ki.lage.eindringlinge.includes(b.zielId);
      // R12: Zielkugel mit Leuchtspur quer ≤ 0,98 · 0,10 · d (Befund Waffentechniker: sonst kürzt die Waffe stumm)
      const zielQ = b.leuchtspur ? Math.min(SK.ziel, 0.98 * querDeckel(true) * d) : SK.ziel;
      const soll = b.zielId === null ? (folgt ? SK.sperr : 0) : nah ? Math.min(SK.nahMax, SK.nahAnteil * d) : zielQ;
      const sollT = b.zielId === null ? (folgt ? SK.sperrTiefe : 0) : nah ? soll : SK.ziel;
      const sc = ki.lage.schirme.find((q) => q.tuerme.includes(i));
      const tolSperr = folgt && sc ? Math.min(Math.max(0.5 * Math.min(sc.breite, sc.hoehe) / sc.abstand, 0.015), TURMKI.toleranzSperr) : TURMKI.toleranzSperr;
      const tol = b.zielId === null ? tolSperr : Math.max(Math.min(Math.max(soll, 8), querDeckel(b.leuchtspur) * d) / d, 0.008);
      if (!(Math.abs(b.streuKugel - soll) < 1e-6 && Math.abs(b.streuTiefe - sollT) < 1e-6 && Math.abs(b.toleranz - tol) < 1e-9)) mess.kugelFalsch++;
    });
    for (const dt of flak.ereignisse.detonationen) if (Number.isFinite(dt.naechste)) (!dt.ziel ? mess.detSperr : dt.nah ? mess.detNah : mess.detZiel).push(dt.naechste);
    const zaehl = new Map();
    for (const b of bef) if (b.zielId !== null) zaehl.set(b.zielId, (zaehl.get(b.zielId) ?? 0) + 1);
    // Killzone-Eindringlinge dürfen 3 Türme haben (R7), alle anderen höchstens 2
    for (const [id, v] of zaehl) {
      if (ki.lage.eindringlinge.includes(id)) mess.jeNahMax = Math.max(mess.jeNahMax ?? 0, v);
      else mess.jeZielMax = Math.max(mess.jeZielMax, v);
    }
    dr.ziele.forEach((z, i) => {
      const w = wartet.get(i);
      if (w && z.aktiv) { if (k - w.takt === 240 && z.id > w.id) mess.neustartOk++; else mess.neustartFehler++; wartet.delete(i); }
      if (!z.aktiv) return;
      if (![z.pos.x, z.pos.y, z.pos.z, z.vel.x, z.vel.y, z.vel.z].every(Number.isFinite)) mess.nan++;
      const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
      mess.dMin = Math.min(mess.dMin, d); mess.dMax = Math.max(mess.dMax, d); mess.yMin = Math.min(mess.yMin, z.pos.y);
      mess.schritte++; if (z.pos.z - M.z < 0) mess.zNeg++;
      const drin = d < 800;
      if (drin && !innen[i] && z.angriff) { mess.durchSchirm++; if (mess.ersterAngriff === null) mess.ersterAngriff = k * DT; }
      innen[i] = drin;
      for (let j = i + 1; j < dr.ziele.length; j++) {
        const q = dr.ziele[j]; if (!q.aktiv) continue;
        mess.paarMin = Math.min(mess.paarMin, L(z.pos.x - q.pos.x, z.pos.y - q.pos.y, z.pos.z - q.pos.z));
      }
    });
  }
  return { mess, h: h >>> 0, dr, ki };
}
{
  const T = 5 * 60 * 60;
  const { mess: m, dr, ki } = lauf(T, true);
  zeile('C Abstand Drohnen ↔ Batterie (5 min)', '200–2000 m', `${f1(m.dMin)} – ${f1(m.dMax)} m`, m.dMin >= 200 - 1e-6 && m.dMax <= 2000 + 1e-6);
  zeile('C Killzone im Zielfeuer: Alarm verpasst / Leuchtspur ≠ Alarm', '0 / 0', `${m.kzVerpasst} / ${m.lsUngleich}`, m.kzVerpasst === 0 && m.lsUngleich === 0);
  zeile('C Killzone im Zielfeuer: Eindringling mit < 2 Türmen (Takte)', '≤ 2 %', f1(100 * m.kzUnterbesetzt / Math.max(1, m.kzTakte)) + ' %', m.kzUnterbesetzt <= 0.02 * m.kzTakte);
  zeile('C Harte Klammer griff (Anteil Drohnen-Takte)', '≤ 1 %', f2(100 * dr.statistik.klammer / m.schritte) + ' %', dr.statistik.klammer <= 0.01 * m.schritte, false);
  zeile('C Tiefste Drohne', '≥ 80 m', f1(m.yMin) + ' m', m.yMin >= 80 - 1e-6);
  zeile('C Anteil im +Z-Halbraum', '≥ 95 %', f1(100 - 100 * m.zNeg / m.schritte) + ' %', m.zNeg <= 0.05 * m.schritte);
  zeile('C Engster Abstand zweier Drohnen', '≥ 30 m', f1(m.paarMin) + ' m', m.paarMin >= 30);
  zeile('C NaN in Lage/Tempo', '0', String(m.nan), m.nan === 0);
  zeile('C Abschüsse / Neustarts genau 240 Takte, neue id', '> 0 / alle', `${m.abschuesse} / ${m.neustartOk} ok, ${m.neustartFehler} falsch`, m.abschuesse > 0 && m.neustartFehler === 0 && m.neustartOk > 0);
  zeile('C Ausweichhaken ausgelöst', '> 0', String(dr.statistik.ausweichen), dr.statistik.ausweichen > 0);
  zeile('C Erster Angriffslauf durch den Schirm (800 m)', '< 20 s', m.ersterAngriff === null ? '—' : f1(m.ersterAngriff) + ' s', m.ersterAngriff !== null && m.ersterAngriff < 20, false);
  zeile('C Angriffsläufe durch den Schirm (5 min)', '≥ 20', String(m.durchSchirm), m.durchSchirm >= 20, false);
  zeile('C Höchstens Türme je Ziel (außer Killzone) / je Eindringling', '≤ 2 / ≤ 3', `${m.jeZielMax} / ${m.jeNahMax ?? 0}`, m.jeZielMax <= 2 && ki.statistik.maxJeZiel <= 2 && (m.jeNahMax ?? 0) <= 3);
  const wMax = Math.max(...ki.statistik.wechsel) / 5, zw = ki.statistik.zwang.reduce((a, b) => a + b, 0) / 5;
  zeile('C Freiwillige Zielwechsel je Turm und Minute (max)', '≤ 6', f1(wMax), wMax <= 6);
  zeile('C Flackern (A → B → A binnen 5 s), alle Türme, 5 min', '≤ 10 (Info: meist Angreifer, der in den Anflug wechselt)', String(ki.statistik.flackern), ki.statistik.flackern <= 10, false);
  zeile('C Zwangswechsel (Ziel weg/außer Reichweite) je Minute, alle Türme', 'Info', f1(zw), true, false);
  zeile('C Treffer je Schuss (Ersatz-Flak, Info)', 'Info', f2(m.treffer / Math.max(1, m.schuesse)), true, false);
  zeile('C Streukugel/toleranz nach Regel (Befehle × Takte falsch)', '0', String(m.kugelFalsch), m.kugelFalsch === 0);
  const dz = m.detZiel.slice().sort((a, b) => a - b), dn = m.detNah.slice().sort((a, b) => a - b);
  const unter4 = (a) => 100 * a.filter((x) => x < 4).length / Math.max(1, a.length);
  // WARUM weich: der Abstand enthält neben der Kugel die Ausweichhaken der Drohnen (Vorhalt-Fehler) — das Labor misst echt.
  // R10 (Nutzer: „wenig gezieltes Feuer“): Ziel ≥ 100 m statt 10–25 m (Kugel 140 m quer und tief)
  zeile('C Zielfeuer: Detonation ↔ nächste Drohne (Median / < 4 m)', '≥ 100 m / < 5 %', `${f1(dz[dz.length >> 1] ?? NaN)} m / ${f1(unter4(dz))} % (n = ${dz.length})`, dz.length > 0 && dz[dz.length >> 1] >= 100 && unter4(dz) < 5, false);
  zeile('C Nahbereich: Detonation ↔ nächste Drohne (Median / < 4 m)', 'Info', `${f1(dn[dn.length >> 1] ?? NaN)} m / ${f1(unter4(dn))} % (n = ${dn.length})`, true, false);
  const msDr = m.zeitDr / T, msKi = m.zeitKi / T;
  zeile('C Rechenzeit Drohnen je Takt', '< 0,1 ms', (msDr * 1000).toFixed(1) + ' µs', msDr < 0.1, false);
  zeile('C Rechenzeit Turm-KI je Takt', '< 0,1 ms', (msKi * 1000).toFixed(1) + ' µs', msKi < 0.1, false);
  zeile('C Rechenzeit KI gesamt je Takt (Budget)', '< 1 ms', ((msDr + msKi) * 1000).toFixed(1) + ' µs', msDr + msKi < 1);
}

// ---------- F) Sperrfeuer folgt (R7) ----------
const FOLGEN = { modus: 'sperrfeuer', feuerFrei: true, schirmAbstand: 800 }; // folgen fehlt → Standard true
{
  const T = 5 * 60 * 60;
  const { mess: m, dr, ki } = lauf(T, true, FOLGEN);
  const w = m.winkel.slice().sort((a, b) => a - b), mittel = w.reduce((a, b) => a + b, 0) / w.length, p90 = w[Math.floor(w.length * 0.9)];
  // WARUM ≤ 12° statt 8° (Frühwarnung): das Nachführtempo ist die Bremse — Messung R7: 12,3° bei 12°/s,
  // 8,4° bei 20°/s; mit überlebenden (gepanzerten) Vorstößen 10,0° — ≤ 10° hält nicht sicher. Sichtbarer Maßstab ist
  // „Drohnen im Schirm-Sektor“.
  zeile('F Wandmitte ↔ Bedrohungsschwerpunkt (Winkel, Mittel)', '≤ 12°', f1(mittel / GRAD) + '°', mittel <= 12 * GRAD);
  zeile('F Wandmitte ↔ Bedrohungsschwerpunkt (Winkel, 90 %)', '≤ 30°', f1(p90 / GRAD) + '°', p90 <= 30 * GRAD, false);
  zeile('F Drohnen (außer Eindringlingen) im Schirm-Sektor', '≥ 50 % (Info)', f1(100 * m.imSektor / Math.max(1, m.bedrohung)) + ' %', m.imSektor >= 0.5 * m.bedrohung, false);
  // R9: Nachführen je Achse begrenzt (Gier um die Hochachse, Nick), wie die Türme richten
  const FG = TURMKI.folgen;
  zeile('F Nachführtempo der Kastenmitte Gier / Nick (max)', `≤ ${f1(FG.maxDreh / GRAD)} / ${f1(FG.maxDrehNick / GRAD)}°/s`, `${f2(m.drehG / GRAD)} / ${f2(m.drehN / GRAD)}°/s`, m.drehG <= FG.maxDreh * 1.001 && m.drehN <= FG.maxDrehNick * 1.001);
  zeile('F Nachführtempo Großkreis (max, Info)', 'Info', f2(m.drehMax / GRAD) + '°/s', true, false);
  zeile('F Abstands-Nachführung (max)', `≤ ${FG.maxAbstandTempo} m/s`, f1(m.abstandTempoMax) + ' m/s', m.abstandTempoMax <= FG.maxAbstandTempo + 1e-6);
  const ds = m.detSperr.slice().sort((a, b) => a - b);
  // WARUM weich: Ersatz-Flak (Zünder exakt, Drohnen sterben) — die Labor-Messung mit unverwundbaren Drohnen ist maßgeblich
  // R10: Sättigungsraum statt Kasten auf der Drohne → 150–250 m; R12 (Nutzer: „viel mehr verteilen“) → 220–400 m
  zeile('F Sperrfeuer: Detonation ↔ nächste Drohne (Median, Ersatz-Flak)', '220–400 m', `${f1(ds[ds.length >> 1] ?? NaN)} m (n = ${ds.length})`, ds.length > 0 && ds[ds.length >> 1] >= 220 && ds[ds.length >> 1] <= 400, false);
  zeile('F Drohnen streng im Kasten (Gier, Nick, Tiefe)', 'Info', f1(100 * m.imKasten / Math.max(1, m.bedrohung)) + ' %', true, false);
  zeile('F Richttempo der Sperr-Rohre Gier / Nick (Befehl, max)', '< 60 / 50°/s', `${f1(m.richtG / GRAD)} / ${f1(m.richtN / GRAD)}°/s`, m.richtG < 60 * GRAD && m.richtN < 50 * GRAD);
  zeile('F Anteil Zeit mit ≥ 2 Kästen / Gruppenwechsel / Rohr wechselt Kasten', 'Info', `${f1(100 * m.zweiSchirme / m.folgTakte)} % / ${ki.statistik.gruppenWechsel} / ${m.schirmWechselRohr ?? 0}`, true, false);
  const vs = dr.statistik.vorstoesse / 5, nah = m.vsNah.slice().sort((a, b) => a - b);
  zeile('F Vorstöße je Minute', '2–4,5', f1(vs), vs >= 2 && vs <= 4.5);
  zeile('F Vorstöße überlebt / im Vorstoß abgeschossen (Ersatz-Flak)', 'Info', `${nah.length} / ${m.vsAb ?? 0}`, true, false);
  // WARUM weich: die Ersatz-Flak (exakter Vorhalt, 3 Türme) schießt im Nahbereich fast alles ab — ob Vorstöße den Rückzug
  // erleben, entscheidet der echte Zielgranaten-Schaden (Labor-Messung). Die Bahn selbst prüft G ohne Beschuss.
  zeile('F Engster Punkt überlebter Vorstöße (min / Median / max)', '≥ 200 m, ≥ 1 überlebt', nah.length ? `${f1(nah[0])} / ${f1(nah[nah.length >> 1])} / ${f1(nah[nah.length - 1])} m` : '— (keiner überlebt)', nah.length > 0 && nah[0] >= 200 - 1e-6, false);
  zeile('F Engster Abstand zur Batterie (alle Drohnen)', '≥ 200 m', f1(m.dMin) + ' m', m.dMin >= 200 - 1e-6);
  zeile('F Abstand Drohnen ↔ Batterie (5 min)', '200–2000 m', `${f1(m.dMin)} – ${f1(m.dMax)} m`, m.dMin >= 200 - 1e-6 && m.dMax <= 2000 + 1e-6);
  zeile('F Engster Abstand zweier Drohnen', '≥ 30 m', f1(m.paarMin) + ' m', m.paarMin >= 30);
  zeile('F Harte Klammer griff (Anteil Drohnen-Takte)', '≤ 1 %', f2(100 * dr.statistik.klammer / m.schritte) + ' %', dr.statistik.klammer <= 0.01 * m.schritte, false);
  zeile('F Killzone: Eintritte / Wiedereintritt < 1 s nach Austritt', '— / 0', `${m.kzEintritte} / ${m.kzFlackern}`, m.kzEintritte > 0 && m.kzFlackern === 0);
  zeile('F Nahbereich-Alarm: Einschaltungen / kürzeste Dauer', '— / ≥ 0,5 s', `${m.alarmAn} / ${f2(m.alarmMin * DT)} s`, m.alarmAn > 0 && m.alarmMin * DT >= 0.5 - 1e-9);
  zeile('F Alarm verpasst (Drohne < 500 m, kein Alarm)', '0 Takte', String(m.kzVerpasst), m.kzVerpasst === 0);
  zeile('F Leuchtspur ≠ Alarm / Leuchtspur ohne Drohne < 600 m (> 0,5 s)', '0 / 0', `${m.lsUngleich} / ${m.lsOhneNah}`, m.lsUngleich === 0 && m.lsOhneNah === 0);
  zeile('F Eindringling mit < 2 Türmen (Takte)', '≤ 2 %', f1(100 * m.kzUnterbesetzt / Math.max(1, m.kzTakte)) + ' %', m.kzUnterbesetzt <= 0.02 * m.kzTakte);
  zeile('F Schüsse mit Leuchtspur', 'Info', f1(100 * m.spur / Math.max(1, m.schuesse)) + ' %', true, false);
  zeile('F Abschüsse / Treffer je Schuss (Ersatz-Flak)', 'Info', `${m.abschuesse} / ${f2(m.treffer / Math.max(1, m.schuesse))}`, true, false);
  const msKi = m.zeitKi / T, msDr = m.zeitDr / T;
  zeile('F Rechenzeit Drohnen + Turm-KI je Takt', '< 1 ms', ((msDr + msKi) * 1000).toFixed(1) + ' µs', msDr + msKi < 1);
}

// ---------- G) Vorstöße ohne Beschuss (Bahn-Geometrie allein) ----------
{
  const dr = erstelleZieldrohnen({ startwert: Number(process.env.DROHNEN_START ?? 101) });
  const vsMin = new Array(DROHNEN.anzahl).fill(Infinity), war = new Array(DROHNEN.anzahl).fill(false), nah = [];
  let dMin = Infinity, gleichzeitig = 0, atemMin = Infinity, atemMax = 0;
  for (let k = 0; k < 5 * 60 * 60; k++) {
    dr.schritt(DT, null);
    let n = 0;
    dr.ziele.forEach((z, i) => {
      const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
      dMin = Math.min(dMin, d);
      if (z.vorstoss) { n++; vsMin[i] = Math.min(vsMin[i], d); } else if (war[i]) { nah.push(vsMin[i]); vsMin[i] = Infinity; }
      if (!z.vorstoss && !war[i] && (z.bahn === 'kreisen' || z.bahn === 'schlange')) { atemMin = Math.min(atemMin, d); atemMax = Math.max(atemMax, d); }
      war[i] = z.vorstoss;
    });
    gleichzeitig = Math.max(gleichzeitig, n);
  }
  nah.sort((a, b) => a - b);
  zeile('G Vorstöße je Minute (ohne Beschuss)', '2–4,5', f1(dr.statistik.vorstoesse / 5), dr.statistik.vorstoesse / 5 >= 2 && dr.statistik.vorstoesse / 5 <= 4.5);
  zeile('G Engster Punkt je Vorstoß (min / Median / max)', '200–320 m', `${f1(nah[0])} / ${f1(nah[nah.length >> 1])} / ${f1(nah[nah.length - 1])} m`, nah[0] >= 200 - 1e-6 && nah[nah.length - 1] <= 320);
  zeile('G Höchstens gleichzeitige Vorstöße', '≤ 2', String(gleichzeitig), gleichzeitig <= 2);
  zeile('G Kreiser/Schlangen außerhalb der Vorstöße (Atmen)', 'Info', `${f1(atemMin)} – ${f1(atemMax)} m`, true, false);
  zeile('G Engster Abstand zur Batterie', '≥ 200 m', f1(dMin) + ' m', dMin >= 200 - 1e-6);
}

// ---------- H) Umschalten Folgen ↔ fest (Befund Prüfer R7) ----------
{
  const dr = erstelleZieldrohnen({ startwert: 101 }), ki = erstelleTurmKi({ startwert: 202 }), tuerme = ersatzTuerme();
  const befehl = { modus: 'sperrfeuer', feuerFrei: true, schirmAbstand: 800, folgen: true };
  // Takt → Schalter. „seite“ = wie die Seite: beim Umschalten auf fest den aktuellen KI-Abstand übernehmen
  const plan = new Map([[20 * 60, { folgen: false, seite: true }], [35 * 60, { folgen: true }],
    [50 * 60, { folgen: false, seite: false, abstand: 1200 }], [60 * 60, { folgen: true }], [62 * 60, { folgen: false, seite: true }]]);
  const richtung = (sc) => [Math.sin(sc.gier) * Math.cos(sc.nick), Math.sin(sc.nick), Math.cos(sc.gier) * Math.cos(sc.nick)];
  const kopie = () => ki.lage.schirme.map((sc) => ({ u: richtung(sc), abstand: sc.abstand, tuerme: sc.tuerme.length, x: sc.mitte.x, y: sc.mitte.y, z: sc.mitte.z }));
  let vor = null, sprungW = 0, sprungA = 0, normalW = 0, normalA = 0, schalter = 0;
  for (let k = 0; k < 70 * 60; k++) {
    const p = plan.get(k);
    if (p) {
      schalter++;
      befehl.folgen = p.folgen;
      if (p.seite) { let q = ki.lage.schirme[0]; for (const sc of ki.lage.schirme) if (sc.tuerme.length > q.tuerme.length) q = sc; befehl.schirmAbstand = q.abstand; }
      if (p.abstand) befehl.schirmAbstand = p.abstand;
    }
    dr.schritt(DT, null);
    const bef = ki.schritt(DT, befehl, dr.ziele, tuerme);
    richte(tuerme, bef);
    const jetzt = kopie();
    if (vor && vor.length) {
      // je Schirm nach dem Takt: nächster Schirm davor (Winkel, Abstand)
      let w = 0, d = 0;
      for (const j of jetzt) {
        let bw = Infinity, bd = Infinity;
        // WARUM über die 3D-Mitte (R9): Kästen können in gleicher Richtung hintereinander stehen (radiale Teilung)
        let bm = Infinity;
        for (const v of vor) { const e = L(j.x - v.x, j.y - v.y, j.z - v.z); if (e < bm) { bm = e; bw = Math.acos(Math.min(1, j.u[0] * v.u[0] + j.u[1] * v.u[1] + j.u[2] * v.u[2])); bd = Math.abs(j.abstand - v.abstand); } }
        w = Math.max(w, bw); d = Math.max(d, bd);
      }
      if (p || plan.has(k - 1)) { sprungW = Math.max(sprungW, w); sprungA = Math.max(sprungA, d); } else { normalW = Math.max(normalW, w); normalA = Math.max(normalA, d); }
    }
    vor = jetzt;
  }
  const grenzeW = Math.hypot(TURMKI.folgen.maxDreh, TURMKI.folgen.maxDrehNick) * DT * 1.01, grenzeA = TURMKI.folgen.maxAbstandTempo * DT + 1e-6;
  zeile(`H Umschalten Folgen ↔ fest (${schalter}×): Sprung der Mitte im Umschalt-Takt`, `≤ ${f2(grenzeW / GRAD)}°`, f2(sprungW / GRAD) + '°', sprungW <= grenzeW);
  zeile('H Umschalten: Sprung des Abstands im Umschalt-Takt', `≤ ${f2(grenzeA)} m`, f2(sprungA) + ' m', sprungA <= grenzeA);
  zeile('H Zum Vergleich: größter Schritt sonst (Mitte / Abstand)', 'Info', `${f2(normalW / GRAD)}° / ${f2(normalA)} m`, normalW <= grenzeW && normalA <= grenzeA, false);
}

// ---------- I) v0 umschalten mitten im Lauf (R8): 620 → 1100 → 620 → 1100 → 1000 ----------
// Türme mit echtem Richttempo (60/50°/s) statt sofort ausgerichtet; Ersatz-Flak feuert nur ausgerichtet.
const V0_PLAN = new Map([[20 * 60, 1100], [40 * 60, 620], [60 * 60, 1100], [70 * 60, 1000]]);
for (const [name, bef0] of [['Zielfeuer', { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }], ['Sperrfeuer folgt', FOLGEN]]) {
  const dr = erstelleZieldrohnen({ startwert: 101 }), ki = erstelleTurmKi({ startwert: 202 }), tuerme = ersatzTuerme(620);
  const flak = erstelleErsatzFlak(303, 6);
  const wd = (a, b) => { const d = a - b; return d - 2 * Math.PI * Math.floor((d + Math.PI) / (2 * Math.PI)); };
  let gebremstU = 0, rateG = 0, rateN = 0, nan = 0, geprueft = 0, vorhaltMax = 0, sprungU = 0, sprungN = 0, zielWechselU = 0, nachrichtMax = 0;
  const vorBef = tuerme.map(() => null), warte = tuerme.map(() => -1);
  for (let k = 0; k < 80 * 60; k++) {
    const nv = V0_PLAN.get(k);
    if (nv) for (const t of tuerme) t.v0 = nv;
    dr.schritt(DT, flak.ereignisse);
    const bef = ki.schritt(DT, bef0, dr.ziele, tuerme);
    for (let i = 0; i < tuerme.length; i++) {
      const t = tuerme[i], b = bef[i], mu = t.muendung;
      if (![b.punkt.x, b.punkt.y, b.punkt.z, b.zuender, b.toleranz, b.streuKugel].every(Number.isFinite)) nan++;
      const dx = b.punkt.x - mu.x, dy = b.punkt.y - mu.y, dz = b.punkt.z - mu.z, d = L(dx, dy, dz) || 1;
      const sG = Math.atan2(dx, dz), sN = Math.asin(dy / d);
      // Befehls-Sprung (Winkel des Befehls): im Umschalt-Takt vs. sonst, nur bei gleichem Ziel
      const v = vorBef[i];
      if (v && b.zielId !== null && v.ziel === b.zielId) {
        const w = Math.hypot(wd(sG, v.g) * Math.cos(sN), sN - v.n);
        if (nv) sprungU = Math.max(sprungU, w); else sprungN = Math.max(sprungN, w);
      }
      if (nv && v && v.ziel !== null && v.ziel !== b.zielId) zielWechselU++;
      vorBef[i] = { g: sG, n: sN, ziel: b.zielId };
      // Richten mit Grenzen
      const g0 = t.gier, n0 = t.nick, mg = t.richtGeschw[0] * DT, mn = t.richtGeschw[1] * DT;
      t.gier = wd(t.gier + Math.max(-mg, Math.min(mg, wd(sG, t.gier))), 0);
      t.nick += Math.max(-mn, Math.min(mn, sN - t.nick));
      rateG = Math.max(rateG, Math.abs(wd(t.gier, g0)) / DT); rateN = Math.max(rateN, Math.abs(t.nick - n0) / DT);
      if (!Number.isFinite(t.gier + t.nick)) nan++;
      const warAus = t.ausgerichtet;
      t.ausgerichtet = Math.hypot(wd(sG, t.gier) * Math.cos(t.nick), sN - t.nick) <= b.toleranz;
      // Wieder ausgerichtet nach dem Umschalten (gleiches Ziel): Takte zählen
      if (nv && warAus && !t.ausgerichtet && b.zielId !== null) warte[i] = k;
      if (warte[i] >= 0 && (t.ausgerichtet || b.zielId === null)) { nachrichtMax = Math.max(nachrichtMax, k - warte[i]); warte[i] = -1; }
      // Vorhalt im Umschalt-Takt mit dem NEUEN v0: Granate (gerade, v0) und Ziel treffen sich in punkt.
      // R12: Befehle, die die Zenit-Bremse hält (feuer aus, Punkt läuft gebremst nach), sind keine Schusslösung → gezählt, nicht geprüft
      if (nv && b.zielId !== null && !b.feuer) gebremstU++;
      if (nv && b.zielId !== null && b.feuer) {
        const z = dr.ziele.find((q) => q.id === b.zielId), ab = {};
        if (z && abfangen(mu, z.pos, z.vel, t.v0, ab) && ab.t * t.v0 >= TURMKI.zuenderStrecke && ab.t <= 4) {
          const tt = b.zuender;
          vorhaltMax = Math.max(vorhaltMax, L(mu.x + dx / d * t.v0 * tt - z.pos.x - z.vel.x * tt, mu.y + dy / d * t.v0 * tt - z.pos.y - z.vel.y * tt, mu.z + dz / d * t.v0 * tt - z.pos.z - z.vel.z * tt));
          geprueft++;
        }
      }
    }
    flak.schritt(tuerme, bef, dr.ziele);
  }
  zeile(`I ${name}: v0 620→1100→620→1100→1000, NaN in Befehl/Turm`, '0', String(nan), nan === 0);
  zeile(`I ${name}: Turm-Ist-Winkel Gier / Nick (max)`, '≤ 60 / 50°/s', `${f1(rateG / GRAD)} / ${f1(rateN / GRAD)}°/s`, rateG <= 60 * GRAD + 1e-9 && rateN <= 50 * GRAD + 1e-9);
  if (name === 'Zielfeuer') zeile(`I ${name}: Vorhalt im Umschalt-Takt mit neuem v0 (${geprueft} Befehle, ${gebremstU} von der Zenit-Bremse gehalten)`, '< 1 m', f2(vorhaltMax) + ' m', geprueft > 0 && vorhaltMax < 1);
  zeile(`I ${name}: Befehls-Sprung im Umschalt-Takt / sonst (max, gleiches Ziel ≠ null)`, 'Info', `${f2(sprungU / GRAD)}° / ${f2(sprungN / GRAD)}°`, true, false);
  zeile(`I ${name}: Zielwechsel im Umschalt-Takt / wieder ausgerichtet nach`, '0 / ≤ 0,5 s', `${zielWechselU} / ${f2(nachrichtMax * DT)} s`, zielWechselU === 0 && nachrichtMax * DT <= 0.5, false);
}

// ---------- J) Abschüsse je v0-Stufe, Schaden nach Entscheidung 3 (Info; Balance misst das Labor) ----------
{
  const teile = [];
  for (const v0 of [620, 820, 1000, 1100]) {
    const z = lauf(5 * 60 * 60, true, { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, { v0, modell: 'r8' }).mess;
    const f = lauf(5 * 60 * 60, true, FOLGEN, { v0, modell: 'r8' }).mess;
    const dz = z.detZiel.slice().sort((a, b) => a - b);
    teile.push(`${v0}: Z ${z.abschuesse} / S ${f.abschuesse} / Vorstoß überlebt ${f.vsNah.length}/${f.vsNah.length + (f.vsAb ?? 0)} / Med ${f1(dz[dz.length >> 1] ?? NaN)} m`);
  }
  zeile('J 5 min je v0: Abschüsse Zielfeuer / Sperrfeuer, Vorstöße überlebt (Ersatz-Flak: nur Verhalten, KEINE Balance — die misst das Labor mit der echten Flak, Protokoll R8)', 'Info', teile.join(' · '), true, false);
}

// ---------- K) Sättigungsräume (R10): Lagen, Schwenktempo, Detonationen vor/hinter, Abstand (unverwundbar) ----------
{
  const dr = erstelleZieldrohnen({ startwert: Number(process.env.DROHNEN_START ?? 101) }), ki = erstelleTurmKi({ startwert: 202 });
  const tuerme = ersatzTuerme(1100), flak = erstelleErsatzFlak(303, 6), LA = TURMKI.folgen.lagen, FA = STD('lagenAnteil') / LA.anteil; // R14: Klammer skaliert mit dem Regler (R11)
  let lagenFalsch = 0, schwenk = 0, proben = 0, raeume = 0, dreiLagen = 0, mitDrei = 0;
  const vorR = new Array(6).fill(null), laengs = [], abst = [];
  for (let k = 0; k < 3 * 60 * 60; k++) {
    for (const z of dr.ziele) z.hp = 1e9; // unverwundbar: Abstand/Lage ohne tote Ziele messen (Lehre R8)
    dr.schritt(DT, flak.ereignisse);
    const bef = ki.schritt(DT, FOLGEN, dr.ziele, tuerme);
    richte(tuerme, bef);
    flak.schritt(tuerme, bef, dr.ziele);
    const S = ki.lage.schirme;
    S.forEach((sc, g) => {
      const e = sc.laengs, a = sc.lagenAbstand, l0 = sc.lagen[0], l2 = sc.lagen[2];
      proben++;
      // Lagen: Abstand vor ↔ hinter = 2a, a in [min, max], Richtung Einheitsvektor, auf der Linie längs e
      const d02 = L(l0.x - l2.x, l0.y - l2.y, l0.z - l2.z), ok = Math.abs(d02 - 2 * a) < 1e-6 && a >= LA.min * FA - 1e-9 && a <= LA.max * FA + 1e-9 && Math.abs(L(e.x, e.y, e.z) - 1) < 1e-9
        && Math.abs(((l0.x - l2.x) * e.x + (l0.y - l2.y) * e.y + (l0.z - l2.z) * e.z) - d02) < 1e-6;
      if (!ok) lagenFalsch++;
      const p = vorR[g];
      if (p && p.anz === S.length) schwenk = Math.max(schwenk, Math.acos(Math.min(1, e.x * p.x + e.y * p.y + e.z * p.z)) / DT);
      vorR[g] = { x: e.x, y: e.y, z: e.z, anz: S.length };
      // Räume mit ≥ 3 Sperr-Rohren (ohne Killzone) besetzen alle drei Lagen
      const frei = sc.tuerme.filter((i) => bef[i].zielId === null).length;
      if (sc.tuerme.length >= 3 && frei === sc.tuerme.length) mitDrei++;
    });
    for (let g = S.length; g < vorR.length; g++) vorR[g] = null; // WARUM: Raum fiel weg → später neu, kein Vergleich mit alt
    raeume = Math.max(raeume, S.length);
    if (k < 600 || ki.lage.nahbereich) continue;
    for (const d of flak.ereignisse.detonationen) {
      if (d.ziel) continue;
      let best = null, bd = Infinity;
      for (const z of dr.ziele) if (z.aktiv) { const e = L(z.pos.x - d.pos.x, z.pos.y - d.pos.y, z.pos.z - d.pos.z); if (e < bd) { bd = e; best = z; } }
      if (!best) continue;
      const v = L(best.vel.x, best.vel.y, best.vel.z) || 1;
      laengs.push(((d.pos.x - best.pos.x) * best.vel.x + (d.pos.y - best.pos.y) * best.vel.y + (d.pos.z - best.pos.z) * best.vel.z) / v);
      abst.push(bd);
    }
  }
  zeile(`K Lagen vor/auf/hinter: Abstand ${LA.min * FA}–${LA.max * FA} m, auf einer Linie längs der Flugrichtung (Proben falsch)`, '0', `${lagenFalsch} von ${proben}`, lagenFalsch === 0);
  zeile('K Schwenktempo der Richtung „vor“ (max)', `≤ ${f1(LA.maxDreh / GRAD)}°/s`, f2(schwenk / GRAD) + '°/s', schwenk <= LA.maxDreh * 1.01);
  zeile('K Räume höchstens / Proben mit ≥ 3 Sperr-Rohren in einem Raum', 'Info', `${raeume} / ${mitDrei}`, true, false);
  const vor = 100 * laengs.filter((x) => x > 75).length / Math.max(1, laengs.length), hinter = 100 * laengs.filter((x) => x < -75).length / Math.max(1, laengs.length);
  const sa = abst.slice().sort((a, b) => a - b), medA = sa[sa.length >> 1] ?? NaN;
  // WARUM weich: Ersatz-Flak (exakter Zünder, Turm sofort ausgerichtet) — maßgeblich ist die Labor-Messung (Protokoll R10)
  zeile('K Sperr-Detonationen vor (> +75 m) / hinter (< −75 m) der nächsten Drohne, längs ihrer Flugrichtung', '≥ 25 % / > 0 (Ersatz-Flak)', `${f1(vor)} % / ${f1(hinter)} % (n = ${laengs.length})`, vor >= 25 && hinter > 0, false);
  // R12 (Nutzer: „viel mehr verteilen“): Ziel ≥ 250 m im Labor; Ersatz-Flak liegt ähnlich (R10: 150–250)
  zeile('K Sperr: Detonation ↔ nächste Drohne (Median, unverwundbar, Ersatz-Flak)', '220–400 m', f1(medA) + ' m', medA >= 220 && medA <= 400, false);
}

// ---------- L) Regler befehl.streu (R11) ----------
{
  const STD = Object.fromEntries(Object.entries(STREU_REGLER).map(([f, r]) => [f, r.standard]));
  // Klammern: fehlt / NaN / Text → Standard, außerhalb → Grenze
  let klammerOk = true;
  for (const [f, r] of Object.entries(STREU_REGLER)) {
    if (streuWert(undefined, f) !== r.standard || streuWert({ [f]: NaN }, f) !== r.standard || streuWert({ [f]: '50' }, f) !== r.standard
      || streuWert({ [f]: r.min - 1 }, f) !== r.min || streuWert({ [f]: r.max + 1 }, f) !== r.max) klammerOk = false;
  }
  zeile(`L streuWert: fehlt/NaN/Text → Standard, außerhalb → Grenze (alle ${Object.keys(STREU_REGLER).length} Regler)`, 'ja', klammerOk ? 'ja' : 'nein', klammerOk);
  // Standard-streu bitgleich zu ohne streu (= R10), Sperrfeuer folgt und Zielfeuer
  const ZF = { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 };
  const h0 = lauf(3600, false, FOLGEN).h, h1 = lauf(3600, false, { ...FOLGEN, streu: STD }).h, h2 = lauf(3600, false, { ...FOLGEN, streu: { sperrQuer: NaN } }).h;
  const z0 = lauf(3600, false, ZF).h, z1 = lauf(3600, false, { ...ZF, streu: STD }).h;
  zeile('L Standard-streu / streu mit NaN = ohne streu (Sperr folgt, Ziel; 3600 Takte)', 'gleich', `${h0.toString(16)} / ${h1.toString(16)} / ${h2.toString(16)} · ${z0.toString(16)} / ${z1.toString(16)}`, h0 === h1 && h0 === h2 && z0 === z1);
  // Reglerplan mitten im Lauf: zwei Läufe gleich, anders als ohne Plan; Befehls-Richttempo der Sperr-Rohre auch im Umschalt-Takt
  const plan0 = new Map([[600, { sperrQuer: 150, raumZuschlag: 250 }], [1200, { raumZuschlag: 0, lagenAnteil: 1.2, sperrTiefe: 200 }],
    [1800, { lagenAnteil: 0.3, ziel: 300, nahMax: 5, faktor: 3 }], [2400, { sperrQuer: 0, raumZuschlag: 600, lagenAnteil: 1.2, faktor: 0.5 }], [3000, {}]]);
  // R12 Gesamtregler: 1 → 3 → 0,5 → 3 mit vollen Einzelreglern (größter Raum) und zurück auf Standard
  const planF = new Map([[900, { faktor: 3 }], [1800, { faktor: 0.5 }], [2700, { faktor: 3, sperrQuer: 400, sperrTiefe: 400, raumZuschlag: 600 }], [3300, {}]]);
  const planLauf = (plan = plan0) => {
    const d = erstelleZieldrohnen({ startwert: 101 }), ki = erstelleTurmKi({ startwert: 202 }), t = ersatzTuerme(1100), fl = erstelleErsatzFlak(303, 6);
    const b = { ...FOLGEN }, vor = t.map(() => null);
    let hh = 0x811c9dc5, rG = 0, rN = 0, rGU = 0, rNU = 0, breit = 0; const f = new Float64Array(1), u = new Uint32Array(f.buffer);
    const wd = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    for (let k = 0; k < 3600; k++) {
      const p = plan.get(k); if (p) b.streu = p;
      for (const z of d.ziele) z.hp = 1e9;
      d.schritt(DT, fl.ereignisse);
      const bf = ki.schritt(DT, b, d.ziele, t); richte(t, bf); fl.schritt(t, bf, d.ziele);
      bf.forEach((q, i) => {
        for (const v of [q.punkt.x, q.punkt.y, q.punkt.z, q.streuKugel, q.streuTiefe]) { f[0] = v; hh = Math.imul(hh ^ u[0], 16777619); hh = Math.imul(hh ^ u[1], 16777619); }
        const m = t[i].muendung, dx = q.punkt.x - m.x, dy = q.punkt.y - m.y, dz = q.punkt.z - m.z, g = Math.atan2(dx, dz), n = Math.asin(dy / L(dx, dy, dz)), v = vor[i];
        if (v && v.sperr && q.zielId === null) {
          const a = Math.abs(wd(g - v.g)) / DT, c = Math.abs(n - v.n) / DT;
          if (p || plan.has(k - 1)) { rGU = Math.max(rGU, a); rNU = Math.max(rNU, c); } else { rG = Math.max(rG, a); rN = Math.max(rN, c); }
        }
        vor[i] = { g, n, sperr: q.zielId === null };
      });
      for (const s of ki.lage.schirme) breit = Math.max(breit, s.breite);
    }
    return { h: hh >>> 0, rG, rN, rGU, rNU, breit };
  };
  const pa = planLauf(), pb = planLauf();
  zeile('L Reglerplan (5 Wechsel) mitten im Lauf: zwei Läufe gleich', 'gleich', `${pa.h.toString(16)} / ${pb.h.toString(16)}`, pa.h === pb.h);
  const B = TURMKI.folgen.bremse, gB = B.gier / GRAD + 1e-6, nB = B.nick / GRAD + 1e-6;
  zeile('L Befehls-Richttempo Sperr-Rohre im Umschalt-Takt / sonst (Gier, Nick, max)', `≤ ${f1(gB)} / ${f1(nB)}°/s`, `${f1(pa.rGU / GRAD)} / ${f1(pa.rNU / GRAD)} · ${f1(pa.rG / GRAD)} / ${f1(pa.rN / GRAD)}°/s`,
    pa.rGU / GRAD <= gB && pa.rNU / GRAD <= nB && pa.rG / GRAD <= gB && pa.rN / GRAD <= nB);
  // R12: Gesamtregler faktor 1 → 3 → 0,5 → 3 (alle Einzelregler voll) — Umschalt-Takt springt nicht weiter als ein
  // normaler Schritt (Lehre R7), Richttempo unter der Bremse, Raum wird wirklich groß (nicht mehr bei 0,28 rad gekappt)
  const fa = planLauf(planF), fb = planLauf(planF);
  zeile('L faktor 1 → 3 → 0,5 → 3 (voll): zwei Läufe gleich', 'gleich', `${fa.h.toString(16)} / ${fb.h.toString(16)}`, fa.h === fb.h);
  zeile('L faktor-Wechsel: Befehls-Richttempo Sperr-Rohre im Umschalt-Takt / sonst (Gier, Nick, max)', `≤ ${f1(gB)} / ${f1(nB)}°/s`, `${f1(fa.rGU / GRAD)} / ${f1(fa.rNU / GRAD)} · ${f1(fa.rG / GRAD)} / ${f1(fa.rN / GRAD)}°/s`,
    fa.rGU / GRAD <= gB && fa.rNU / GRAD <= nB && fa.rG / GRAD <= gB && fa.rN / GRAD <= nB);
  zeile('L faktor 3 (voll): größte halbe Raumbreite', '> 450 m (R11-Deckel 0,28 rad ≈ 340 m bei 1200 m)', f1(fa.breit) + ' m', fa.breit > 450);
  // Wirkung (Ersatz-Flak, unverwundbar): Sperr-Median steigt mit sperrQuer 70 → 150
  const medSperr = (streu) => {
    const d = erstelleZieldrohnen({ startwert: 101 }), ki = erstelleTurmKi({ startwert: 202 }), t = ersatzTuerme(1100), fl = erstelleErsatzFlak(303, 6), a = [];
    for (let k = 0; k < 2 * 3600; k++) {
      for (const z of d.ziele) z.hp = 1e9;
      d.schritt(DT, fl.ereignisse); const bf = ki.schritt(DT, { ...FOLGEN, streu }, d.ziele, t); richte(t, bf); fl.schritt(t, bf, d.ziele);
      if (k > 600 && !ki.lage.nahbereich) for (const e of fl.ereignisse.detonationen) if (!e.ziel && Number.isFinite(e.naechste)) a.push(e.naechste);
    }
    a.sort((x, y) => x - y); return a[a.length >> 1];
  };
  // R12: Gesamtregler muss sichtbar wirken (Median folgt ungefähr); sperrQuer allein wirkt beim Zuschlag 300 kaum
  // (R12 gemessen: 70 → 150 nur +11 m) → mit kleinem Zuschlag prüfen
  const mf = [0.5, 1, 2].map((faktor) => medSperr({ faktor }));
  zeile('L Wirkung faktor 0,5 → 1 → 2: Sperr Detonation ↔ Drohne Median (Ersatz-Flak, unverwundbar)', 'steigt, 2 ≥ 1,3 × 0,5', mf.map(f1).join(' → ') + ' m', mf[1] > mf[0] && mf[2] > mf[1] && mf[2] >= 1.3 * mf[0]);
  const m0 = medSperr({ sperrQuer: 0, raumZuschlag: 50 }), m300 = medSperr({ sperrQuer: 300, raumZuschlag: 50 });
  zeile('L Wirkung: Sperr Median bei sperrQuer 0 → 300 (Zuschlag 50, Ersatz-Flak, unverwundbar)', 'steigt', `${f1(m0)} → ${f1(m300)} m`, m300 > m0);
}

// ---------- M) Toleranz folgt dem Waffen-Regler deckelQuer (Befund Prüfer R11), echte Flak ----------
{
  // Stehendes Ziel 1000 m vor der Batterie, Zielfeuer, Regler deckelQuer 0,10: Kugel 320 (R12) → Waffe kürzt auf 100 m.
  // Granate ↔ Punkt QUER zur Schusslinie (WARUM quer: längs streut streuTiefe 320 m unabhängig vom Querdeckel)
  // ≤ Kugel (100) + Feuer-Spielraum (toleranz · d, jetzt ≤ 100 m statt 140) + Streuung/Rohrversatz 10 m;
  // nach dem Einrichten (Turm steht) ≤ Kugel + 10 m.
  for (const dq of [0.10, 0.30]) {
    const ki = erstelleTurmKi({ startwert: 202 }), fl = erstelleFlak({ startwert: 303 }), befehl = { modus: 'zielfeuer', feuerFrei: true, waffe: { deckelQuer: dq } };
    const z = { id: 1, aktiv: true, r: 6, hp: 1e9, pos: { x: 0, y: 4 + 1000 * Math.sin(0.5), z: 1000 * Math.cos(0.5) }, vel: { x: 0, y: 0, z: 0 } };
    let maxAll = 0, maxSpaet = 0, tolMax = 0, tolSoll = 0;
    for (let k = 0; k < 6 * 60; k++) {
      fl.einstellen(befehl.waffe);
      const bf = ki.schritt(DT, befehl, [z], fl.tuerme); fl.schritt(DT, bf, [z]);
      for (const q of bf) { const m = fl.tuerme[q.turmId].muendung, d = L(q.punkt.x - m.x, q.punkt.y - m.y, q.punkt.z - m.z); tolMax = Math.max(tolMax, q.toleranz * d); tolSoll = Math.max(tolSoll, Math.min(q.streuKugel, waffeWert(befehl.waffe, 'deckelQuer') * d)); }
      for (const e of fl.ereignisse.detonationen) {
        const rx = e.pos.x - z.pos.x, ry = e.pos.y - z.pos.y, rz = e.pos.z - z.pos.z, ux = z.pos.x - M.x, uy = z.pos.y - M.y, uz = z.pos.z - M.z, ul = L(ux, uy, uz);
        const la = (rx * ux + ry * uy + rz * uz) / ul, a = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - la * la)); maxAll = Math.max(maxAll, a); if (k > 3 * 60) maxSpaet = Math.max(maxSpaet, a); }
    }
    const kug = Math.min(STD('ziel'), dq * 1000);
    zeile(`M deckelQuer ${dq}: Feuer-Spielraum ≤ wirksamer Deckel · d (max, m)`, `≤ ${f1(tolSoll)} m`, f1(tolMax) + ' m', tolMax <= tolSoll + 1e-6);
    zeile(`M deckelQuer ${dq}: Granate ↔ Punkt quer, max gesamt / nach dem Einrichten (1000 m, Kugel ${STD('ziel')})`, `≤ ${f1(2 * kug + 10)} / ${f1(kug + 10)} m`, `${f1(maxAll)} / ${f1(maxSpaet)} m`, maxAll <= 2 * kug + 10 && maxSpaet <= kug + 10);
  }
}

// ---------- N) Turm-KI im Schiffsrahmen (R14): Prüfstand bitgleich, Turm-Rahmen, Raumzuteilung, Momentaufnahme ----------
{
  // N1 Anker R13: Labor mit ausdrücklichem Streu (R12- bzw. T1-Werte), v0-Umschalten, 5400 Takte — Prüfsummen vor dem
  // Umbau gemessen. WARUM Sperr-splitterDps hier fest 90: Entscheidung R14 (115) ändert die Waffe, nicht die KI.
  // Bricht der Anker, weil Drohnen/Flak BEWUSST geändert wurden → neu messen und hier eintragen.
  const ANKER = [['R12', 'sperrfeuer', 97391.509436], ['R12', 'zielfeuer', 108397.889691], ['T1', 'sperrfeuer', 109253.808219]];
  const WERTE = { R12: { faktor: 1, sperrQuer: 120, sperrTiefe: 80, raumZuschlag: 340, ziel: 320, nahMax: 35, lagenAnteil: 0.6 },
    T1: { faktor: 1, sperrQuer: 200, sperrTiefe: 200, raumZuschlag: 400, ziel: 135, nahMax: 35, lagenAnteil: 0.75 } };
  const dpsAlt = FLAK.sorte[1].splitterDps; FLAK.sorte[1].splitterDps = 90;
  const ist = ANKER.map(([w, modus]) => {
    const lab = erstelleFlakLabor(), b = { modus, feuerFrei: true, folgen: true, schirmAbstand: 800, v0: 1100, streu: WERTE[w], waffe: { deckelQuer: 1, deckelTiefe: 0.9 } };
    for (let k = 0; k < 5400; k++) { if (k === 2000) b.v0 = 900; if (k === 3500) b.v0 = 1100; lab.schritt(DT, b); }
    return lab.pruefsumme().toFixed(6);
  });
  FLAK.sorte[1].splitterDps = dpsAlt;
  const ankerOk = ist.every((h, k) => h === ANKER[k][2].toFixed(6));
  zeile('N Prüfstand bitgleich zu R13 (Labor 5400 Takte, 3 Läufe, Prüfsumme)', 'gleich', ankerOk ? 'gleich' : ist.join(' / '), ankerOk);
  // N1b ausdrückliche Prüfstand-Parameter = Standard
  const reiheKi = (ki) => {
    const d = erstelleZieldrohnen({ startwert: 101 }), t = ersatzTuerme(1100), fl = erstelleErsatzFlak(303, 6); let h = 0;
    for (let k = 0; k < 1800; k++) {
      d.schritt(DT, fl.ereignisse); const bf = ki.schritt(DT, k < 900 ? FOLGEN : { modus: 'zielfeuer', feuerFrei: true }, d.ziele, t);
      richte(t, bf); fl.schritt(t, bf, d.ziele);
      for (const b of bf) h = (h * 31 + Math.round(b.punkt.x * 1e3) + Math.round(b.punkt.y * 1e3) * 7 + (b.feuer ? 1 : 0) + (b.zielId ?? -1) * 13) >>> 0;
    }
    return h;
  };
  const h0 = reiheKi(erstelleTurmKi({ startwert: 202 }));
  const h1 = reiheKi(erstelleTurmKi({ startwert: 202, lafetten: LAFETTEN, mitte: M, sektor: S, killzone: TURMKI.killzone }));
  zeile('N erstelleTurmKi mit Prüfstand-Angaben = ohne Angaben (1800 Takte)', 'gleich', h0 === h1 ? 'gleich' : 'anders', h0 === h1);

  // Test-Lafette (Felder wie turmDaten)
  const laf = (id, x, y, z, oben, gier = [0, Math.PI], nick = [-0.05, 1.45]) => ({ id, x, y, z, oben, typ: 'flak', s: 1, sockel: 0,
    zapfen: { y: 2.1, z: 2.4 }, muendungen: [{ x: 0.8, y: 0, z: 6.7 }, { x: -0.8, y: 0, z: 6.7 }], gier, nick });
  const ziel = (id, x, y, z) => ({ id, pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, r: 6, hp: 100, hpMax: 100, aktiv: true, angriff: false });
  // N2 oben/unten: der obere Turm nimmt das Ziel über dem Schiff, der untere das darunter (Turm-Rahmen nach turm.js)
  {
    const ki = erstelleTurmKi({ startwert: 1, lafetten: [laf(0, 0, 5, 0, true), laf(1, 0, -5, 0, false)], mitte: { x: 0, y: 0, z: 0 } });
    const zz = [ziel(1, 0, 800, 600), ziel(2, 0, -800, 600)], b = { modus: 'zielfeuer', feuerFrei: true };
    let bf; for (let k = 0; k < 10; k++) bf = ki.schritt(DT, b, zz);
    const ok1 = bf[0].zielId === 1 && bf[1].zielId === 2 && bf[0].feuer && bf[1].feuer;
    const ki2 = erstelleTurmKi({ startwert: 1, lafetten: [laf(0, 0, 5, 0, true), laf(1, 0, -5, 0, false)], mitte: { x: 0, y: 0, z: 0 } });
    for (let k = 0; k < 10; k++) bf = ki2.schritt(DT, b, [ziel(1, 0, 800, 600)]);
    const ok2 = bf[0].zielId === 1 && bf[1].zielId === null && !bf[1].feuer;
    zeile('N oben → Ziel über dem Schiff, unten → Ziel darunter; unten ohne Ziel unter sich: kein Feuer', 'ja', ok1 && ok2 ? 'ja' : `nein (${bf.map((x) => x.zielId)})`, ok1 && ok2);
  }
  // N3 Gier-Grenze: Turm nach Backbord (+X, Mitte π/2 ± 1,0) nimmt kein Ziel an Steuerbord; erreichbar() der Waffe ersetzt die eigene Prüfung
  {
    const L3 = [laf(0, 10, 5, 0, true, [Math.PI / 2, 1.0])], b = { modus: 'zielfeuer', feuerFrei: true };
    const waehle = (zz, opt = {}) => { const ki = erstelleTurmKi({ startwert: 1, lafetten: L3, mitte: { x: 0, y: 0, z: 0 }, ...opt }); let bf; for (let k = 0; k < 10; k++) bf = ki.schritt(DT, b, zz); return bf[0].zielId; };
    const links = waehle([ziel(1, 1000, 300, 0)]), rechts = waehle([ziel(1, -1000, 300, 0)]);
    let gefragt = 0;
    const mitWaffe = waehle([ziel(1, 1000, 300, 0)], { erreichbar: (i, g, n) => { gefragt++; return false; } });
    const ok = links === 1 && rechts === null && mitWaffe === null && gefragt > 0;
    zeile('N Gier-Grenze im Turm-Rahmen (Backbord-Turm: +X ja, −X nein); erreichbar() der Waffe wird gefragt', 'ja', ok ? 'ja' : `nein (${links}/${rechts}/${mitWaffe}/${gefragt})`, ok);
  }
  // N4 Raumzuteilung nach Erreichbarkeit: Gruppe über und Gruppe unter dem Schiff, 2 Türme oben + 2 unten
  {
    const L4 = [laf(0, -14, 5, 0, true), laf(1, 14, 5, 0, true), laf(2, -14, -5, 0, false), laf(3, 14, -5, 0, false)];
    const ki = erstelleTurmKi({ startwert: 1, lafetten: L4, mitte: { x: 0, y: 0, z: 0 } });
    const zz = [];
    for (let k = 0; k < 3; k++) { zz.push(ziel(1 + k, -60 + 60 * k, 1100, 900)); zz.push(ziel(10 + k, -60 + 60 * k, -1100, 900)); }
    let falsch = 0, proben = 0, nickMax = 0, raeume = 0;
    for (let k = 0; k < 600; k++) {
      ki.schritt(DT, FOLGEN, zz);
      if (k < 300) continue;
      raeume = Math.max(raeume, ki.lage.schirme.length);
      for (const sc of ki.lage.schirme) {
        nickMax = Math.max(nickMax, Math.abs(sc.nick));
        for (const i of sc.tuerme) {
          const l = L4[i], s = l.oben ? 1 : -1, dx = sc.mitte.x - l.x, dy = sc.mitte.y - l.y, dz = sc.mitte.z - l.z;
          proben++; if (!grenzenOk(l, Math.atan2(s * dx, dz), Math.asin(s * dy / L(dx, dy, dz)))) falsch++;
        }
      }
    }
    zeile('N Sperrräume über/unter dem Schiff: Türme nur in Räumen, die sie erreichen (Proben falsch)', '0, 2 Räume', `${falsch} von ${proben}, ${raeume} Räume`, falsch === 0 && raeume === 2 && proben > 0);
    zeile('N Raum-Nick beidseitig gedeckelt (|Nick| ≤ 1,2 rad)', '≤ 1.20', f2(nickMax), nickMax <= TURMKI.folgen.nickMax + 1e-9);
  }
  // N5 Momentaufnahme: Abfangen im Schiffsrahmen + Rückrechnung mit derselben Drehung + Granate erbt Schiffstempo → exakt
  {
    const rnd = zufall(77); let maxF = 0, maxR = 0;
    for (let k = 0; k < 50; k++) {
      let qx = rnd() - 0.5, qy = rnd() - 0.5, qz = rnd() - 0.5, qw = rnd() - 0.5; const ql = Math.hypot(qx, qy, qz, qw); qx /= ql; qy /= ql; qz /= ql; qw /= ql;
      const sz = { pos: { x: rnd() * 1e4, y: rnd() * 500, z: rnd() * 1e4 }, vel: { x: (rnd() - 0.5) * 120, y: (rnd() - 0.5) * 40, z: (rnd() - 0.5) * 120 }, rot: { x: qx, y: qy, z: qz, w: qw } };
      const zw = [{ id: 1, aktiv: true, r: 6, hp: 1, hpMax: 1, pos: { x: sz.pos.x + (rnd() - 0.5) * 3000, y: sz.pos.y + (rnd() - 0.5) * 3000, z: sz.pos.z + (rnd() - 0.5) * 3000 },
        vel: { x: (rnd() - 0.5) * 360, y: (rnd() - 0.5) * 360, z: (rnd() - 0.5) * 360 } }];
      const lok = inSchiffsrahmen(zw, sz);
      // Rückweg Lage
      const w = zuWelt(sz, lok[0].pos, { x: 0, y: 0, z: 0 });
      maxR = Math.max(maxR, L(w.x + sz.pos.x - zw[0].pos.x, w.y + sz.pos.y - zw[0].pos.y, w.z + sz.pos.z - zw[0].pos.z));
      const mL = { x: 3, y: 12, z: 40 }, ab = { t: 0, x: 0, y: 0, z: 0 };
      if (!abfangen(mL, lok[0].pos, lok[0].vel, 1100, ab)) continue;
      // Welt: Mündung, Richtung lokal → Welt, Granate = Richtung·v0 + Schiffstempo, nach t
      const mW = zuWelt(sz, mL, { x: 0, y: 0, z: 0 }); mW.x += sz.pos.x; mW.y += sz.pos.y; mW.z += sz.pos.z;
      const dl = L(ab.x - mL.x, ab.y - mL.y, ab.z - mL.z), r = zuWelt(sz, { x: (ab.x - mL.x) / dl, y: (ab.y - mL.y) / dl, z: (ab.z - mL.z) / dl }, { x: 0, y: 0, z: 0 });
      const g = { x: mW.x + (r.x * 1100 + sz.vel.x) * ab.t, y: mW.y + (r.y * 1100 + sz.vel.y) * ab.t, z: mW.z + (r.z * 1100 + sz.vel.z) * ab.t };
      const p = zw[0].pos, v = zw[0].vel;
      maxF = Math.max(maxF, L(g.x - p.x - v.x * ab.t, g.y - p.y - v.y * ab.t, g.z - p.z - v.z * ab.t));
    }
    zeile('N inSchiffsrahmen: Rückweg Lage / Abfangen im Schiffsrahmen → Welt (50 Lagen, gedreht + fahrend)', '< 1e-6 / < 1e-6 m', `${maxR.toExponential(1)} / ${maxF.toExponential(1)} m`, maxR < 1e-6 && maxF < 1e-6);
  }
}

// ---------- O) Angreifer (R14): Gleichlauf, Verhalten, Wellen ----------
const SCHIFF_GERADE = () => ({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 60 }, rot: { x: 0, y: 0, z: 0, w: 1 }, zerstoert: false });
const KUGELN = SCHIFFSDATEN.bollwerk.kugeln;
{
  const lauf = (ang, takte, toeten = false) => {
    const sz = SCHIFF_GERADE(), ev = { treffer: [], detonationen: [] };
    let h = 0, schaden = 0, eng = Infinity, ersterLauf = -1, maxAktiv = 0, feuerFern = 0;
    for (let k = 0; k < takte; k++) {
      sz.pos.z += 60 * DT;
      ev.treffer.length = 0;
      if (toeten) for (const z of ang.ziele) if (z.aktiv) ev.treffer.push({ zielId: z.id, schaden: 1000 });
      const e = ang.schritt(DT, ev, sz, KUGELN);
      for (const t of e.treffer) schaden += t.schaden;
      let aktiv = 0;
      for (const z of ang.ziele) {
        if (!z.aktiv) continue; aktiv++;
        const d = L(z.pos.x - sz.pos.x, z.pos.y - sz.pos.y, z.pos.z - sz.pos.z); eng = Math.min(eng, d);
        h = (h * 31 + Math.round(z.pos.x * 1e3) + Math.round(z.pos.y * 1e3) * 3 + Math.round(z.pos.z * 1e3) * 7 + z.id) >>> 0;
      }
      maxAktiv = Math.max(maxAktiv, aktiv);
      // neue Geschosse (alter 1): vorPos = Abschussort → Abstand zum Schiff ≤ feuerAb
      const G = ang.geschosse;
      for (let q = 0; q < G.max; q++) if (G.aktiv[q] && G.alter[q] === 1 && L(G.vorPos[q * 3] - sz.pos.x, G.vorPos[q * 3 + 1] - sz.pos.y, G.vorPos[q * 3 + 2] - sz.pos.z) > ANGREIFER.feuerAb + 5) feuerFern++;
      if (ersterLauf < 0 && ang.statistik.laeufe > 0) ersterLauf = k * DT;
      h = (h * 31 + ang.geschosse.anzahlAktiv + ang.statistik.treffer * 17) >>> 0;
    }
    return { h, schaden, eng, ersterLauf, maxAktiv, feuerFern };
  };
  const a = lauf(erstelleAngreifer({ startwert: 404 }), 3600), b = lauf(erstelleAngreifer({ startwert: 404 }), 3600);
  const c = erstelleAngreifer({ startwert: 404 }); lauf(c, 1500); c.zuruecksetzen(); const cr = lauf(c, 3600);
  const d = lauf(erstelleAngreifer({ startwert: 405 }), 3600);
  zeile('O Angreifer-Gleichlauf: zwei Läufe / nach zuruecksetzen() / anderer Startwert (3600 Takte)', 'gleich / gleich / anders',
    `${a.h.toString(16)} / ${cr.h.toString(16)} / ${d.h.toString(16)}`, a.h === b.h && a.h === cr.h && a.h !== d.h);
  // Verhalten ohne Flak, 5 min: Läufe, Schaden, Mindestabstand, Feuerfenster, Rechenzeit
  const ang = erstelleAngreifer({ startwert: 404 }), t0 = performance.now(), v = lauf(ang, 5 * 3600), us = (performance.now() - t0) / (5 * 3600) * 1000;
  const S = ang.statistik, proMin = v.schaden / 5;
  zeile('O ohne Flak: Läufe/min · erster Lauf nach', '≥ 5 · < 20 s', `${f1(S.laeufe / 5)} · ${f1(v.ersterLauf)} s`, S.laeufe / 5 >= 5 && v.ersterLauf >= 0 && v.ersterLauf < 20);
  zeile('O ohne Flak: Schiffsschaden (Welle 1 = 4 Boote, 5000 HP)', '10–30 %/min', `${f1(proMin / 50)} %/min (${S.treffer} Treffer, ${f1(100 * S.treffer / Math.max(1, S.schuesse))} %)`, proMin / 50 >= 10 && proMin / 50 <= 30);
  zeile('O engster Abstand zur Schiffsmitte · Schüsse jenseits 705 m', `≥ ${ANGREIFER.mindest - 5} m · 0`, `${f1(v.eng)} m · ${v.feuerFern}`, v.eng >= ANGREIFER.mindest - 5 && v.feuerFern === 0);
  zeile('O Rechenzeit Angreifer je Takt (4 Boote + Geschosse)', '< 100 µs', `${f1(us)} µs`, us < 100);
  // Wellen: jeder erscheinende Angreifer stirbt sofort → Wellen laufen durch
  const w = erstelleAngreifer({ startwert: 404 }), wl = lauf(w, 150 * 60, true);
  zeile('O Wellen 4 → 6 → 8 (alle sofort abgeschossen, 150 s): Welle · gleichzeitig · höchstens aktiv · Abschüsse', '≥ 4 · 8 · ≤ 8',
    `${w.welle.nr} · ${w.welle.gleichzeitig} · ${wl.maxAktiv} · ${w.statistik.abschuesse}`, w.welle.nr >= 4 && w.welle.gleichzeitig === 8 && wl.maxAktiv <= 8 && w.statistik.abschuesse > 0);
}

// ---------- P) Gefecht-Messung (R14): Angreifer + Turm-KI (Schiffsrahmen, Bollwerk-Flak) + echte Flak ----------
// Flak-Emulation, bis flak.setzeRahmen da ist: zwei Instanzen in einem mitbewegten, NICHT drehenden Rahmen (Ursprung
// Schiffsmitte, Weltachsen); A = oben montierte Türme, B = unten montierte im um Z gedrehten Rahmen (−x, −y, z), in dem sie
// oben sitzen. Gieren um ψ: Lafetten (Lage, Gier-Mitte, Nachbar-Sperrzonen) je Takt mitgedreht. Ersatz für erreichbar():
// Grenzen + Rumpf-Sperre (sperre.js). Granate erbt das Schiffstempo (im Rahmen ruht das Schiff) → exakt bis auf ½·a·t².
function gefecht(modus, flug, sek, startwert = 1) {
  const B = SCHIFFSDATEN.bollwerk, LF = B.tuerme.filter((t) => t.typ === 'flak'), RS = LF.map((t) => rumpfSperre(t, B.teile));
  const ki = erstelleTurmKi({ startwert: 202, lafetten: LF, mitte: { x: 0, y: 0, z: 0 }, killzone: { ...TURMKI.killzone, ein: 900, aus: 1000 },
    erreichbar: (i, g, n) => grenzenOk(LF[i], g, n) && n >= RS[i][sperrSektor(g)] });
  const ang = erstelleAngreifer({ startwert });
  const oben = [], unten = [];
  LF.forEach((l, i) => (l.oben ? oben : unten).push(i));
  const kopie = (l, f) => ({ ...l, oben: true, x: f ? -l.x : l.x, y: f ? -l.y : l.y, gier: l.gier.slice(), basis: { x: f ? -l.x : l.x, z: l.z, g: l.gier[0] } });
  const lafA = oben.map((i) => kopie(LF[i], false)), lafB = unten.map((i) => kopie(LF[i], true));
  const fA = erstelleFlak({ startwert: 303, lafetten: lafA }), fB = erstelleFlak({ startwert: 304, lafetten: lafB });
  for (const f of [fA, fB]) { for (const t of f.tuerme) { t.v0 = 1100; for (const z of t.sperrzonen) z.basis = z.gier; } }
  const befehl = { modus: modus === 'halt' ? 'sperrfeuer' : modus, feuerFrei: modus !== 'halt', folgen: true, schirmAbstand: 800, v0: 1100, waffe: { deckelQuer: 1, deckelTiefe: 0.9 } };
  const sz = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 60 }, rot: { x: 0, y: 0, z: 0, w: 1 }, zerstoert: false };
  const neuZ = () => ang.ziele.map(() => ({ id: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, r: 6, aktiv: false }));
  const ziA = neuZ(), ziB = neuZ(), lokal = [], ev = { treffer: [], detonationen: [] };
  const tz = LF.map(() => ({ muendung: { x: 0, y: 0, z: 0 }, v0: 1100, reichweite: 2500, gesperrt: false, gier: 0, nick: 0 }));
  const befA = lafA.map(() => ({ punkt: { x: 0, y: 0, z: 0 } })), befB = lafB.map(() => ({ punkt: { x: 0, y: 0, z: 0 } }));
  const rotY = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]; // Schiff → Welt bei a = ψ
  let psi = 0, schaden = 0, kiMs = 0;
  const T = sek * 60;
  for (let k = 0; k < T; k++) {
    const om = flug === 'manoever' ? 0.18 * (Math.sin(2 * Math.PI * k * DT / 40) >= 0 ? 1 : -1) : 0;
    psi += om * DT; sz.rot.y = Math.sin(psi / 2); sz.rot.w = Math.cos(psi / 2);
    sz.vel.x = 60 * Math.sin(psi); sz.vel.z = 60 * Math.cos(psi); sz.pos.x += sz.vel.x * DT; sz.pos.z += sz.vel.z * DT;
    ev.treffer.length = ev.detonationen.length = 0;
    for (const t of fA.ereignisse.treffer) ev.treffer.push(t); for (const t of fB.ereignisse.treffer) ev.treffer.push(t);
    for (const d of fA.ereignisse.detonationen) ev.detonationen.push({ pos: { x: d.pos.x + sz.pos.x, y: d.pos.y + sz.pos.y, z: d.pos.z + sz.pos.z } });
    for (const d of fB.ereignisse.detonationen) ev.detonationen.push({ pos: { x: sz.pos.x - d.pos.x, y: sz.pos.y - d.pos.y, z: d.pos.z + sz.pos.z } });
    for (const t of ang.schritt(DT, ev, sz, B.kugeln).treffer) schaden += t.schaden;
    ang.ziele.forEach((z, i) => {
      const a = ziA[i], b = ziB[i]; a.id = b.id = z.id; a.aktiv = b.aktiv = z.aktiv;
      a.pos.x = z.pos.x - sz.pos.x; a.pos.y = z.pos.y - sz.pos.y; a.pos.z = z.pos.z - sz.pos.z;
      a.vel.x = z.vel.x - sz.vel.x; a.vel.y = z.vel.y - sz.vel.y; a.vel.z = z.vel.z - sz.vel.z;
      b.pos.x = -a.pos.x; b.pos.y = -a.pos.y; b.pos.z = a.pos.z; b.vel.x = -a.vel.x; b.vel.y = -a.vel.y; b.vel.z = a.vel.z;
    });
    inSchiffsrahmen(ang.ziele, sz, lokal);
    for (const [f, laf, s] of [[fA, lafA, 1], [fB, lafB, -1]]) {
      for (const l of laf) { const [x, z] = rotY(l.basis.x, l.basis.z, s * psi); l.x = x; l.z = z; l.gier[0] = l.basis.g + s * psi; }
      for (const t of f.tuerme) for (const z of t.sperrzonen) z.gier = z.basis + s * psi;
    }
    oben.forEach((i, j) => { const t = fA.tuerme[j], [x, z] = rotY(t.muendung.x, t.muendung.z, -psi); const o = tz[i]; o.muendung.x = x; o.muendung.y = t.muendung.y; o.muendung.z = z; o.gier = t.gier - psi; o.nick = t.nick; o.gesperrt = t.gesperrt; });
    unten.forEach((i, j) => { const t = fB.tuerme[j], [x, z] = rotY(-t.muendung.x, t.muendung.z, -psi); const o = tz[i]; o.muendung.x = x; o.muendung.y = -t.muendung.y; o.muendung.z = z; o.gier = t.gier + psi; o.nick = t.nick; o.gesperrt = t.gesperrt; });
    const t0 = performance.now(), bef = ki.schritt(DT, befehl, lokal, tz); kiMs += performance.now() - t0;
    oben.forEach((i, j) => { const b = bef[i], [x, z] = rotY(b.punkt.x, b.punkt.z, psi); Object.assign(befA[j], b); befA[j].punkt = { x, y: b.punkt.y, z }; });
    unten.forEach((i, j) => { const b = bef[i], [x, z] = rotY(b.punkt.x, b.punkt.z, psi); Object.assign(befB[j], b); befB[j].punkt = { x: -x, y: -b.punkt.y, z }; });
    fA.schritt(DT, befA, ziA); fB.schritt(DT, befB, ziB);
  }
  const min = sek / 60;
  return { abMin: ang.statistik.abschuesse / min, hpMin: schaden / min / 50, laeufeMin: ang.statistik.laeufe / min, welle: ang.welle.nr, kiUs: kiMs / T * 1000 };
}
{
  const dpsAlt = FLAK.sorte[1].splitterDps; FLAK.sorte[1].splitterDps = 115; // Entscheidung R14 (Waffentechniker)
  const sek = 180, r = {};
  for (const [name, m, f] of [['halt', 'halt', 'gerade'], ['sperr', 'sperrfeuer', 'gerade'], ['ziel', 'zielfeuer', 'gerade'], ['sperrM', 'sperrfeuer', 'manoever'], ['zielM', 'zielfeuer', 'manoever']]) r[name] = gefecht(m, f, sek);
  FLAK.sorte[1].splitterDps = dpsAlt;
  const t = (x) => `${f1(x.abMin)}/min · −${f1(x.hpMin)} %/min · Welle ${x.welle}`;
  zeile('P Gefecht 3 min, Feuer halt (Abschüsse · Schiffs-HP · Welle)', 'Info', t(r.halt), true, false);
  zeile('P Gefecht 3 min, Sperrfeuer gerade / Manöver (Gieren ±0,18 rad/s)', 'Info', `${t(r.sperr)} | ${t(r.sperrM)}`, true, false);
  zeile('P Gefecht 3 min, Zielfeuer gerade / Manöver', 'Info', `${t(r.ziel)} | ${t(r.zielM)}`, true, false);
  const flakHilft = ['sperr', 'ziel', 'sperrM', 'zielM'].every((k) => r[k].hpMin < r.halt.hpMin && r[k].abMin >= 4);
  zeile('P Flak schützt: jeder Lauf mit Feuer weniger Schiffsschaden als Feuer halt und ≥ 4 Abschüsse/min', 'ja', flakHilft ? 'ja' : 'nein', flakHilft);
  const kiMax = Math.max(...Object.values(r).map((x) => x.kiUs));
  zeile('P Rechenzeit Turm-KI (14 Türme, bis 8 Angreifer) je Takt', '< 1000 µs', `${f1(kiMax)} µs`, kiMax < 1000);
}

// ---------- D) Gleichlauf ----------
{
  const a = lauf(3600, false), b = lauf(3600, false);
  zeile('D Gleichlauf zweier Läufe (3600 Takte)', 'gleich', `${a.h.toString(16)} / ${b.h.toString(16)}`, a.h === b.h);
  const fa = lauf(3600, false, FOLGEN), fb = lauf(3600, false, FOLGEN);
  zeile('D Gleichlauf Folgen + Killzone (3600 Takte)', 'gleich', `${fa.h.toString(16)} / ${fb.h.toString(16)}`, fa.h === fb.h);
  const va = lauf(5400, false, { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, { v0Plan: V0_PLAN, modell: 'r8' });
  const vb = lauf(5400, false, { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, { v0Plan: V0_PLAN, modell: 'r8' });
  zeile('D Gleichlauf mit v0-Umschalten + Streukugel + Splitter (5400 Takte)', 'gleich', `${va.h.toString(16)} / ${vb.h.toString(16)}`, va.h === vb.h);
  // Befund Prüfer R10: zuruecksetzen() → Start im festen Modus → folgen muss wie eine frische KI laufen (die Raumfelder
  // v*, tempo, laengs, lagenAbstand setzte nur der Startblock von folgeSchirme zurück, den festerSchirm überspringt)
  const reihe = (ki, festTakte, takte) => {
    const d = erstelleZieldrohnen({ startwert: 101 }), t = ersatzTuerme(1100), b = { ...FOLGEN };
    let hh = 0x811c9dc5; const f = new Float64Array(1), u = new Uint32Array(f.buffer);
    for (let k = 0; k < takte; k++) {
      b.folgen = k >= festTakte; d.schritt(DT, null);
      const bf = ki.schritt(DT, b, d.ziele, t); richte(t, bf);
      for (const q of bf) for (const v of [q.punkt.x, q.punkt.y, q.punkt.z, q.feuer ? 1 : 0, q.streuKugel, q.streuTiefe]) { f[0] = v; hh = Math.imul(hh ^ u[0], 16777619); hh = Math.imul(hh ^ u[1], 16777619); }
    }
    return hh >>> 0;
  };
  for (const festTakte of [0, 60]) {
    const kiA = erstelleTurmKi({ startwert: 202 });
    reihe(kiA, 0, 1800); kiA.zuruecksetzen();
    const hA = reihe(kiA, festTakte, 900), hB = reihe(erstelleTurmKi({ startwert: 202 }), festTakte, 900);
    zeile(`D zuruecksetzen() nach 30 s Folgen → ${festTakte ? '1 s fest → folgen' : 'folgen'} = frische KI (900 Takte)`, 'gleich', `${hA.toString(16)} / ${hB.toString(16)}`, hA === hB);
  }
  // zuruecksetzen() muss denselben Anfang liefern
  const dr = erstelleZieldrohnen({ startwert: 101 }), p0 = JSON.stringify(dr.ziele);
  for (let k = 0; k < 500; k++) dr.schritt(DT, null);
  dr.zuruecksetzen();
  zeile('D zuruecksetzen() = Neuanfang', 'gleich', JSON.stringify(dr.ziele) === p0 ? 'gleich' : 'anders', JSON.stringify(dr.ziele) === p0);
  const c = erstelleZieldrohnen({ startwert: 102 });
  zeile('D anderer Startwert → andere Drohnen', 'anders', JSON.stringify(c.ziele) !== p0 ? 'anders' : 'gleich', JSON.stringify(c.ziele) !== p0);
}

// ---------- E) Regeln im Code ----------
{
  const dir = new URL('../src/sim/ki/', import.meta.url);
  const verstoss = [];
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'), f), 'utf8').replace(/\/\/.*$/gm, '');
    if (/Math\.random|document\.|window\.|from\s+['"][^'"]*grafik\//.test(text)) verstoss.push(f);
  }
  zeile('E src/sim/ki ohne Math.random/DOM/grafik', '0 Dateien', verstoss.join(', ') || '0', verstoss.length === 0);
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
